package http

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	entoffering "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/subjectoffering"
	entjob "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetablegenerationjob"
)

func (w *timetableWorld) subjectCode() string {
	w.t.Helper()

	offering, err := w.db.Client.SubjectOffering.Query().
		Where(entoffering.ID(w.taughtOfferingID)).
		WithSubject().
		Only(context.Background())
	if err != nil {
		w.t.Fatalf("reading the offering's subject: %v", err)
	}
	if offering.Edges.Subject == nil {
		w.t.Fatal("the offering carries no subject, so there is no code to generate against")
	}
	return offering.Edges.Subject.Code
}

func TestGenerateRefusesASubjectCodeTheBranchDoesNotTeach(t *testing.T) {
	w := newTimetableWorld(t)
	server := generatingServer(t, w)
	useProbeGenerator(t, func(http.ResponseWriter, *http.Request) {
		t.Error("the solver was called for a heavy subject the branch does not teach")
	})

	draft := w.draft(&w.timetableID, timetableDate(2026, time.April, 1))
	rec := w.call(server.generateTimetable, "POST",
		"/api/v1/timetables/"+draft.ID.String()+"/generate",
		`{"heavy_subjects":["NOSUCHSUBJECT"]}`, draft.ID)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("want 422 for a subject code nothing is offered under, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if !strings.Contains(rec.Body.String(), "NOSUCHSUBJECT") {
		t.Errorf("the refusal does not name the code it rejected: %s",
			strings.TrimSpace(rec.Body.String()))
	}
	if !strings.Contains(rec.Body.String(), "heavy_subjects") {
		t.Errorf("the refusal does not name the field: %s",
			strings.TrimSpace(rec.Body.String()))
	}
}

func TestGenerateRefusesARequiredRoomTypeKeyedByAnOfferingID(t *testing.T) {
	w := newTimetableWorld(t)
	server := generatingServer(t, w)
	useProbeGenerator(t, func(http.ResponseWriter, *http.Request) {
		t.Error("the solver was called for a room type keyed by an offering id")
	})

	draft := w.draft(&w.timetableID, timetableDate(2026, time.April, 1))
	body := `{"required_room_type":{"` + w.taughtOfferingID.String() + `":"classroom"}}`
	rec := w.call(server.generateTimetable, "POST",
		"/api/v1/timetables/"+draft.ID.String()+"/generate", body, draft.ID)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("required_room_type is keyed by subject code, not offering id; "+
			"an offering id got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if !strings.Contains(rec.Body.String(), w.taughtOfferingID.String()) {
		t.Errorf("the refusal does not name the key it rejected: %s",
			strings.TrimSpace(rec.Body.String()))
	}
}

func TestGenerateRefusesASubjectCodeInTheWrongCase(t *testing.T) {
	w := newTimetableWorld(t)
	server := generatingServer(t, w)
	useProbeGenerator(t, func(http.ResponseWriter, *http.Request) {
		t.Error("the solver was called for a subject code it would not have matched")
	})

	code := w.subjectCode()
	draft := w.draft(&w.timetableID, timetableDate(2026, time.April, 1))
	rec := w.call(server.generateTimetable, "POST",
		"/api/v1/timetables/"+draft.ID.String()+"/generate",
		`{"heavy_subjects":["`+strings.ToLower(code)+`"]}`, draft.ID)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("the solver matches a subject code exactly, so the lower-cased %s "+
			"would have been ignored; got %d: %s",
			code, rec.Code, strings.TrimSpace(rec.Body.String()))
	}
}

func TestGenerateRefusesARoomTypeNoRoomInTheBranchHas(t *testing.T) {
	w := newTimetableWorld(t)
	server := generatingServer(t, w)
	useProbeGenerator(t, func(http.ResponseWriter, *http.Request) {
		t.Error("the solver was called for a room type the branch has no room of")
	})

	draft := w.draft(&w.timetableID, timetableDate(2026, time.April, 1))
	body := `{"required_room_type":{"` + w.subjectCode() + `":"planetarium"}}`
	rec := w.call(server.generateTimetable, "POST",
		"/api/v1/timetables/"+draft.ID.String()+"/generate", body, draft.ID)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("want 422 for a room type no room has, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if !strings.Contains(rec.Body.String(), "planetarium") {
		t.Errorf("the refusal does not name the room type it rejected: %s",
			strings.TrimSpace(rec.Body.String()))
	}
}

func TestGenerateAcceptsTheSubjectCodesTheBranchTeaches(t *testing.T) {
	w := newTimetableWorld(t)
	server := generatingServer(t, w)
	useProbeGenerator(t, func(rw http.ResponseWriter, _ *http.Request) {
		rw.WriteHeader(http.StatusUnauthorized)
	})

	code := w.subjectCode()
	draft := w.draft(&w.timetableID, timetableDate(2026, time.April, 1))
	body := `{"heavy_subjects":["` + code + `"],` +
		`"required_room_type":{"` + code + `":"classroom"}}`
	rec := w.call(server.generateTimetable, "POST",
		"/api/v1/timetables/"+draft.ID.String()+"/generate", body, draft.ID)

	if rec.Code != http.StatusAccepted {
		t.Fatalf("want 202 for the branch's own subject code, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	var accepted struct {
		ID uuid.UUID `json:"id"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &accepted); err != nil {
		t.Fatalf("decoding the job: %v (%s)", err, rec.Body.String())
	}

	timetableGenerator.Drain()

	job, err := w.db.Client.TimetableGenerationJob.Query().
		Where(entjob.ID(accepted.ID)).Only(context.Background())
	if err != nil {
		t.Fatalf("reading the job back: %v", err)
	}
	if len(job.Options.HeavySubjects) != 1 || job.Options.HeavySubjects[0] != code {
		t.Errorf("the job carries heavy_subjects %v, not the %s asked for",
			job.Options.HeavySubjects, code)
	}
	if job.Options.RequiredRoomType[code] != "classroom" {
		t.Errorf("the job carries required_room_type %v, not a classroom for %s",
			job.Options.RequiredRoomType, code)
	}
}

func TestGenerateStillAcceptsARequestThatNamesNoSubject(t *testing.T) {
	w := newTimetableWorld(t)
	server := generatingServer(t, w)
	useProbeGenerator(t, func(rw http.ResponseWriter, _ *http.Request) {
		rw.WriteHeader(http.StatusUnauthorized)
	})

	draft := w.draft(&w.timetableID, timetableDate(2026, time.April, 1))
	rec := w.call(server.generateTimetable, "POST",
		"/api/v1/timetables/"+draft.ID.String()+"/generate", `{"max_seconds":5}`, draft.ID)

	if rec.Code != http.StatusAccepted {
		t.Fatalf("want 202 where neither option is named at all, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	timetableGenerator.Drain()
}

func generateProbeVocabulary() generateVocabulary {
	return generateVocabulary{
		subjectCodes: []string{"ENG", "MATH", "SCI"},
		roomTypes:    []string{"classroom", "laboratory"},
	}
}

func checkedSubjects(t *testing.T, in timetableGeneratePayload) *httptest.ResponseRecorder {
	t.Helper()

	rec := httptest.NewRecorder()
	ok := checkGenerateSubjects(rec, in, generateProbeVocabulary())
	if ok != (rec.Code == http.StatusOK) {
		t.Fatalf("the check answered %v and wrote %d; the two disagree", ok, rec.Code)
	}
	return rec
}

func TestGenerateSubjectCheckRefusesACodeNoOfferingUses(t *testing.T) {
	rec := checkedSubjects(t, timetableGeneratePayload{HeavySubjects: []string{"HIST"}})

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("want 422 for HIST, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	body := rec.Body.String()
	for _, want := range []string{"heavy_subjects", "HIST", "ENG, MATH, SCI"} {
		if !strings.Contains(body, want) {
			t.Errorf("the refusal does not carry %q: %s", want, strings.TrimSpace(body))
		}
	}
}

func TestGenerateSubjectCheckRefusesAnOfferingIDWhereACodeBelongs(t *testing.T) {
	offering := uuid.NewString()
	rec := checkedSubjects(t, timetableGeneratePayload{
		RequiredRoomType: map[string]string{offering: "laboratory"},
	})

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("required_room_type is keyed by subject code; an offering id got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if !strings.Contains(rec.Body.String(), offering) {
		t.Errorf("the refusal does not name the key it rejected: %s",
			strings.TrimSpace(rec.Body.String()))
	}
	if !strings.Contains(rec.Body.String(), "not offering ids") {
		t.Errorf("the refusal does not say what the field actually takes: %s",
			strings.TrimSpace(rec.Body.String()))
	}
}

func TestGenerateSubjectCheckRefusesTheWrongCase(t *testing.T) {
	rec := checkedSubjects(t, timetableGeneratePayload{HeavySubjects: []string{"math"}})

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("the solver matches a code exactly, so math is not MATH; got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if !strings.Contains(rec.Body.String(), "case and spacing") {
		t.Errorf("the refusal does not say the match is exact: %s",
			strings.TrimSpace(rec.Body.String()))
	}
}

func TestGenerateSubjectCheckRefusesSurroundingSpace(t *testing.T) {
	rec := checkedSubjects(t, timetableGeneratePayload{HeavySubjects: []string{" MATH"}})

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("a leading space is not part of the code the solver sees; got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
}

func TestGenerateSubjectCheckRefusesARoomTypeNoRoomHas(t *testing.T) {
	rec := checkedSubjects(t, timetableGeneratePayload{
		RequiredRoomType: map[string]string{"SCI": "planetarium"},
	})

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("want 422 for a room type no room has, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	body := rec.Body.String()
	for _, want := range []string{"SCI", "planetarium", "classroom, laboratory"} {
		if !strings.Contains(body, want) {
			t.Errorf("the refusal does not carry %q: %s", want, strings.TrimSpace(body))
		}
	}
}

func TestGenerateSubjectCheckRefusesAnEmptyCodeOrRoomType(t *testing.T) {
	empty := checkedSubjects(t, timetableGeneratePayload{HeavySubjects: []string{""}})
	if empty.Code != http.StatusUnprocessableEntity {
		t.Fatalf("an empty code got %d: %s", empty.Code,
			strings.TrimSpace(empty.Body.String()))
	}

	blank := checkedSubjects(t, timetableGeneratePayload{
		RequiredRoomType: map[string]string{"SCI": ""},
	})
	if blank.Code != http.StatusUnprocessableEntity {
		t.Fatalf("an empty room type got %d: %s", blank.Code,
			strings.TrimSpace(blank.Body.String()))
	}
}

func TestGenerateSubjectCheckPassesTheCodesTheBranchTeaches(t *testing.T) {
	rec := checkedSubjects(t, timetableGeneratePayload{
		HeavySubjects:    []string{"MATH", "SCI"},
		RequiredRoomType: map[string]string{"SCI": "laboratory", "MATH": "classroom"},
	})

	if rec.Code != http.StatusOK {
		t.Fatalf("the branch's own codes were refused with %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
}

func TestGenerateSubjectCheckNamesTheFirstUnknownInAStableOrder(t *testing.T) {
	first := checkedSubjects(t, timetableGeneratePayload{
		RequiredRoomType: map[string]string{"AAA": "laboratory", "ZZZ": "laboratory"},
	})
	if !strings.Contains(first.Body.String(), "AAA") {
		t.Errorf("two unknown keys should refuse on the first in sorted order: %s",
			strings.TrimSpace(first.Body.String()))
	}
}

func TestGenerateRefusesASubjectCodeOnlyAnotherBranchTeaches(t *testing.T) {
	w := newTimetableWorld(t)
	server := generatingServer(t, w)
	useProbeGenerator(t, func(http.ResponseWriter, *http.Request) {
		t.Error("the solver was called for a subject code that reaches no section here")
	})

	ctx := context.Background()
	tag := uuid.NewString()[:8]
	elsewhere := w.db.Client.Branch.Create().
		SetName("Other Campus " + tag).
		SetCode("OTB-" + tag).
		SaveX(ctx)
	grade := w.db.Client.GradeLevel.Create().
		SetName("XII " + tag).
		SetCode("OTG-" + tag).
		SetSequence(12).
		SaveX(ctx)
	section := w.db.Client.Section.Create().
		SetAcademicSessionID(w.sessionID).
		SetBranchID(elsewhere.ID).
		SetGradeLevelID(grade.ID).
		SetName("C").
		SetCode("OTS-" + tag).
		SaveX(ctx)
	subject := w.db.Client.Subject.Create().
		SetName("Astronomy " + tag).
		SetCode("OTA-" + tag).
		SaveX(ctx)
	w.db.Client.SubjectOffering.Create().
		SetAcademicSessionID(w.sessionID).
		SetSectionID(section.ID).
		SetSubjectID(subject.ID).
		SaveX(ctx)

	draft := w.draft(&w.timetableID, timetableDate(2026, time.April, 1))
	rec := w.call(server.generateTimetable, "POST",
		"/api/v1/timetables/"+draft.ID.String()+"/generate",
		`{"heavy_subjects":["`+subject.Code+`"]}`, draft.ID)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("%s is taught at another branch and reaches no section this timetable "+
			"covers, so the constraint would bind nothing; got %d: %s",
			subject.Code, rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if !strings.Contains(rec.Body.String(), subject.Code) {
		t.Errorf("the refusal does not name the code it rejected: %s",
			strings.TrimSpace(rec.Body.String()))
	}
}
