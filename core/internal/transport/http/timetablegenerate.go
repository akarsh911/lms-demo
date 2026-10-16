package http

import (
	"context"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	"github.com/Harbour-Emerge/emerge-core/internal/domain/shared"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entroom "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/room"
	entsection "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/section"
	entsubject "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/subject"
	entoffering "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/subjectoffering"
	enttimetable "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetable"
	entjob "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetablegenerationjob"
	"github.com/Harbour-Emerge/emerge-core/internal/service/timetablegen"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

const timetableJobNotFound = "timetable generation not found"

const timetableGenerateUnavailable = "automatic timetable generation is not configured on this " +
	"deployment; a week can still be arranged by hand"

var timetableGenerator *timetablegen.Dispatcher

func UseTimetableSolver(d *timetablegen.Dispatcher) { timetableGenerator = d }

type timetableGenerateCell struct {
	DayOfWeek int       `json:"day_of_week"`
	PeriodID  uuid.UUID `json:"period_id"`
}

type timetableGenerateContact struct {
	SectionID    string   `json:"section_id"`
	OfferingIDs  []string `json:"offering_ids"`
	ClassTeacher bool     `json:"class_teacher"`
	MinPerDay    *int     `json:"min_per_day"`
}

type timetableGeneratePayload struct {
	MaxSeconds       *int                               `json:"max_seconds"`
	ReplaceExisting  *bool                              `json:"replace_existing"`
	Hint             *bool                              `json:"hint"`
	MinutesBasis     *string                            `json:"minutes_basis"`
	Demand           map[string]int                     `json:"demand"`
	Pins             map[string]map[string]int          `json:"pins"`
	Unavailable      map[string][]timetableGenerateCell `json:"unavailable"`
	RequiredRoomType map[string]string                  `json:"required_room_type"`
	HeavySubjects    []string                           `json:"heavy_subjects"`
	Weights          map[string]int                     `json:"weights"`
	DailyContact     []timetableGenerateContact         `json:"daily_contact"`
}

func (s *Server) generateTimetable(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	if s.cfg == nil || !s.cfg.TimetableGenerating() || timetableGenerator == nil {
		response.Error(w, http.StatusServiceUnavailable, timetableGenerateUnavailable)
		return
	}

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	id, ok := idParam(w, r, "id")
	if !ok {
		return
	}

	var in timetableGeneratePayload
	if err := response.Decode(r, &in); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TimetableWrite, authorization.TimetableWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	target, err := client.Timetable.Query().
		Where(enttimetable.ID(id), access.TimetablesWritableBy(viewer, decision)).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, timetableNotFound)
		return
	}
	if target.Status != enttimetable.StatusDraft {
		response.Error(w, http.StatusUnprocessableEntity,
			"a generated week is written as a draft for a person to publish, so "+
				"auto-fill only runs on a draft; this one is "+string(target.Status))
		return
	}

	seconds, ok := s.generateSeconds(w, in)
	if !ok {
		return
	}
	options, ok := readGenerateOptions(w, in, seconds)
	if !ok {
		return
	}
	if !s.generateNamesKnownSubjects(ctx, w, client, target, in) {
		return
	}
	if !s.generateHasRoom(ctx, w, client, target) {
		return
	}

	job, err := client.TimetableGenerationJob.Create().
		SetTimetableID(target.ID).
		SetMaxSeconds(seconds).
		SetOptions(options).
		SetNillableRequestedBy(viewer.PersonID).
		Save(ctx)
	if err != nil {
		if tenantent.IsConstraintError(err) {
			response.Error(w, http.StatusConflict,
				"this timetable is already being generated; wait for that run to finish")
			return
		}
		writeTenantEntErr(w, err, timetableNotFound)
		return
	}

	if err := timetableGenerator.Submit(client, job.ID); err != nil {
		s.abandonGeneration(r, client, job, err)
		response.Error(w, http.StatusServiceUnavailable,
			"every solver slot and the queue behind it are full; try again shortly")
		return
	}

	location := "/api/v1/timetables/" + target.ID.String() + "/generate/" + job.ID.String()
	w.Header().Set("Location", location)
	response.JSON(w, http.StatusAccepted, generationBody(job))
}

func (s *Server) getTimetableGeneration(w http.ResponseWriter, r *http.Request) {
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
	jobID, err := uuid.Parse(chi.URLParam(r, "job"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "job must be a UUID")
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.TimetableRead, authorization.TimetableReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	job, err := client.TimetableGenerationJob.Query().
		Where(
			entjob.ID(jobID),
			entjob.TimetableID(id),
			entjob.HasTimetableWith(access.TimetablesFor(viewer, decision)),
		).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, timetableJobNotFound)
		return
	}
	response.JSON(w, http.StatusOK, generationBody(job))
}

func (s *Server) generateSeconds(w http.ResponseWriter, in timetableGeneratePayload) (int, bool) {
	seconds := s.cfg.TimetableSolverMaxSeconds
	if in.MaxSeconds != nil {
		seconds = *in.MaxSeconds
	}
	if seconds < timetablegen.MinimumSolveSeconds || seconds > timetablegen.MaximumSolveSeconds {
		response.Error(w, http.StatusUnprocessableEntity,
			"max_seconds must be between "+strconv.Itoa(timetablegen.MinimumSolveSeconds)+
				" and "+strconv.Itoa(timetablegen.MaximumSolveSeconds))
		return 0, false
	}
	return seconds, true
}

func (s *Server) generateHasRoom(ctx context.Context, w http.ResponseWriter,
	client *tenantent.Client, target *tenantent.Timetable) bool {

	ignore := uuid.Nil
	if target.SupersedesID != nil {
		ignore = *target.SupersedesID
	}
	rival, err := timetablegen.OverlappingVersions(ctx, client, target, ignore)
	if err != nil {
		writeTenancyErr(w, err)
		return false
	}
	if len(rival) == 0 {
		return true
	}
	names := make([]string, 0, len(rival))
	for _, version := range rival {
		names = append(names, "version "+strconv.Itoa(version.Version)+" ("+string(version.Status)+")")
	}
	response.Error(w, http.StatusUnprocessableEntity,
		"this draft runs over the same dates as "+strings.Join(names, ", ")+
			" on the same period scheme, so every lesson the solver placed would collide "+
			"with one already there; move the draft's effective_from past that version, or "+
			"set supersedes_id to say the draft replaces it")
	return false
}

type generateVocabulary struct {
	subjectCodes []string
	roomTypes    []string
}

func (s *Server) generateNamesKnownSubjects(ctx context.Context, w http.ResponseWriter,
	client *tenantent.Client, target *tenantent.Timetable,
	in timetableGeneratePayload) bool {

	if len(in.RequiredRoomType) == 0 && len(in.HeavySubjects) == 0 {
		return true
	}
	known, err := generateVocabularyOf(ctx, client, target.PeriodSchemeID)
	if err != nil {
		writeTenancyErr(w, err)
		return false
	}
	return checkGenerateSubjects(w, in, known)
}

func generateVocabularyOf(ctx context.Context, client *tenantent.Client,
	scheme uuid.UUID) (generateVocabulary, error) {

	var known generateVocabulary
	branchID, err := branchOfScheme(ctx, client, scheme)
	if err != nil {
		return known, err
	}
	codes, err := client.Subject.Query().
		Where(entsubject.HasOfferingsWith(
			entoffering.StatusEQ(entoffering.StatusActive),
			entoffering.HasSectionWith(
				entsection.BranchID(branchID),
				entsection.StatusEQ(entsection.StatusActive),
			),
		)).
		GroupBy(entsubject.FieldCode).
		Strings(ctx)
	if err != nil {
		return known, err
	}
	types, err := client.Room.Query().
		Where(entroom.BranchID(branchID), entroom.StatusEQ(entroom.StatusActive)).
		GroupBy(entroom.FieldRoomType).
		Strings(ctx)
	if err != nil {
		return known, err
	}
	sort.Strings(codes)
	sort.Strings(types)
	known.subjectCodes = codes
	known.roomTypes = types
	return known, nil
}

func checkGenerateSubjects(w http.ResponseWriter, in timetableGeneratePayload,
	known generateVocabulary) bool {

	keyed := make([]string, 0, len(in.RequiredRoomType))
	for code := range in.RequiredRoomType {
		keyed = append(keyed, code)
	}
	sort.Strings(keyed)
	for _, code := range keyed {
		if !generateSubjectCode(w, "required_room_type", code, known) {
			return false
		}
		if !generateRoomType(w, code, in.RequiredRoomType[code], known) {
			return false
		}
	}
	for _, code := range in.HeavySubjects {
		if !generateSubjectCode(w, "heavy_subjects", code, known) {
			return false
		}
	}
	return true
}

func generateSubjectCode(w http.ResponseWriter, field, code string,
	known generateVocabulary) bool {

	if code == "" {
		response.Error(w, http.StatusUnprocessableEntity,
			field+" takes subject codes and one of them is empty")
		return false
	}
	if oneOf(code, known.subjectCodes) {
		return true
	}
	response.Error(w, http.StatusUnprocessableEntity,
		field+" takes subject codes, not offering ids, and "+code+
			" is not a code this branch teaches under; "+offeredSubjects(known)+
			". A code is matched exactly, so case and spacing have to match too")
	return false
}

func generateRoomType(w http.ResponseWriter, code, wanted string,
	known generateVocabulary) bool {

	if wanted == "" {
		response.Error(w, http.StatusUnprocessableEntity,
			"required_room_type["+code+"] names no room type; leave the subject out "+
				"to let it sit in the section's own room")
		return false
	}
	if oneOf(wanted, known.roomTypes) {
		return true
	}
	response.Error(w, http.StatusUnprocessableEntity,
		"required_room_type asks for "+code+" in a "+wanted+" and no active room in "+
			"this branch is one, so nothing could be placed; "+offeredRoomTypes(known)+
			". A room type is matched exactly, so case and spacing have to match too")
	return false
}

func offeredSubjects(known generateVocabulary) string {
	if len(known.subjectCodes) == 0 {
		return "this branch has no active offering at all, so it teaches under no code"
	}
	return "the codes it teaches under are " + strings.Join(known.subjectCodes, ", ")
}

func offeredRoomTypes(known generateVocabulary) string {
	if len(known.roomTypes) == 0 {
		return "this branch has no active room at all"
	}
	return "the room types it has are " + strings.Join(known.roomTypes, ", ")
}

func readGenerateOptions(w http.ResponseWriter, in timetableGeneratePayload,
	seconds int) (shared.GenerationOptions, bool) {

	out := shared.GenerationOptions{MaxSeconds: seconds, Hint: true}
	if in.ReplaceExisting != nil {
		out.ReplaceExisting = *in.ReplaceExisting
	}
	if in.Hint != nil {
		out.Hint = *in.Hint
	}
	if in.MinutesBasis != nil {
		if !oneOf(*in.MinutesBasis, timetablegen.MinutesBases) {
			response.Error(w, http.StatusUnprocessableEntity,
				"minutes_basis must be one of "+strings.Join(timetablegen.MinutesBases, ", "))
			return out, false
		}
		out.MinutesBasis = *in.MinutesBasis
	}

	for key, count := range in.Demand {
		if !generateIdentifier(w, "demand", key) {
			return out, false
		}
		if count < 0 {
			response.Error(w, http.StatusUnprocessableEntity,
				"demand cannot be negative: "+key)
			return out, false
		}
	}
	out.Demand = in.Demand

	for key, days := range in.Pins {
		if !generateIdentifier(w, "pins", key) {
			return out, false
		}
		for day, count := range days {
			value, err := strconv.Atoi(day)
			if err != nil || value < 1 || value > 7 {
				response.Error(w, http.StatusUnprocessableEntity,
					"pins takes an ISO day of week, 1 through 7, not "+day)
				return out, false
			}
			if count < 0 {
				response.Error(w, http.StatusUnprocessableEntity,
					"a pinned count cannot be negative: "+key)
				return out, false
			}
		}
	}
	out.Pins = in.Pins

	if len(in.Unavailable) > 0 {
		out.Unavailable = map[string][]shared.GenerationCell{}
		for key, cells := range in.Unavailable {
			if !generateIdentifier(w, "unavailable", key) {
				return out, false
			}
			blocked := make([]shared.GenerationCell, 0, len(cells))
			for _, cell := range cells {
				if cell.DayOfWeek < 1 || cell.DayOfWeek > 7 {
					response.Error(w, http.StatusUnprocessableEntity,
						"unavailable takes an ISO day of week, 1 through 7")
					return out, false
				}
				if cell.PeriodID == uuid.Nil {
					response.Error(w, http.StatusUnprocessableEntity,
						"unavailable needs a period_id on every cell")
					return out, false
				}
				blocked = append(blocked, shared.GenerationCell{
					DayOfWeek: cell.DayOfWeek, PeriodID: cell.PeriodID,
				})
			}
			out.Unavailable[key] = blocked
		}
	}

	for name, weight := range in.Weights {
		if !oneOf(name, timetablegen.WeightNames) {
			response.Error(w, http.StatusUnprocessableEntity,
				"weights has no "+name+"; the penalties are "+
					strings.Join(timetablegen.WeightNames, ", "))
			return out, false
		}
		if weight < 0 {
			response.Error(w, http.StatusUnprocessableEntity,
				"a weight is a penalty and cannot be negative: "+name)
			return out, false
		}
	}
	out.Weights = in.Weights
	out.RequiredRoomType = in.RequiredRoomType
	out.HeavySubjects = in.HeavySubjects

	if !readDailyContact(w, in, &out) {
		return out, false
	}
	return out, true
}

func readDailyContact(w http.ResponseWriter, in timetableGeneratePayload,
	out *shared.GenerationOptions) bool {

	if len(in.DailyContact) == 0 {
		return true
	}
	rules := make([]shared.DailyContactRule, 0, len(in.DailyContact))
	for _, rule := range in.DailyContact {
		if !generateIdentifier(w, "daily_contact.section_id", rule.SectionID) {
			return false
		}
		if rule.ClassTeacher == (len(rule.OfferingIDs) > 0) {
			response.Error(w, http.StatusUnprocessableEntity,
				"a daily_contact rule either names offering_ids or sets class_teacher "+
					"so this service resolves them, and it must do exactly one of the two")
			return false
		}
		for _, id := range rule.OfferingIDs {
			if !generateIdentifier(w, "daily_contact.offering_ids", id) {
				return false
			}
		}
		minimum := 1
		if rule.MinPerDay != nil {
			minimum = *rule.MinPerDay
		}
		if minimum < 1 {
			response.Error(w, http.StatusUnprocessableEntity,
				"daily_contact.min_per_day is a floor of at least one lesson a day; "+
					"leave the rule out to ask for nothing")
			return false
		}
		rules = append(rules, shared.DailyContactRule{
			SectionID:    rule.SectionID,
			OfferingIDs:  rule.OfferingIDs,
			ClassTeacher: rule.ClassTeacher,
			MinPerDay:    minimum,
		})
	}
	out.DailyContact = rules
	return true
}

func generateIdentifier(w http.ResponseWriter, field, key string) bool {
	if _, err := uuid.Parse(key); err != nil {
		response.Error(w, http.StatusUnprocessableEntity,
			field+" is keyed by a UUID and "+key+" is not one")
		return false
	}
	return true
}

func oneOf(value string, allowed []string) bool {
	for _, candidate := range allowed {
		if candidate == value {
			return true
		}
	}
	return false
}

func (s *Server) abandonGeneration(r *http.Request, client *tenantent.Client,
	job *tenantent.TimetableGenerationJob, cause error) {

	ctx, cancel := timeout(r)
	defer cancel()

	err := client.TimetableGenerationJob.UpdateOne(job).
		SetStatus(entjob.StatusFailed).
		SetFailureReason(entjob.FailureReasonInternal).
		SetFinishedAt(time.Now().UTC()).
		SetDetail(cause.Error()).
		Exec(ctx)
	if err != nil && s.logger != nil {
		s.logger.Error("a timetable generation was refused a queue slot and the row "+
			"still says queued", "job", job.ID, "error", err)
	}
}

func generationTerminal(status entjob.Status) bool {
	switch status {
	case entjob.StatusSucceeded, entjob.StatusInfeasible, entjob.StatusFailed:
		return true
	}
	return false
}

func generationBody(job *tenantent.TimetableGenerationJob) response.Envelope {
	body := response.Envelope{
		"id":              job.ID,
		"timetable_id":    job.TimetableID,
		"status":          job.Status,
		"terminal":        generationTerminal(job.Status),
		"max_seconds":     job.MaxSeconds,
		"requested_by":    job.RequestedBy,
		"created_at":      job.CreatedAt,
		"started_at":      job.StartedAt,
		"finished_at":     job.FinishedAt,
		"slots_written":   job.SlotsWritten,
		"wall_time_ms":    job.WallTimeMs,
		"solver_status":   job.SolverStatus,
		"verdict":         job.Verdict,
		"objective":       job.Objective,
		"failure_reason":  job.FailureReason,
		"detail":          job.Detail,
		"core_keys":       job.CoreKeys,
		"warnings":        job.Warnings,
		"soft_violations": job.SoftViolations,
	}
	return body
}
