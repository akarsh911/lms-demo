package http

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	"github.com/Harbour-Emerge/emerge-core/internal/data/filter"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entday "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/attendanceday"
	entmark "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/attendanceperiod"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
	entsection "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/section"
	entsubjenroll "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentsubjectenrollment"
	entoffering "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/subjectoffering"
	entdeviation "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetabledeviation"
	entslot "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetableslot"
	"github.com/Harbour-Emerge/emerge-core/internal/service/timetable"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

const (
	attendanceReasonRunes = 64
	maxRegisterEntries    = 400

	markNotFound = "attendance mark not found"
	dayNotFound  = "attendance day not found"

	attendanceStatusValues = "status must be present, absent, late or excused"
	attendanceSourceValues = "source must be manual, import or device"
)

type attendancePeriodPayload struct {
	Status     *string `json:"status"`
	ReasonCode *string `json:"reason_code"`
	Remarks    *string `json:"remarks"`
	Source     *string `json:"source"`
}

type attendanceDayPayload struct {
	StudentID       *uuid.UUID `json:"student_id"`
	SectionID       *uuid.UUID `json:"section_id"`
	AttendanceDate  *string    `json:"attendance_date"`
	ForenoonStatus  *string    `json:"forenoon_status"`
	AfternoonStatus *string    `json:"afternoon_status"`
	ReasonCode      *string    `json:"reason_code"`
	Remarks         *string    `json:"remarks"`
	Source          *string    `json:"source"`
}

type registerEntryPayload struct {
	StudentID  *uuid.UUID `json:"student_id"`
	Status     *string    `json:"status"`
	ReasonCode *string    `json:"reason_code"`
	Remarks    *string    `json:"remarks"`
}

type registerPayload struct {
	SubjectOfferingID *uuid.UUID             `json:"subject_offering_id"`
	PeriodID          *uuid.UUID             `json:"period_id"`
	AttendanceDate    *string                `json:"attendance_date"`
	Source            *string                `json:"source"`
	Entries           []registerEntryPayload `json:"entries"`
}

func attendanceStatus(w http.ResponseWriter, raw string) (entmark.Status, bool) {
	status := entmark.Status(raw)
	if err := entmark.StatusValidator(status); err != nil {
		response.Error(w, http.StatusBadRequest, attendanceStatusValues)
		return "", false
	}
	return status, true
}

func attendanceSource(w http.ResponseWriter, raw *string) (entmark.Source, bool) {
	if raw == nil {
		return entmark.DefaultSource, true
	}
	source := entmark.Source(*raw)
	if err := entmark.SourceValidator(source); err != nil {
		response.Error(w, http.StatusBadRequest, attendanceSourceValues)
		return "", false
	}
	return source, true
}

func attendanceDaySource(w http.ResponseWriter, raw *string) (entday.Source, bool) {
	if raw == nil {
		return entday.DefaultSource, true
	}
	source := entday.Source(*raw)
	if err := entday.SourceValidator(source); err != nil {
		response.Error(w, http.StatusBadRequest, attendanceSourceValues)
		return "", false
	}
	return source, true
}

func forenoonStatus(w http.ResponseWriter, raw string) (entday.ForenoonStatus, bool) {
	status := entday.ForenoonStatus(raw)
	if err := entday.ForenoonStatusValidator(status); err != nil {
		response.Error(w, http.StatusBadRequest, "forenoon_"+attendanceStatusValues)
		return "", false
	}
	return status, true
}

func afternoonStatus(w http.ResponseWriter, raw string) (entday.AfternoonStatus, bool) {
	status := entday.AfternoonStatus(raw)
	if err := entday.AfternoonStatusValidator(status); err != nil {
		response.Error(w, http.StatusBadRequest, "afternoon_"+attendanceStatusValues)
		return "", false
	}
	return status, true
}

func attendanceReason(w http.ResponseWriter, reason *string) bool {
	if reason == nil {
		return true
	}
	return withinRunes(w, entmark.FieldReasonCode, *reason, attendanceReasonRunes)
}

type attendancePeriodFilters struct {
	StudentID         *uuid.UUID
	SubjectOfferingID *uuid.UUID
	PeriodID          *uuid.UUID
	TimetableSlotID   *uuid.UUID
	AcademicSessionID *uuid.UUID
	Status            *entmark.Status
	From              *time.Time
	To                *time.Time

	Limit  int
	Offset int
}

func parseDateWindow(p *filter.Params) (*time.Time, *time.Time, error) {
	rawFrom, rawTo := p.String("from"), p.String("to")

	from, err := parseDate(&rawFrom)
	if err != nil {
		return nil, nil, errors.New("from must be a date as YYYY-MM-DD")
	}
	to, err := parseDate(&rawTo)
	if err != nil {
		return nil, nil, errors.New("to must be a date as YYYY-MM-DD")
	}
	if from != nil && to != nil && to.Before(*from) {
		return nil, nil, errors.New("to must not precede from")
	}
	return from, to, nil
}

func parseAttendancePeriodFilters(values url.Values) (attendancePeriodFilters, error) {
	p := filter.New(values)

	f := attendancePeriodFilters{
		StudentID:         p.UUID("student_id"),
		SubjectOfferingID: p.UUID("subject_offering_id"),
		PeriodID:          p.UUID("period_id"),
		TimetableSlotID:   p.UUID("timetable_slot_id"),
		AcademicSessionID: p.UUID("academic_session_id"),
	}
	f.Limit, f.Offset = p.Page(DefaultPageSize, MaxPageSize)

	if raw := p.Enum("status", func(v string) error {
		return entmark.StatusValidator(entmark.Status(v))
	}); raw != nil {
		status := entmark.Status(*raw)
		f.Status = &status
	}

	from, to, err := parseDateWindow(p)
	if err != nil {
		return attendancePeriodFilters{}, err
	}
	f.From, f.To = from, to

	if err := p.Err(); err != nil {
		return attendancePeriodFilters{}, err
	}
	return f, nil
}

func (f attendancePeriodFilters) apply(q *tenantent.AttendancePeriodQuery) *tenantent.AttendancePeriodQuery {
	if f.StudentID != nil {
		q = q.Where(entmark.StudentID(*f.StudentID))
	}
	if f.SubjectOfferingID != nil {
		q = q.Where(entmark.SubjectOfferingID(*f.SubjectOfferingID))
	}
	if f.PeriodID != nil {
		q = q.Where(entmark.PeriodID(*f.PeriodID))
	}
	if f.TimetableSlotID != nil {
		q = q.Where(entmark.TimetableSlotID(*f.TimetableSlotID))
	}
	if f.AcademicSessionID != nil {
		q = q.Where(entmark.AcademicSessionID(*f.AcademicSessionID))
	}
	if f.Status != nil {
		q = q.Where(entmark.StatusEQ(*f.Status))
	}
	if f.From != nil {
		q = q.Where(entmark.AttendanceDateGTE(*f.From))
	}
	if f.To != nil {
		q = q.Where(entmark.AttendanceDateLTE(*f.To))
	}
	return q.Limit(f.Limit).Offset(f.Offset)
}

type attendanceDayFilters struct {
	StudentID         *uuid.UUID
	SectionID         *uuid.UUID
	AcademicSessionID *uuid.UUID
	From              *time.Time
	To                *time.Time

	Limit  int
	Offset int
}

func parseAttendanceDayFilters(values url.Values) (attendanceDayFilters, error) {
	p := filter.New(values)

	f := attendanceDayFilters{
		StudentID:         p.UUID("student_id"),
		SectionID:         p.UUID("section_id"),
		AcademicSessionID: p.UUID("academic_session_id"),
	}
	f.Limit, f.Offset = p.Page(DefaultPageSize, MaxPageSize)

	from, to, err := parseDateWindow(p)
	if err != nil {
		return attendanceDayFilters{}, err
	}
	f.From, f.To = from, to

	if err := p.Err(); err != nil {
		return attendanceDayFilters{}, err
	}
	return f, nil
}

func (f attendanceDayFilters) apply(q *tenantent.AttendanceDayQuery) *tenantent.AttendanceDayQuery {
	if f.StudentID != nil {
		q = q.Where(entday.StudentID(*f.StudentID))
	}
	if f.SectionID != nil {
		q = q.Where(entday.SectionID(*f.SectionID))
	}
	if f.AcademicSessionID != nil {
		q = q.Where(entday.AcademicSessionID(*f.AcademicSessionID))
	}
	if f.From != nil {
		q = q.Where(entday.AttendanceDateGTE(*f.From))
	}
	if f.To != nil {
		q = q.Where(entday.AttendanceDateLTE(*f.To))
	}
	return q.Limit(f.Limit).Offset(f.Offset)
}

type classWindow struct {
	InSession bool            `json:"in_session"`
	Scheduled bool            `json:"scheduled"`
	Cancelled bool            `json:"cancelled"`
	Half      timetable.Half  `json:"half,omitempty"`
	State     timetable.State `json:"state,omitempty"`

	slotID    *uuid.UUID
	teacherID *uuid.UUID
}

func resolveClassWindow(ctx context.Context, branchID, offeringID, periodID uuid.UUID,
	on time.Time) (classWindow, error) {
	svc, err := timetable.FromContext(ctx)
	if err != nil {
		return classWindow{}, err
	}

	open, err := svc.IsInSession(ctx, branchID, on, timetable.HalfAny)
	if err != nil {
		return classWindow{}, err
	}
	window := classWindow{InSession: open}
	if !open {
		return window, nil
	}

	lens := occurrenceThrough(
		entslot.And(entslot.SubjectOfferingID(offeringID), entslot.PeriodID(periodID)),
		entdeviation.And(entdeviation.SubjectOfferingID(offeringID), entdeviation.PeriodID(periodID)),
	)

	occurrences, err := svc.ResolveDay(ctx, branchID, on, timetable.HalfAny,
		[]predicate.TimetableSlot{lens.slot},
		[]predicate.TimetableDeviation{lens.dev})
	if err != nil {
		return classWindow{}, err
	}

	for _, occ := range occurrences {
		if occ.PeriodID != periodID || occ.SubjectOfferingID == nil || *occ.SubjectOfferingID != offeringID {
			continue
		}
		window.Scheduled = true
		window.Half = occ.Half
		window.State = occ.State
		if occ.Cancelled() {
			window.Cancelled = true
			continue
		}
		window.Cancelled = false
		window.slotID = occ.SlotID
		window.teacherID = occ.TeacherID
		return window, nil
	}
	return window, nil
}

func classAcceptsMarks(w http.ResponseWriter, window classWindow, on time.Time) bool {
	day := on.Format(dateLayout)
	switch {
	case !window.InSession:
		response.Error(w, http.StatusUnprocessableEntity,
			"attendance_not_in_session: "+day+" is not a session day for that branch")
		return false
	case !window.Scheduled:
		response.Error(w, http.StatusUnprocessableEntity,
			"attendance_not_scheduled: no class for that subject offering and period stands on "+day)
		return false
	case window.Cancelled:
		response.Error(w, http.StatusUnprocessableEntity,
			"attendance_class_cancelled: that class was cancelled on "+day)
		return false
	}
	return true
}

func dayAcceptsMarks(ctx context.Context, w http.ResponseWriter, branchID uuid.UUID,
	on time.Time, halves []timetable.Half) bool {
	svc, err := timetable.FromContext(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return false
	}

	for _, half := range halves {
		open, err := svc.IsInSession(ctx, branchID, on, half)
		if err != nil {
			writeTenancyErr(w, err)
			return false
		}
		if !open {
			response.Error(w, http.StatusUnprocessableEntity,
				"attendance_not_in_session: the "+string(half)+" of "+on.Format(dateLayout)+
					" is not open for that branch")
			return false
		}
	}
	return true
}

type classPlace struct {
	offeringID uuid.UUID
	sectionID  uuid.UUID
	branchID   uuid.UUID
	sessionID  uuid.UUID
}

func locateOffering(ctx context.Context, client *tenantent.Client, offeringID uuid.UUID) (classPlace, error) {
	offering, err := client.SubjectOffering.Query().Where(entoffering.ID(offeringID)).Only(ctx)
	if err != nil {
		return classPlace{}, err
	}
	section, err := client.Section.Query().Where(entsection.ID(offering.SectionID)).Only(ctx)
	if err != nil {
		return classPlace{}, err
	}
	return classPlace{
		offeringID: offering.ID,
		sectionID:  section.ID,
		branchID:   section.BranchID,
		sessionID:  offering.AcademicSessionID,
	}, nil
}

func locateSection(ctx context.Context, client *tenantent.Client, sectionID uuid.UUID) (classPlace, error) {
	section, err := client.Section.Query().Where(entsection.ID(sectionID)).Only(ctx)
	if err != nil {
		return classPlace{}, err
	}
	return classPlace{
		sectionID: section.ID,
		branchID:  section.BranchID,
		sessionID: section.AcademicSessionID,
	}, nil
}

type registerQuery struct {
	SubjectOfferingID uuid.UUID
	PeriodID          uuid.UUID
	Date              time.Time
}

func parseRegisterQuery(values url.Values) (registerQuery, error) {
	p := filter.New(values)

	offering := p.UUID("subject_offering_id")
	period := p.UUID("period_id")
	raw := p.String("attendance_date")

	if err := p.Err(); err != nil {
		return registerQuery{}, err
	}
	if offering == nil || period == nil {
		return registerQuery{}, errors.New("subject_offering_id and period_id are required")
	}
	on, err := parseDate(&raw)
	if err != nil || on == nil {
		return registerQuery{}, errors.New("attendance_date is required as YYYY-MM-DD")
	}
	return registerQuery{SubjectOfferingID: *offering, PeriodID: *period, Date: timetable.Day(*on)}, nil
}

func (s *Server) getAttendanceRegister(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	q, err := parseRegisterQuery(r.URL.Query())
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx, authorization.AttendanceRead, authorization.AttendanceReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	place, err := locateOffering(ctx, client, q.SubjectOfferingID)
	if err != nil {
		writeTenantEntErr(w, err, "subject offering not found")
		return
	}

	window, err := resolveClassWindow(ctx, place.branchID, place.offeringID, q.PeriodID, q.Date)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	rows, err := client.AttendancePeriod.Query().
		Where(
			entmark.SubjectOfferingID(q.SubjectOfferingID),
			entmark.AttendanceDate(q.Date),
			entmark.PeriodID(q.PeriodID),
			access.AttendancePeriodsFor(viewer, decision),
		).
		Order(tenantent.Asc(entmark.FieldStudentID)).
		All(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	projected, err := projectAll(rows, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	traceProjection(r, decision.Fields, len(rows))

	response.JSON(w, http.StatusOK, response.Envelope{
		"subject_offering_id": q.SubjectOfferingID,
		"period_id":           q.PeriodID,
		"attendance_date":     q.Date.Format(dateLayout),
		"section_id":          place.sectionID,
		"branch_id":           place.branchID,
		"class":               window,
		"marks":               projected,
		"count":               len(rows),
	})
}

func registerFieldsSent(sent []string, in registerPayload) []string {
	out := make([]string, 0, len(sent)+4)
	for _, name := range sent {
		if entmark.ValidColumn(name) {
			out = append(out, name)
		}
	}
	out = append(out, entmark.FieldStudentID, entmark.FieldStatus)

	for _, entry := range in.Entries {
		if entry.ReasonCode != nil && !wasSent(out, entmark.FieldReasonCode) {
			out = append(out, entmark.FieldReasonCode)
		}
		if entry.Remarks != nil && !wasSent(out, entmark.FieldRemarks) {
			out = append(out, entmark.FieldRemarks)
		}
	}
	return out
}

func registerStatuses(w http.ResponseWriter, entries []registerEntryPayload) ([]entmark.Status, bool) {
	if len(entries) == 0 {
		response.Error(w, http.StatusBadRequest, "entries must name at least one student")
		return nil, false
	}
	if len(entries) > maxRegisterEntries {
		response.Error(w, http.StatusBadRequest,
			"entries must not exceed "+strconv.Itoa(maxRegisterEntries)+" students in one register")
		return nil, false
	}

	seen := make(map[uuid.UUID]struct{}, len(entries))
	statuses := make([]entmark.Status, 0, len(entries))

	for _, entry := range entries {
		if entry.StudentID == nil {
			response.Error(w, http.StatusBadRequest, "every entry needs a student_id")
			return nil, false
		}
		if _, dup := seen[*entry.StudentID]; dup {
			response.Error(w, http.StatusUnprocessableEntity,
				"entries name student "+entry.StudentID.String()+" more than once")
			return nil, false
		}
		seen[*entry.StudentID] = struct{}{}

		if entry.Status == nil {
			response.Error(w, http.StatusBadRequest, "every entry needs a status")
			return nil, false
		}
		status, ok := attendanceStatus(w, *entry.Status)
		if !ok {
			return nil, false
		}
		if !attendanceReason(w, entry.ReasonCode) {
			return nil, false
		}
		statuses = append(statuses, status)
	}
	return statuses, true
}

func registerStudents(entries []registerEntryPayload) []uuid.UUID {
	out := make([]uuid.UUID, 0, len(entries))
	for _, entry := range entries {
		out = append(out, *entry.StudentID)
	}
	return out
}

func notEnrolledInOffering(ctx context.Context, client *tenantent.Client,
	offeringID uuid.UUID, students []uuid.UUID) ([]uuid.UUID, error) {
	rows, err := client.StudentSubjectEnrollment.Query().
		Where(
			entsubjenroll.SubjectOfferingID(offeringID),
			entsubjenroll.StudentIDIn(students...),
			entsubjenroll.StatusEQ(entsubjenroll.StatusActive),
		).
		All(ctx)
	if err != nil {
		return nil, err
	}

	enrolled := make(map[uuid.UUID]struct{}, len(rows))
	for _, row := range rows {
		enrolled[row.StudentID] = struct{}{}
	}

	var outside []uuid.UUID
	for _, id := range students {
		if _, ok := enrolled[id]; !ok {
			outside = append(outside, id)
		}
	}
	return outside, nil
}

func existingMarks(ctx context.Context, client *tenantent.Client, students []uuid.UUID,
	on time.Time, periodID uuid.UUID) (map[uuid.UUID]uuid.UUID, error) {
	rows, err := client.AttendancePeriod.Query().
		Where(
			entmark.StudentIDIn(students...),
			entmark.AttendanceDate(on),
			entmark.PeriodID(periodID),
		).
		All(ctx)
	if err != nil {
		return nil, err
	}

	index := make(map[uuid.UUID]uuid.UUID, len(rows))
	for _, row := range rows {
		index[row.StudentID] = row.ID
	}
	return index, nil
}

type registerPlan struct {
	place     classPlace
	periodID  uuid.UUID
	on        time.Time
	slotID    *uuid.UUID
	teacherID *uuid.UUID
	source    entmark.Source
	markedBy  *uuid.UUID
	markedAt  time.Time
}

func (p registerPlan) create(c *tenantent.Client, entry registerEntryPayload,
	status entmark.Status) *tenantent.AttendancePeriodCreate {
	return c.AttendancePeriod.Create().
		SetStudentID(*entry.StudentID).
		SetAcademicSessionID(p.place.sessionID).
		SetSubjectOfferingID(p.place.offeringID).
		SetPeriodID(p.periodID).
		SetAttendanceDate(p.on).
		SetStatus(status).
		SetNillableTimetableSlotID(p.slotID).
		SetNillableTeacherID(p.teacherID).
		SetNillableReasonCode(entry.ReasonCode).
		SetNillableRemarks(entry.Remarks).
		SetSource(p.source).
		SetNillableMarkedBy(p.markedBy).
		SetMarkedAt(p.markedAt)
}

func (p registerPlan) update(c *tenantent.Client, id uuid.UUID, entry registerEntryPayload,
	status entmark.Status, v *access.Viewer, d authorization.Decision) *tenantent.AttendancePeriodUpdate {
	return c.AttendancePeriod.Update().
		Where(entmark.ID(id), access.AttendancePeriodsWritableBy(v, d)).
		SetSubjectOfferingID(p.place.offeringID).
		SetStatus(status).
		SetNillableTimetableSlotID(p.slotID).
		SetNillableTeacherID(p.teacherID).
		SetNillableReasonCode(entry.ReasonCode).
		SetNillableRemarks(entry.Remarks).
		SetSource(p.source).
		SetNillableMarkedBy(p.markedBy).
		SetMarkedAt(p.markedAt)
}

type registerOutcome struct {
	created     []uuid.UUID
	createdFor  []uuid.UUID
	updated     []uuid.UUID
	unreachable []uuid.UUID
}

func (o registerOutcome) touched() []uuid.UUID {
	return append(append([]uuid.UUID{}, o.created...), o.updated...)
}

func missingStudents(rows, students, reachable []uuid.UUID) []uuid.UUID {
	ok := make(map[uuid.UUID]struct{}, len(reachable))
	for _, id := range reachable {
		ok[id] = struct{}{}
	}

	var out []uuid.UUID
	for i, id := range rows {
		if _, found := ok[id]; !found {
			out = append(out, students[i])
		}
	}
	return out
}

func applyRegister(ctx context.Context, c *tenantent.Client, plan registerPlan,
	entries []registerEntryPayload, statuses []entmark.Status, existing map[uuid.UUID]uuid.UUID,
	v *access.Viewer, d authorization.Decision) (registerOutcome, error) {
	var outcome registerOutcome

	for i, entry := range entries {
		if id, known := existing[*entry.StudentID]; known {
			n, err := plan.update(c, id, entry, statuses[i], v, d).Save(ctx)
			if err != nil {
				return outcome, err
			}
			if n == 0 {
				outcome.unreachable = append(outcome.unreachable, *entry.StudentID)
				continue
			}
			outcome.updated = append(outcome.updated, id)
			continue
		}

		row, err := plan.create(c, entry, statuses[i]).Save(ctx)
		if err != nil {
			return outcome, err
		}
		outcome.created = append(outcome.created, row.ID)
		outcome.createdFor = append(outcome.createdFor, *entry.StudentID)
	}

	if len(outcome.created) == 0 {
		return outcome, nil
	}

	reachable, err := c.AttendancePeriod.Query().
		Where(entmark.IDIn(outcome.created...), access.AttendancePeriodsWritableBy(v, d)).
		IDs(ctx)
	if err != nil {
		return outcome, err
	}
	outcome.unreachable = append(outcome.unreachable,
		missingStudents(outcome.created, outcome.createdFor, reachable)...)

	if len(outcome.unreachable) > 0 {
		if _, err := c.AttendancePeriod.Delete().
			Where(entmark.IDIn(outcome.created...)).
			Exec(ctx); err != nil {
			return outcome, err
		}
	}
	return outcome, nil
}

type unitOfWork struct {
	writer *tenantent.Client
	tx     *tenantent.Tx
}

func begin(ctx context.Context, client *tenantent.Client) (unitOfWork, error) {
	tx, err := client.Tx(ctx)
	if errors.Is(err, tenantent.ErrTxStarted) {
		return unitOfWork{writer: client}, nil
	}
	if err != nil {
		return unitOfWork{}, err
	}
	return unitOfWork{writer: tx.Client(), tx: tx}, nil
}

func (u unitOfWork) rollback() {
	if u.tx != nil {
		_ = u.tx.Rollback()
	}
}

func (u unitOfWork) commit() error {
	if u.tx == nil {
		return nil
	}
	return u.tx.Commit()
}

func refuseStudents(w http.ResponseWriter, key, message string, students []uuid.UUID) {
	response.JSON(w, http.StatusUnprocessableEntity, response.Envelope{
		"error":   http.StatusText(http.StatusUnprocessableEntity),
		"message": message,
		key:       students,
	})
}

func (s *Server) markAttendanceRegister(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	var in registerPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx, authorization.AttendanceWrite, authorization.AttendanceWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entmark.Columns, registerFieldsSent(sent, in)) {
		return
	}

	plan, statuses, ok := s.planRegister(ctx, w, client, in, viewer)
	if !ok {
		return
	}

	students := registerStudents(in.Entries)
	existing, err := existingMarks(ctx, client, students, plan.on, plan.periodID)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	work, err := begin(ctx, client)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	outcome, err := applyRegister(ctx, work.writer, plan, in.Entries, statuses, existing, viewer, decision)
	if err != nil {
		work.rollback()
		writeTenantEntErr(w, err, markNotFound)
		return
	}
	if len(outcome.unreachable) > 0 {
		work.rollback()
		refuseStudents(w, "unreachable",
			"attendance_unreachable: your grant of "+string(authorization.AttendanceWrite)+
				" does not reach those students in this register", outcome.unreachable)
		return
	}
	if err := work.commit(); err != nil {
		writeTenancyErr(w, err)
		return
	}

	s.writeRegisterResult(ctx, w, r, client, plan, outcome)
}

func (s *Server) planRegister(ctx context.Context, w http.ResponseWriter, client *tenantent.Client,
	in registerPayload, viewer *access.Viewer) (registerPlan, []entmark.Status, bool) {
	if in.SubjectOfferingID == nil || in.PeriodID == nil {
		response.Error(w, http.StatusBadRequest, "subject_offering_id and period_id are required")
		return registerPlan{}, nil, false
	}
	on, err := parseDate(in.AttendanceDate)
	if err != nil || on == nil {
		response.Error(w, http.StatusBadRequest, "attendance_date is required as YYYY-MM-DD")
		return registerPlan{}, nil, false
	}
	source, ok := attendanceSource(w, in.Source)
	if !ok {
		return registerPlan{}, nil, false
	}
	statuses, ok := registerStatuses(w, in.Entries)
	if !ok {
		return registerPlan{}, nil, false
	}

	place, err := locateOffering(ctx, client, *in.SubjectOfferingID)
	if err != nil {
		writeTenantEntErr(w, err, "subject offering not found")
		return registerPlan{}, nil, false
	}

	marked := timetable.Day(*on)
	window, err := resolveClassWindow(ctx, place.branchID, place.offeringID, *in.PeriodID, marked)
	if err != nil {
		writeTenancyErr(w, err)
		return registerPlan{}, nil, false
	}
	if !classAcceptsMarks(w, window, marked) {
		return registerPlan{}, nil, false
	}

	outside, err := notEnrolledInOffering(ctx, client, place.offeringID, registerStudents(in.Entries))
	if err != nil {
		writeTenancyErr(w, err)
		return registerPlan{}, nil, false
	}
	if len(outside) > 0 {
		refuseStudents(w, "not_enrolled",
			"attendance_not_enrolled: those students are not actively enrolled in that subject offering",
			outside)
		return registerPlan{}, nil, false
	}

	return registerPlan{
		place:     place,
		periodID:  *in.PeriodID,
		on:        marked,
		slotID:    window.slotID,
		teacherID: window.teacherID,
		source:    source,
		markedBy:  viewer.PersonID,
		markedAt:  nowUTC(),
	}, statuses, true
}

func (s *Server) writeRegisterResult(ctx context.Context, w http.ResponseWriter, r *http.Request,
	client *tenantent.Client, plan registerPlan, outcome registerOutcome) {
	viewer, decision, err := s.scopeFor(ctx, authorization.AttendanceRead, authorization.AttendanceReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	rows, err := client.AttendancePeriod.Query().
		Where(entmark.IDIn(outcome.touched()...), access.AttendancePeriodsFor(viewer, decision)).
		Order(tenantent.Asc(entmark.FieldStudentID)).
		All(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	projected, err := projectAll(rows, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	traceProjection(r, decision.Fields, len(rows))

	response.JSON(w, http.StatusOK, response.Envelope{
		"subject_offering_id": plan.place.offeringID,
		"period_id":           plan.periodID,
		"attendance_date":     plan.on.Format(dateLayout),
		"created":             len(outcome.created),
		"updated":             len(outcome.updated),
		"marks":               projected,
		"count":               len(rows),
	})
}

func (s *Server) listAttendancePeriods(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	filters, err := parseAttendancePeriodFilters(r.URL.Query())
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx, authorization.AttendanceRead, authorization.AttendanceReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	q := client.AttendancePeriod.Query().Where(access.AttendancePeriodsFor(viewer, decision))

	rows, err := filters.apply(q).
		Order(tenantent.Desc(entmark.FieldAttendanceDate), tenantent.Asc(entmark.FieldStudentID)).
		All(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	projected, err := projectAll(rows, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	traceProjection(r, decision.Fields, len(rows))

	response.JSON(w, http.StatusOK, response.Envelope{
		"attendance_periods": projected,
		"count":              len(rows),
		"page":               pageOf(filters.Limit, filters.Offset, len(rows)),
	})
}

func (s *Server) getAttendancePeriod(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	id, ok := idParam(w, r, "id")
	if !ok {
		return
	}

	viewer, decision, err := s.scopeFor(ctx, authorization.AttendanceRead, authorization.AttendanceReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	row, err := client.AttendancePeriod.Query().
		Where(entmark.ID(id), access.AttendancePeriodsFor(viewer, decision)).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, markNotFound)
		return
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	traceProjection(r, decision.Fields, 1)

	response.JSON(w, http.StatusOK, projected)
}

func (s *Server) updateAttendancePeriod(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	id, ok := idParam(w, r, "id")
	if !ok {
		return
	}

	var in attendancePeriodPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx, authorization.AttendanceWrite, authorization.AttendanceWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entmark.Columns, sent) {
		return
	}
	if !attendanceReason(w, in.ReasonCode) {
		return
	}

	update := client.AttendancePeriod.Update().
		Where(entmark.ID(id), access.AttendancePeriodsWritableBy(viewer, decision)).
		SetNillableReasonCode(in.ReasonCode).
		SetNillableRemarks(in.Remarks).
		SetNillableMarkedBy(viewer.PersonID).
		SetMarkedAt(nowUTC())

	if in.Status != nil {
		status, ok := attendanceStatus(w, *in.Status)
		if !ok {
			return
		}
		update = update.SetStatus(status)
	}
	if in.Source != nil {
		source, ok := attendanceSource(w, in.Source)
		if !ok {
			return
		}
		update = update.SetSource(source)
	}
	if in.ReasonCode == nil && wasSent(sent, entmark.FieldReasonCode) {
		update = update.ClearReasonCode()
	}
	if in.Remarks == nil && wasSent(sent, entmark.FieldRemarks) {
		update = update.ClearRemarks()
	}

	n, err := update.Save(ctx)
	if !wroteScopedRow(w, n, err, markNotFound) {
		return
	}

	row, err := client.AttendancePeriod.Query().Where(entmark.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, markNotFound)
		return
	}
	response.JSON(w, http.StatusOK, row)
}

func (s *Server) deleteAttendancePeriod(w http.ResponseWriter, r *http.Request) {
	s.deleteScoped(w, r, markNotFound,
		authorization.AttendanceDelete, authorization.AttendanceDeleteAll,
		func(ctx context.Context, c *tenantent.Client, id uuid.UUID,
			v *access.Viewer, d authorization.Decision) (int, error) {
			return c.AttendancePeriod.Delete().
				Where(entmark.ID(id), access.AttendancePeriodsWritableBy(v, d)).
				Exec(ctx)
		})
}

func (s *Server) listAttendanceDays(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	filters, err := parseAttendanceDayFilters(r.URL.Query())
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx, authorization.AttendanceRead, authorization.AttendanceReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	q := client.AttendanceDay.Query().Where(access.AttendanceDaysFor(viewer, decision))

	rows, err := filters.apply(q).
		Order(tenantent.Desc(entday.FieldAttendanceDate), tenantent.Asc(entday.FieldStudentID)).
		All(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	projected, err := projectAll(rows, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	traceProjection(r, decision.Fields, len(rows))

	response.JSON(w, http.StatusOK, response.Envelope{
		"attendance_days": projected,
		"count":           len(rows),
		"page":            pageOf(filters.Limit, filters.Offset, len(rows)),
	})
}

func (s *Server) getAttendanceDay(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	id, ok := idParam(w, r, "id")
	if !ok {
		return
	}

	viewer, decision, err := s.scopeFor(ctx, authorization.AttendanceRead, authorization.AttendanceReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	row, err := client.AttendanceDay.Query().
		Where(entday.ID(id), access.AttendanceDaysFor(viewer, decision)).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, dayNotFound)
		return
	}

	projected, err := project(row, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	traceProjection(r, decision.Fields, 1)

	response.JSON(w, http.StatusOK, projected)
}

func dayHalvesSent(in attendanceDayPayload) []timetable.Half {
	var halves []timetable.Half
	if in.ForenoonStatus != nil {
		halves = append(halves, timetable.HalfForenoon)
	}
	if in.AfternoonStatus != nil {
		halves = append(halves, timetable.HalfAfternoon)
	}
	return halves
}

func (s *Server) createAttendanceDay(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	var in attendanceDayPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx, authorization.AttendanceWrite, authorization.AttendanceWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entday.Columns, sent) {
		return
	}

	if in.StudentID == nil || in.SectionID == nil {
		response.Error(w, http.StatusBadRequest, "student_id and section_id are required")
		return
	}
	on, err := parseDate(in.AttendanceDate)
	if err != nil || on == nil {
		response.Error(w, http.StatusBadRequest, "attendance_date is required as YYYY-MM-DD")
		return
	}
	halves := dayHalvesSent(in)
	if len(halves) == 0 {
		response.Error(w, http.StatusUnprocessableEntity, "forenoon_status or afternoon_status is required")
		return
	}
	if !attendanceReason(w, in.ReasonCode) {
		return
	}
	source, ok := attendanceDaySource(w, in.Source)
	if !ok {
		return
	}

	place, err := locateSection(ctx, client, *in.SectionID)
	if err != nil {
		writeTenantEntErr(w, err, "section not found")
		return
	}

	marked := timetable.Day(*on)
	if !dayAcceptsMarks(ctx, w, place.branchID, marked, halves) {
		return
	}

	work, err := begin(ctx, client)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	create := work.writer.AttendanceDay.Create().
		SetStudentID(*in.StudentID).
		SetAcademicSessionID(place.sessionID).
		SetSectionID(place.sectionID).
		SetAttendanceDate(marked).
		SetNillableReasonCode(in.ReasonCode).
		SetNillableRemarks(in.Remarks).
		SetSource(source).
		SetNillableMarkedBy(viewer.PersonID).
		SetMarkedAt(nowUTC())

	if in.ForenoonStatus != nil {
		status, ok := forenoonStatus(w, *in.ForenoonStatus)
		if !ok {
			work.rollback()
			return
		}
		create = create.SetForenoonStatus(status)
	}
	if in.AfternoonStatus != nil {
		status, ok := afternoonStatus(w, *in.AfternoonStatus)
		if !ok {
			work.rollback()
			return
		}
		create = create.SetAfternoonStatus(status)
	}

	row, ok := saveReachableDay(ctx, w, work, create, viewer, decision)
	if !ok {
		return
	}
	w.Header().Set("Location", "/api/v1/attendance/days/"+row.ID.String())
	response.JSON(w, http.StatusCreated, row)
}

func saveReachableDay(ctx context.Context, w http.ResponseWriter, work unitOfWork,
	create *tenantent.AttendanceDayCreate, v *access.Viewer,
	d authorization.Decision) (*tenantent.AttendanceDay, bool) {
	row, err := create.Save(ctx)
	if err != nil {
		work.rollback()
		writeTenantEntErr(w, err, dayNotFound)
		return nil, false
	}

	reachable, err := work.writer.AttendanceDay.Query().
		Where(entday.ID(row.ID), access.AttendanceDaysWritableBy(v, d)).
		Exist(ctx)
	if err != nil {
		work.rollback()
		writeTenancyErr(w, err)
		return nil, false
	}
	if !reachable {
		if _, err := work.writer.AttendanceDay.Delete().Where(entday.ID(row.ID)).Exec(ctx); err != nil {
			work.rollback()
			writeTenancyErr(w, err)
			return nil, false
		}
		work.rollback()
		response.Error(w, http.StatusForbidden,
			"your grant of "+string(authorization.AttendanceWrite)+
				" does not reach that section; you may only record a day you could then write")
		return nil, false
	}

	if err := work.commit(); err != nil {
		writeTenancyErr(w, err)
		return nil, false
	}
	return row, true
}

func rejectImmutableAttendanceDayFields(w http.ResponseWriter, sent []string) bool {
	for _, name := range []string{
		entday.FieldStudentID,
		entday.FieldAcademicSessionID,
		entday.FieldSectionID,
		entday.FieldAttendanceDate,
	} {
		if wasSent(sent, name) {
			response.Error(w, http.StatusUnprocessableEntity,
				name+" is recorded when the day is created and cannot be changed")
			return false
		}
	}
	return true
}

func (s *Server) updateAttendanceDay(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	id, ok := idParam(w, r, "id")
	if !ok {
		return
	}

	var in attendanceDayPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx, authorization.AttendanceWrite, authorization.AttendanceWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entday.Columns, sent) {
		return
	}
	if !rejectImmutableAttendanceDayFields(w, sent) {
		return
	}
	if !attendanceReason(w, in.ReasonCode) {
		return
	}

	update := client.AttendanceDay.Update().
		Where(entday.ID(id), access.AttendanceDaysWritableBy(viewer, decision)).
		SetNillableReasonCode(in.ReasonCode).
		SetNillableRemarks(in.Remarks).
		SetNillableMarkedBy(viewer.PersonID).
		SetMarkedAt(nowUTC())

	if in.ForenoonStatus != nil {
		status, ok := forenoonStatus(w, *in.ForenoonStatus)
		if !ok {
			return
		}
		update = update.SetForenoonStatus(status)
	}
	if in.AfternoonStatus != nil {
		status, ok := afternoonStatus(w, *in.AfternoonStatus)
		if !ok {
			return
		}
		update = update.SetAfternoonStatus(status)
	}
	if in.Source != nil {
		source, ok := attendanceDaySource(w, in.Source)
		if !ok {
			return
		}
		update = update.SetSource(source)
	}
	if in.ReasonCode == nil && wasSent(sent, entday.FieldReasonCode) {
		update = update.ClearReasonCode()
	}
	if in.Remarks == nil && wasSent(sent, entday.FieldRemarks) {
		update = update.ClearRemarks()
	}

	n, err := update.Save(ctx)
	if !wroteScopedRow(w, n, err, dayNotFound) {
		return
	}

	row, err := client.AttendanceDay.Query().Where(entday.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, dayNotFound)
		return
	}
	response.JSON(w, http.StatusOK, row)
}

func (s *Server) deleteAttendanceDay(w http.ResponseWriter, r *http.Request) {
	s.deleteScoped(w, r, dayNotFound,
		authorization.AttendanceDelete, authorization.AttendanceDeleteAll,
		func(ctx context.Context, c *tenantent.Client, id uuid.UUID,
			v *access.Viewer, d authorization.Decision) (int, error) {
			return c.AttendanceDay.Delete().
				Where(entday.ID(id), access.AttendanceDaysWritableBy(v, d)).
				Exec(ctx)
		})
}

func (s *Server) mountAttendance(r chi.Router) {
	r.Route("/attendance", func(r chi.Router) {
		r.With(s.can(authorization.AttendanceRead)).Get("/register", s.getAttendanceRegister)
		r.With(s.can(authorization.AttendanceWrite)).Post("/register", s.markAttendanceRegister)

		r.With(s.can(authorization.AttendanceRead)).Get("/periods", s.listAttendancePeriods)
		r.With(s.can(authorization.AttendanceRead)).Get("/periods/{id}", s.getAttendancePeriod)
		r.With(s.can(authorization.AttendanceWrite)).Patch("/periods/{id}", s.updateAttendancePeriod)
		r.With(s.can(authorization.AttendanceDelete)).Delete("/periods/{id}", s.deleteAttendancePeriod)

		r.With(s.can(authorization.AttendanceRead)).Get("/days", s.listAttendanceDays)
		r.With(s.can(authorization.AttendanceWrite)).Post("/days", s.createAttendanceDay)
		r.With(s.can(authorization.AttendanceRead)).Get("/days/{id}", s.getAttendanceDay)
		r.With(s.can(authorization.AttendanceWrite)).Patch("/days/{id}", s.updateAttendanceDay)
		r.With(s.can(authorization.AttendanceDelete)).Delete("/days/{id}", s.deleteAttendanceDay)
	})
}
