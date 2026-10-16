package http

import (
	"context"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"time"

	"entgo.io/ent/dialect/sql"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	"github.com/Harbour-Emerge/emerge-core/internal/data/filter"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
	entteacher "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/teacher"
	entabsence "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/teacherabsence"
	entdeviation "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetabledeviation"
	entslot "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetableslot"
	timetablesvc "github.com/Harbour-Emerge/emerge-core/internal/service/timetable"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

const (
	teacherAbsenceNotFound = "teacher absence not found"
	absenceTeacherNotFound = "teacher not found"

	absenceReasonRunes = 500

	absenceStatusAny = "any"
)

const (
	coverArranged = "covered"
	coverMissing  = "uncovered"
	coverDropped  = "cancelled"
)

func (s *Server) mountTeacherAbsences(r chi.Router) {
	r.Route("/teacher-absences", func(r chi.Router) {
		r.With(s.can(authorization.TimetableRead)).Get("/", s.listTeacherAbsences)
		r.With(s.can(authorization.TimetableWrite)).Post("/", s.createTeacherAbsence)
		r.With(s.can(authorization.TimetableRead)).Get("/{id}", s.getTeacherAbsence)
		r.With(s.can(authorization.TimetableWrite)).Patch("/{id}", s.updateTeacherAbsence)
		r.With(s.can(authorization.TimetableDelete)).Delete("/{id}", s.withdrawTeacherAbsence)
		r.With(s.can(authorization.TimetableRead)).Get("/{id}/lessons", s.getTeacherAbsenceLessons)
	})
}

func noTeacherAbsence() predicate.TeacherAbsence { return entabsence.IDIn() }

func anyTeacherAbsence() predicate.TeacherAbsence { return func(*sql.Selector) {} }

func teacherAbsenceOwnArms(v *access.Viewer) []predicate.TeacherAbsence {
	if v.TeacherID == nil {
		return nil
	}
	return []predicate.TeacherAbsence{entabsence.TeacherIDEQ(*v.TeacherID)}
}

func teacherAbsenceArms(v *access.Viewer, d authorization.Decision) ([]predicate.TeacherAbsence, bool) {
	if !d.HasReach {
		return teacherAbsenceOwnArms(v), false
	}

	switch d.Reach {
	case authorization.ReachTenant:
		return nil, true
	case authorization.ReachSelf, authorization.ReachTeacherAssignment:
		return teacherAbsenceOwnArms(v), false
	default:
		return nil, false
	}
}

func teacherAbsencesConstrainedBy(groups [][]authorization.Constraint) predicate.TeacherAbsence {
	if len(groups) == 0 {
		return anyTeacherAbsence()
	}
	return noTeacherAbsence()
}

func teacherAbsencesFor(v *access.Viewer, d authorization.Decision) predicate.TeacherAbsence {
	if v == nil {
		return noTeacherAbsence()
	}
	if v.Unrestricted {
		return anyTeacherAbsence()
	}

	arms, all := teacherAbsenceArms(v, d)
	if all {
		return teacherAbsencesConstrainedBy(d.Constraints)
	}
	if len(arms) == 0 || len(d.Constraints) > 0 {
		return noTeacherAbsence()
	}
	return entabsence.Or(arms...)
}

func teacherAbsenceWritableFor(v *access.Viewer, d authorization.Decision, teacher uuid.UUID) bool {
	if v == nil {
		return false
	}
	if v.Unrestricted {
		return true
	}

	arms, all := teacherAbsenceArms(v, d)
	if all {
		return len(d.Constraints) == 0
	}
	if len(arms) == 0 || len(d.Constraints) > 0 {
		return false
	}
	return v.TeacherID != nil && *v.TeacherID == teacher
}

type absenceWindow struct {
	From     time.Time
	To       time.Time
	FromHalf timetablesvc.Half
	ToHalf   timetablesvc.Half
}

func absenceWindowOf(row *tenantent.TeacherAbsence) absenceWindow {
	return absenceWindow{
		From:     timetablesvc.Day(row.FromDate),
		To:       timetablesvc.Day(row.ToDate),
		FromHalf: timetablesvc.Half(row.FromHalf),
		ToHalf:   timetablesvc.Half(row.ToHalf),
	}
}

func absenceStartsAfter(date time.Time, half timetablesvc.Half,
	otherDate time.Time, otherHalf timetablesvc.Half) bool {
	if !date.Equal(otherDate) {
		return date.After(otherDate)
	}
	return half == timetablesvc.HalfAfternoon && otherHalf == timetablesvc.HalfForenoon
}

func absenceWindowsOverlap(a, b absenceWindow) bool {
	return !absenceStartsAfter(a.From, a.FromHalf, b.To, b.ToHalf) &&
		!absenceStartsAfter(b.From, b.FromHalf, a.To, a.ToHalf)
}

func absenceCoversOccurrence(win absenceWindow, occ timetablesvc.Occurrence) bool {
	day := timetablesvc.Day(occ.Date)
	if day.Equal(win.From) && win.FromHalf == timetablesvc.HalfAfternoon &&
		occ.Half == timetablesvc.HalfForenoon {
		return false
	}
	if day.Equal(win.To) && win.ToHalf == timetablesvc.HalfForenoon &&
		occ.Half == timetablesvc.HalfAfternoon {
		return false
	}
	return true
}

func absenceCoverOf(occ timetablesvc.Occurrence, teacher uuid.UUID) string {
	switch {
	case occ.State == timetablesvc.StateCancelled:
		return coverDropped
	case occ.TeacherID != nil && *occ.TeacherID != teacher:
		return coverArranged
	default:
		return coverMissing
	}
}

type teacherAbsencePayload struct {
	TeacherID        *uuid.UUID `json:"teacher_id"`
	FromDate         *string    `json:"from_date"`
	ToDate           *string    `json:"to_date"`
	FromHalf         *string    `json:"from_half"`
	ToHalf           *string    `json:"to_half"`
	Reason           *string    `json:"reason"`
	RecordedBy       *uuid.UUID `json:"recorded_by"`
	Status           *string    `json:"status"`
	WithdrawnAt      *string    `json:"withdrawn_at"`
	WithdrawnBy      *uuid.UUID `json:"withdrawn_by"`
	WithdrawalReason *string    `json:"withdrawal_reason"`
}

func rejectWithdrawalFields(w http.ResponseWriter, sent []string) bool {
	for _, name := range []string{
		entabsence.FieldStatus, entabsence.FieldWithdrawnAt,
		entabsence.FieldWithdrawnBy, entabsence.FieldWithdrawalReason,
	} {
		if wasSent(sent, name) {
			response.Error(w, http.StatusUnprocessableEntity,
				name+" is recorded when the absence is withdrawn and must not be supplied; "+
					"withdraw it with DELETE /api/v1/teacher-absences/{id}")
			return false
		}
	}
	return true
}

func absenceHalf(w http.ResponseWriter, name string, raw *string,
	fallback timetablesvc.Half) (timetablesvc.Half, bool) {
	if raw == nil {
		return fallback, true
	}
	half := timetablesvc.Half(*raw)
	if half != timetablesvc.HalfForenoon && half != timetablesvc.HalfAfternoon {
		response.Error(w, http.StatusBadRequest, name+" must be forenoon or afternoon")
		return "", false
	}
	return half, true
}

func absenceWindowFrom(w http.ResponseWriter, in teacherAbsencePayload,
	current *absenceWindow) (absenceWindow, bool) {
	win := absenceWindow{
		FromHalf: timetablesvc.HalfForenoon,
		ToHalf:   timetablesvc.HalfAfternoon,
	}
	if current != nil {
		win = *current
	}

	from, err := parseDate(in.FromDate)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "from_date must be a date as "+dateLayout)
		return win, false
	}
	to, err := parseDate(in.ToDate)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "to_date must be a date as "+dateLayout)
		return win, false
	}

	if from != nil {
		win.From = timetablesvc.Day(*from)
		if to == nil && current == nil {
			win.To = win.From
		}
	}
	if to != nil {
		win.To = timetablesvc.Day(*to)
	}
	if current == nil && from == nil {
		response.Error(w, http.StatusBadRequest, "from_date is required as "+dateLayout)
		return win, false
	}

	fromHalf, ok := absenceHalf(w, entabsence.FieldFromHalf, in.FromHalf, win.FromHalf)
	if !ok {
		return win, false
	}
	toHalf, ok := absenceHalf(w, entabsence.FieldToHalf, in.ToHalf, win.ToHalf)
	if !ok {
		return win, false
	}
	win.FromHalf, win.ToHalf = fromHalf, toHalf

	if absenceStartsAfter(win.From, win.FromHalf, win.To, win.ToHalf) {
		response.Error(w, http.StatusUnprocessableEntity,
			"the absence ends before it starts: to_date with to_half must not precede "+
				"from_date with from_half")
		return win, false
	}
	if spanDays(win.From, win.To) > timetablesvc.MaxRangeDays {
		response.Error(w, http.StatusUnprocessableEntity,
			"an absence may not run longer than "+
				strconv.Itoa(timetablesvc.MaxRangeDays)+" days")
		return win, false
	}
	return win, true
}

func absenceOverlapping(ctx context.Context, client *tenantent.Client, teacher uuid.UUID,
	win absenceWindow, exclude uuid.UUID) (*tenantent.TeacherAbsence, error) {
	rows, err := client.TeacherAbsence.Query().
		Where(
			entabsence.TeacherIDEQ(teacher),
			entabsence.StatusEQ(entabsence.StatusRecorded),
			entabsence.FromDateLTE(win.To),
			entabsence.ToDateGTE(win.From),
		).
		Order(tenantent.Asc(entabsence.FieldFromDate), tenantent.Asc(entabsence.FieldID)).
		All(ctx)
	if err != nil {
		return nil, err
	}

	for _, row := range rows {
		if row.ID == exclude {
			continue
		}
		if absenceWindowsOverlap(win, absenceWindowOf(row)) {
			return row, nil
		}
	}
	return nil, nil
}

func absenceFreeOfOverlap(ctx context.Context, w http.ResponseWriter, client *tenantent.Client,
	teacher uuid.UUID, win absenceWindow, exclude uuid.UUID) bool {
	clash, err := absenceOverlapping(ctx, client, teacher, win, exclude)
	if err != nil {
		writeTenancyErr(w, err)
		return false
	}
	if clash != nil {
		response.Error(w, http.StatusConflict,
			"this teacher is already recorded absent from "+
				clash.FromDate.Format(dateLayout)+" ("+string(clash.FromHalf)+") to "+
				clash.ToDate.Format(dateLayout)+" ("+string(clash.ToHalf)+") as absence "+
				clash.ID.String()+"; amend that absence rather than recording a second one")
		return false
	}
	return true
}

type teacherAbsenceFilters struct {
	TeacherID *uuid.UUID
	Status    *entabsence.Status
	From      *time.Time
	To        *time.Time

	Limit  int
	Offset int
}

func parseTeacherAbsenceFilters(values url.Values) (teacherAbsenceFilters, error) {
	p := filter.New(values)

	var failed error
	f := teacherAbsenceFilters{
		TeacherID: p.UUID("teacher_id"),
		From:      timetableQueryDate(p, "from", &failed),
		To:        timetableQueryDate(p, "to", &failed),
	}
	f.Limit, f.Offset = p.Page(DefaultPageSize, MaxPageSize)

	status := entabsence.StatusRecorded
	switch raw := p.String("status"); raw {
	case "":
		f.Status = &status
	case absenceStatusAny:
	default:
		if err := entabsence.StatusValidator(entabsence.Status(raw)); err != nil {
			return teacherAbsenceFilters{},
				&filter.Error{Param: "status", Reason: "must be recorded, withdrawn or any"}
		}
		status = entabsence.Status(raw)
		f.Status = &status
	}

	if err := p.Err(); err != nil {
		return teacherAbsenceFilters{}, err
	}
	if failed != nil {
		return teacherAbsenceFilters{}, failed
	}
	if f.From != nil && f.To != nil && f.To.Before(*f.From) {
		return teacherAbsenceFilters{}, &filter.Error{Param: "to", Reason: "must not precede from"}
	}
	return f, nil
}

func (f teacherAbsenceFilters) apply(q *tenantent.TeacherAbsenceQuery) *tenantent.TeacherAbsenceQuery {
	if f.TeacherID != nil {
		q = q.Where(entabsence.TeacherIDEQ(*f.TeacherID))
	}
	if f.Status != nil {
		q = q.Where(entabsence.StatusEQ(*f.Status))
	}
	if f.From != nil {
		q = q.Where(entabsence.ToDateGTE(*f.From))
	}
	if f.To != nil {
		q = q.Where(entabsence.FromDateLTE(*f.To))
	}
	return q.Limit(f.Limit).Offset(f.Offset)
}

func (s *Server) listTeacherAbsences(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	filters, err := parseTeacherAbsenceFilters(r.URL.Query())
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TimetableRead, authorization.TimetableReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	rows, err := filters.apply(client.TeacherAbsence.Query().
		Where(teacherAbsencesFor(viewer, decision))).
		Order(
			tenantent.Asc(entabsence.FieldFromDate),
			tenantent.Asc(entabsence.FieldID),
		).
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

	envelope := response.Envelope{
		"teacher_absences": projected,
		"count":            len(rows),
		"page":             pageOf(filters.Limit, filters.Offset, len(rows)),
		"status":           absenceStatusAny,
	}
	if filters.Status != nil {
		envelope["status"] = string(*filters.Status)
	}
	response.JSON(w, http.StatusOK, envelope)
}

func (s *Server) getTeacherAbsence(w http.ResponseWriter, r *http.Request) {
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

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TimetableRead, authorization.TimetableReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	row, err := client.TeacherAbsence.Query().
		Where(entabsence.ID(id), teacherAbsencesFor(viewer, decision)).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, teacherAbsenceNotFound)
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

func (s *Server) createTeacherAbsence(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	var in teacherAbsencePayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TimetableWrite, authorization.TimetableWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entabsence.Columns, sent) {
		return
	}
	if !rejectWithdrawalFields(w, sent) {
		return
	}

	if in.TeacherID == nil {
		response.Error(w, http.StatusBadRequest, "teacher_id is required")
		return
	}
	win, ok := absenceWindowFrom(w, in, nil)
	if !ok {
		return
	}
	if in.Reason != nil && !withinRunes(w, entabsence.FieldReason, *in.Reason, absenceReasonRunes) {
		return
	}
	recorder, ok := attributedToOptional(w, viewer, in.RecordedBy, entabsence.FieldRecordedBy)
	if !ok {
		return
	}
	if !teacherAbsenceWritableFor(viewer, decision, *in.TeacherID) {
		response.Error(w, http.StatusForbidden,
			"your grant of "+string(authorization.TimetableWrite)+
				" does not reach "+entabsence.FieldTeacherID+" "+in.TeacherID.String())
		return
	}

	known, err := client.Teacher.Query().Where(entteacher.ID(*in.TeacherID)).Exist(ctx)
	if !mustReach(w, known, err, absenceTeacherNotFound) {
		return
	}
	if !absenceFreeOfOverlap(ctx, w, client, *in.TeacherID, win, uuid.Nil) {
		return
	}

	row, err := client.TeacherAbsence.Create().
		SetTeacherID(*in.TeacherID).
		SetFromDate(win.From).
		SetToDate(win.To).
		SetFromHalf(entabsence.FromHalf(win.FromHalf)).
		SetToHalf(entabsence.ToHalf(win.ToHalf)).
		SetNillableReason(in.Reason).
		SetNillableRecordedBy(recorder).
		Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, teacherAbsenceNotFound)
		return
	}

	w.Header().Set("Location", "/api/v1/teacher-absences/"+row.ID.String())
	response.JSON(w, http.StatusCreated, row)
}

func (s *Server) updateTeacherAbsence(w http.ResponseWriter, r *http.Request) {
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

	var in teacherAbsencePayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TimetableWrite, authorization.TimetableWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entabsence.Columns, sent) {
		return
	}
	if !rejectWithdrawalFields(w, sent) {
		return
	}
	if !rejectImmutable(w, sent, "absence", entabsence.FieldTeacherID) {
		return
	}
	if !rejectNull(w, sent, entabsence.FieldFromDate, in.FromDate) ||
		!rejectNull(w, sent, entabsence.FieldToDate, in.ToDate) ||
		!rejectNull(w, sent, entabsence.FieldFromHalf, in.FromHalf) ||
		!rejectNull(w, sent, entabsence.FieldToHalf, in.ToHalf) {
		return
	}

	current, err := client.TeacherAbsence.Query().
		Where(entabsence.ID(id), teacherAbsencesFor(viewer, decision)).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, teacherAbsenceNotFound)
		return
	}
	if current.Status == entabsence.StatusWithdrawn {
		response.Error(w, http.StatusConflict,
			"this absence was withdrawn and cannot be amended; record a new one")
		return
	}

	existing := absenceWindowOf(current)
	win, ok := absenceWindowFrom(w, in, &existing)
	if !ok {
		return
	}
	if in.Reason != nil && !withinRunes(w, entabsence.FieldReason, *in.Reason, absenceReasonRunes) {
		return
	}
	if !absenceFreeOfOverlap(ctx, w, client, current.TeacherID, win, current.ID) {
		return
	}

	update := client.TeacherAbsence.Update().
		Where(entabsence.ID(id), teacherAbsencesFor(viewer, decision)).
		SetFromDate(win.From).
		SetToDate(win.To).
		SetFromHalf(entabsence.FromHalf(win.FromHalf)).
		SetToHalf(entabsence.ToHalf(win.ToHalf)).
		SetNillableReason(in.Reason)

	if wasCleared(sent, entabsence.FieldReason, in.Reason) {
		update = update.ClearReason()
	}

	n, err := update.Save(ctx)
	if !wroteScopedRow(w, n, err, teacherAbsenceNotFound) {
		return
	}

	row, err := client.TeacherAbsence.Query().Where(entabsence.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, teacherAbsenceNotFound)
		return
	}
	response.JSON(w, http.StatusOK, row)
}

func (s *Server) withdrawTeacherAbsence(w http.ResponseWriter, r *http.Request) {
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

	reason := r.URL.Query().Get("reason")
	if reason != "" && !withinRunes(w, entabsence.FieldWithdrawalReason, reason, absenceReasonRunes) {
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TimetableDelete, authorization.TimetableDeleteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	current, err := client.TeacherAbsence.Query().
		Where(entabsence.ID(id), teacherAbsencesFor(viewer, decision)).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, teacherAbsenceNotFound)
		return
	}
	if current.Status == entabsence.StatusWithdrawn {
		response.Error(w, http.StatusConflict, absenceAlreadyWithdrawn(current))
		return
	}

	withdrawer, ok := attributedToOptional(w, viewer, nil, entabsence.FieldWithdrawnBy)
	if !ok {
		return
	}

	update := client.TeacherAbsence.Update().
		Where(entabsence.ID(id), teacherAbsencesFor(viewer, decision)).
		SetStatus(entabsence.StatusWithdrawn).
		SetWithdrawnAt(nowUTC()).
		SetNillableWithdrawnBy(withdrawer)
	if reason != "" {
		update = update.SetWithdrawalReason(reason)
	}

	n, err := update.Save(ctx)
	if !wroteScopedRow(w, n, err, teacherAbsenceNotFound) {
		return
	}

	row, err := client.TeacherAbsence.Query().Where(entabsence.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, teacherAbsenceNotFound)
		return
	}

	readViewer, readDecision, err := s.scopeFor(ctx,
		authorization.TimetableRead, authorization.TimetableReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	cover, err := absenceCoverArranged(ctx, client, row, readViewer, readDecision)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	projected, err := projectAll(cover, readDecision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	traceProjection(r, readDecision.Fields, len(cover))

	response.JSON(w, http.StatusOK, response.Envelope{
		"teacher_absence":     row,
		"cover_left_in_place": projected,
		"cover_count":         len(cover),
	})
}

func absenceAlreadyWithdrawn(row *tenantent.TeacherAbsence) string {
	if row.WithdrawnAt == nil {
		return "this absence was already withdrawn"
	}
	return "this absence was already withdrawn on " + row.WithdrawnAt.Format(time.RFC3339)
}

func absenceCoverArranged(ctx context.Context, client *tenantent.Client,
	row *tenantent.TeacherAbsence, v *access.Viewer,
	d authorization.Decision) ([]*tenantent.TimetableDeviation, error) {
	return client.TimetableDeviation.Query().
		Where(
			entdeviation.KindEQ(entdeviation.KindSubstitution),
			entdeviation.DeviationDateGTE(timetablesvc.Day(row.FromDate)),
			entdeviation.DeviationDateLTE(timetablesvc.Day(row.ToDate)),
			entdeviation.HasTimetableSlotWith(entslot.TeacherIDEQ(row.TeacherID)),
			access.TimetableDeviationsFor(v, d),
		).
		Order(
			tenantent.Asc(entdeviation.FieldDeviationDate),
			tenantent.Asc(entdeviation.FieldID),
		).
		All(ctx)
}

type absenceLesson struct {
	timetablesvc.Occurrence
	Cover string `json:"cover"`
}

func absenceBranches(ctx context.Context, client *tenantent.Client, teacher uuid.UUID,
	v *access.Viewer, d authorization.Decision) ([]uuid.UUID, error) {
	slots, err := client.TimetableSlot.Query().
		Where(entslot.TeacherIDEQ(teacher), access.TimetableSlotsFor(v, d)).
		WithSection().
		All(ctx)
	if err != nil {
		return nil, err
	}

	seen := map[uuid.UUID]bool{}
	out := make([]uuid.UUID, 0, len(slots))
	for _, slot := range slots {
		if slot.Edges.Section == nil || seen[slot.Edges.Section.BranchID] {
			continue
		}
		seen[slot.Edges.Section.BranchID] = true
		out = append(out, slot.Edges.Section.BranchID)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].String() < out[j].String() })
	return out, nil
}

func sortAbsenceLessons(in []absenceLesson) {
	sort.SliceStable(in, func(i, j int) bool {
		a, b := in[i], in[j]
		if !a.Date.Equal(b.Date) {
			return a.Date.Before(b.Date)
		}
		if a.StartMinute != b.StartMinute {
			return a.StartMinute < b.StartMinute
		}
		if a.PeriodSequence != b.PeriodSequence {
			return a.PeriodSequence < b.PeriodSequence
		}
		return a.ID.String() < b.ID.String()
	})
}

func (s *Server) getTeacherAbsenceLessons(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	service, err := timetablesvc.FromContext(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	id, ok := idParam(w, r, "id")
	if !ok {
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TimetableRead, authorization.TimetableReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	row, err := client.TeacherAbsence.Query().
		Where(entabsence.ID(id), teacherAbsencesFor(viewer, decision)).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, teacherAbsenceNotFound)
		return
	}

	win := absenceWindowOf(row)
	branches, err := absenceBranches(ctx, client, row.TeacherID, viewer, decision)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	lessons := make([]absenceLesson, 0)
	counts := map[string]int{coverArranged: 0, coverMissing: 0, coverDropped: 0}
	for _, branch := range branches {
		occurrences, err := service.Resolve(ctx, timetablesvc.ResolveQuery{
			BranchID: branch,
			From:     win.From,
			To:       win.To,
			Half:     timetablesvc.HalfAny,
			Slots: []predicate.TimetableSlot{
				access.TimetableSlotsFor(viewer, decision),
				entslot.TeacherIDEQ(row.TeacherID),
			},
			Deviations: []predicate.TimetableDeviation{
				access.TimetableDeviationsFor(viewer, decision),
				entdeviation.HasTimetableSlotWith(entslot.TeacherIDEQ(row.TeacherID)),
			},
		})
		if err != nil {
			writeTimetableServiceErr(w, err, timetableNotFound)
			return
		}

		for _, occurrence := range occurrences {
			if !absenceCoversOccurrence(win, occurrence) {
				continue
			}
			cover := absenceCoverOf(occurrence, row.TeacherID)
			counts[cover]++
			lessons = append(lessons, absenceLesson{Occurrence: occurrence, Cover: cover})
		}
	}
	sortAbsenceLessons(lessons)

	projected, err := projectAll(lessons, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	traceProjection(r, decision.Fields, len(lessons))

	response.JSON(w, http.StatusOK, response.Envelope{
		"teacher_absence_id": row.ID,
		"teacher_id":         row.TeacherID,
		"status":             string(row.Status),
		"from":               win.From.Format(dateLayout),
		"to":                 win.To.Format(dateLayout),
		"from_half":          string(win.FromHalf),
		"to_half":            string(win.ToHalf),
		"lessons":            projected,
		"count":              len(lessons),
		"covered_count":      counts[coverArranged],
		"uncovered_count":    counts[coverMissing],
		"cancelled_count":    counts[coverDropped],
	})
}
