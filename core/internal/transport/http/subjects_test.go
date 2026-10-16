package http

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	entexam "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/exam"
	entgradingscheme "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/gradingscheme"
	entoffering "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/subjectoffering"
)

type offeringWorld struct {
	*compositionWorld
}

func newOfferingWorld(t *testing.T) *offeringWorld {
	t.Helper()
	return &offeringWorld{compositionWorld: newCompositionWorld(t)}
}

func (o *offeringWorld) write(handler http.HandlerFunc, method, target, body string,
	id uuid.UUID) *httptest.ResponseRecorder {
	o.t.Helper()

	params := map[string]string{}
	if id != uuid.Nil {
		params["id"] = id.String()
	}
	saved := o.ctx
	o.ctx = authorization.WithDecision(saved, authorization.Decision{
		Allowed: true,
		Rule:    "subject offering write, no field policy",
	})
	rec := o.call(handler, method, target, body, params)
	o.ctx = saved
	return rec
}

func (o *offeringWorld) createOffering(body string) *httptest.ResponseRecorder {
	o.t.Helper()

	return o.write(o.composer.createOffering, http.MethodPost, "/api/v1/subject-offerings",
		body, uuid.Nil)
}

func (o *offeringWorld) patchOffering(id uuid.UUID, body string) *httptest.ResponseRecorder {
	o.t.Helper()

	return o.write(o.composer.updateOffering, http.MethodPatch,
		"/api/v1/subject-offerings/"+id.String(), body, id)
}

func (o *offeringWorld) attachedScheme(id uuid.UUID) *uuid.UUID {
	o.t.Helper()

	row, err := o.db.Client.SubjectOffering.Get(context.Background(), id)
	if err != nil {
		o.t.Fatalf("the offering %s could not be read back: %v", id, err)
	}
	return row.ResultSchemeID
}

func (o *offeringWorld) activeScheme() uuid.UUID {
	o.t.Helper()

	scheme := o.newScheme("")
	component := o.newComponent(scheme, `{"name":"Annual","maximum_marks":100,"weight":100}`)
	o.mustLink(component, o.newExam("Annual "+uuid.NewString()[:6], entexam.AssessmentKindEvaluative))
	if rec := o.setStatus(scheme, "active"); rec.Code != http.StatusOK {
		o.t.Fatalf("the scheme must activate: %d %s", rec.Code, rec.Body.String())
	}
	return scheme
}

func (o *offeringWorld) newOfferingBody(subject uuid.UUID, fields string) string {
	return fmt.Sprintf(`{"academic_session_id":%q,"section_id":%q,"subject_id":%q%s}`,
		o.sessionID, o.sectionB, subject, fields)
}

func (o *offeringWorld) createdID(rec *httptest.ResponseRecorder) uuid.UUID {
	o.t.Helper()

	if rec.Code != http.StatusCreated {
		o.t.Fatalf("want 201, got %d: %s", rec.Code, rec.Body.String())
	}
	var row struct {
		ID uuid.UUID `json:"id"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &row); err != nil {
		o.t.Fatalf("the created offering could not be read: %v (%s)", err, rec.Body.String())
	}
	return row.ID
}

func (o *offeringWorld) newSubject(name string) uuid.UUID {
	o.t.Helper()

	return o.db.Client.Subject.Create().
		SetName("Offering subject " + name).
		SetCode("OFS-" + uuid.NewString()[:8]).
		SaveX(context.Background()).ID
}

func TestAnOfferingIsCreatedWithAResultScheme(t *testing.T) {
	o := newOfferingWorld(t)
	scheme := o.activeScheme()

	body := o.newOfferingBody(o.newSubject("create"),
		fmt.Sprintf(`,"result_scheme_id":%q`, scheme))
	id := o.createdID(o.createOffering(body))

	attached := o.attachedScheme(id)
	if attached == nil || *attached != scheme {
		t.Fatalf("the offering must carry the scheme it was created with, got %v", attached)
	}
}

func TestAnOfferingTakesAResultSchemeOnUpdate(t *testing.T) {
	o := newOfferingWorld(t)
	scheme := o.activeScheme()

	rec := o.patchOffering(o.physicsA, fmt.Sprintf(`{"result_scheme_id":%q}`, scheme))
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, rec.Body.String())
	}

	attached := o.attachedScheme(o.physicsA)
	if attached == nil || *attached != scheme {
		t.Fatalf("the update must attach the scheme, got %v", attached)
	}
}

func TestAnExplicitNullDetachesTheResultScheme(t *testing.T) {
	o := newOfferingWorld(t)
	scheme := o.activeScheme()

	if rec := o.patchOffering(o.physicsA,
		fmt.Sprintf(`{"result_scheme_id":%q}`, scheme)); rec.Code != http.StatusOK {
		t.Fatalf("the scheme must attach first: %d %s", rec.Code, rec.Body.String())
	}

	rec := o.patchOffering(o.physicsA, `{"result_scheme_id":null}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if attached := o.attachedScheme(o.physicsA); attached != nil {
		t.Fatalf("an explicit null must detach the scheme, got %v", attached)
	}
}

func TestAnOmittedResultSchemeLeavesTheAttachedSchemeAlone(t *testing.T) {
	o := newOfferingWorld(t)
	scheme := o.activeScheme()

	if rec := o.patchOffering(o.physicsA,
		fmt.Sprintf(`{"result_scheme_id":%q}`, scheme)); rec.Code != http.StatusOK {
		t.Fatalf("the scheme must attach first: %d %s", rec.Code, rec.Body.String())
	}

	rec := o.patchOffering(o.physicsA, `{"periods_per_week":6}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, rec.Body.String())
	}
	attached := o.attachedScheme(o.physicsA)
	if attached == nil || *attached != scheme {
		t.Fatalf("an omitted key must leave the scheme attached, got %v", attached)
	}
}

func TestADraftResultSchemeMayNotBeAttachedToAnOffering(t *testing.T) {
	o := newOfferingWorld(t)

	draft := o.newScheme("")
	o.newComponent(draft, `{"name":"Annual","maximum_marks":100,"weight":40}`)

	o.refusalSays(o.patchOffering(o.physicsA, fmt.Sprintf(`{"result_scheme_id":%q}`, draft)),
		http.StatusUnprocessableEntity, "result_scheme_not_active", "draft")
	if attached := o.attachedScheme(o.physicsA); attached != nil {
		t.Fatalf("a refused attachment must not be written, got %v", attached)
	}

	body := o.newOfferingBody(o.newSubject("draft"), fmt.Sprintf(`,"result_scheme_id":%q`, draft))
	o.refusalSays(o.createOffering(body), http.StatusUnprocessableEntity, "result_scheme_not_active")

	count, err := o.db.Client.SubjectOffering.Query().
		Where(entoffering.ResultSchemeID(draft)).Count(context.Background())
	if err != nil {
		t.Fatalf("the offerings could not be counted: %v", err)
	}
	if count != 0 {
		t.Fatalf("a draft scheme must compose nothing, got %d offerings", count)
	}
}

func TestAnInactiveResultSchemeMayNotBeAttachedToAnOffering(t *testing.T) {
	o := newOfferingWorld(t)

	scheme := o.activeScheme()
	if rec := o.setStatus(scheme, "inactive"); rec.Code != http.StatusOK {
		t.Fatalf("the scheme must retire: %d %s", rec.Code, rec.Body.String())
	}

	o.refusalSays(o.patchOffering(o.physicsA, fmt.Sprintf(`{"result_scheme_id":%q}`, scheme)),
		http.StatusUnprocessableEntity, "result_scheme_not_active", "inactive")
}

func TestAResultSchemeFromAnotherSessionMayNotComposeAnOffering(t *testing.T) {
	o := newOfferingWorld(t)
	ctx := context.Background()

	other := o.db.Client.AcademicSession.Create().
		SetName("The year after").
		SetCode("OFS-" + uuid.NewString()[:8]).
		SetStartDate(time.Date(2027, time.April, 1, 0, 0, 0, 0, time.UTC)).
		SetEndDate(time.Date(2028, time.March, 31, 0, 0, 0, 0, time.UTC)).
		SaveX(ctx)
	stranger := o.db.Client.ResultScheme.Create().
		SetAcademicSessionID(other.ID).
		SetName("The annual after").
		SetCode("RS-" + uuid.NewString()[:8]).
		SetStatus("active").
		SaveX(ctx).ID

	o.refusalSays(o.patchOffering(o.physicsA, fmt.Sprintf(`{"result_scheme_id":%q}`, stranger)),
		http.StatusUnprocessableEntity, "result_scheme_other_session")
	if attached := o.attachedScheme(o.physicsA); attached != nil {
		t.Fatalf("a refused attachment must not be written, got %v", attached)
	}
}

func TestAnUnknownResultSchemeIsNotFoundRatherThanAConflict(t *testing.T) {
	o := newOfferingWorld(t)

	rec := o.patchOffering(o.physicsA, fmt.Sprintf(`{"result_scheme_id":%q}`, uuid.New()))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("want 404, got %d: %s", rec.Code, rec.Body.String())
	}
}

func (o *offeringWorld) attachedGrading(id uuid.UUID) *uuid.UUID {
	o.t.Helper()

	row, err := o.db.Client.SubjectOffering.Get(context.Background(), id)
	if err != nil {
		o.t.Fatalf("the offering %s could not be read back: %v", id, err)
	}
	return row.GradingSchemeID
}

func (o *offeringWorld) newGradingScheme(session uuid.UUID, status string) uuid.UUID {
	o.t.Helper()

	create := o.db.Client.GradingScheme.Create().
		SetAcademicSessionID(session).
		SetName("Offering bands").
		SetCode("OGS-" + uuid.NewString()[:8])
	if status != "" {
		create = create.SetStatus(entgradingscheme.Status(status))
	}
	return create.SaveX(context.Background()).ID
}

func (o *offeringWorld) laterSession() uuid.UUID {
	o.t.Helper()

	return o.db.Client.AcademicSession.Create().
		SetName("The year after").
		SetCode("OGN-" + uuid.NewString()[:8]).
		SetStartDate(time.Date(2029, time.April, 1, 0, 0, 0, 0, time.UTC)).
		SetEndDate(time.Date(2030, time.March, 31, 0, 0, 0, 0, time.UTC)).
		SaveX(context.Background()).ID
}

func TestAnOfferingIsCreatedWithAGradingSchemeOfItsOwnSession(t *testing.T) {
	o := newOfferingWorld(t)
	scheme := o.newGradingScheme(o.sessionID, "")

	body := o.newOfferingBody(o.newSubject("grading create"),
		fmt.Sprintf(`,"grading_scheme_id":%q`, scheme))
	id := o.createdID(o.createOffering(body))

	attached := o.attachedGrading(id)
	if attached == nil || *attached != scheme {
		t.Fatalf("the offering must carry the grading scheme it was created with, got %v", attached)
	}
}

func TestAnOfferingTakesAGradingSchemeOfItsOwnSessionOnUpdate(t *testing.T) {
	o := newOfferingWorld(t)
	scheme := o.newGradingScheme(o.sessionID, "")

	rec := o.patchOffering(o.physicsA, fmt.Sprintf(`{"grading_scheme_id":%q}`, scheme))
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, rec.Body.String())
	}

	attached := o.attachedGrading(o.physicsA)
	if attached == nil || *attached != scheme {
		t.Fatalf("the update must attach the grading scheme, got %v", attached)
	}
}

func TestAGradingSchemeFromAnotherSessionMayNotBandAnOffering(t *testing.T) {
	o := newOfferingWorld(t)
	stranger := o.newGradingScheme(o.laterSession(), "")

	o.refusalSays(o.patchOffering(o.physicsA, fmt.Sprintf(`{"grading_scheme_id":%q}`, stranger)),
		http.StatusUnprocessableEntity, "grading_scheme_other_session")
	if attached := o.attachedGrading(o.physicsA); attached != nil {
		t.Fatalf("a refused attachment must not be written, got %v", attached)
	}

	body := o.newOfferingBody(o.newSubject("grading stranger"),
		fmt.Sprintf(`,"grading_scheme_id":%q`, stranger))
	o.refusalSays(o.createOffering(body), http.StatusUnprocessableEntity,
		"grading_scheme_other_session")

	count, err := o.db.Client.SubjectOffering.Query().
		Where(entoffering.GradingSchemeID(stranger)).Count(context.Background())
	if err != nil {
		t.Fatalf("the offerings could not be counted: %v", err)
	}
	if count != 0 {
		t.Fatalf("a scheme from another session must band nothing, got %d offerings", count)
	}
}

func TestAnUnknownGradingSchemeIsNotFoundRatherThanAConflict(t *testing.T) {
	o := newOfferingWorld(t)

	rec := o.patchOffering(o.physicsA, fmt.Sprintf(`{"grading_scheme_id":%q}`, uuid.New()))
	o.refusalSays(rec, http.StatusNotFound, "grading scheme not found")

	body := o.newOfferingBody(o.newSubject("grading unknown"),
		fmt.Sprintf(`,"grading_scheme_id":%q`, uuid.New()))
	o.refusalSays(o.createOffering(body), http.StatusNotFound, "grading scheme not found")
}

func TestAnInactiveGradingSchemeMayStillBandAnOffering(t *testing.T) {
	o := newOfferingWorld(t)
	retired := o.newGradingScheme(o.sessionID, "inactive")

	rec := o.patchOffering(o.physicsA, fmt.Sprintf(`{"grading_scheme_id":%q}`, retired))
	if rec.Code != http.StatusOK {
		t.Fatalf("a retired scale is still a well-formed scale and must attach, got %d: %s",
			rec.Code, rec.Body.String())
	}
	attached := o.attachedGrading(o.physicsA)
	if attached == nil || *attached != retired {
		t.Fatalf("the inactive scheme must be attached, got %v", attached)
	}
}

func TestAnExplicitNullDetachesTheGradingScheme(t *testing.T) {
	o := newOfferingWorld(t)
	scheme := o.newGradingScheme(o.sessionID, "")

	if rec := o.patchOffering(o.physicsA,
		fmt.Sprintf(`{"grading_scheme_id":%q}`, scheme)); rec.Code != http.StatusOK {
		t.Fatalf("the scheme must attach first: %d %s", rec.Code, rec.Body.String())
	}

	rec := o.patchOffering(o.physicsA, `{"grading_scheme_id":null}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if attached := o.attachedGrading(o.physicsA); attached != nil {
		t.Fatalf("an explicit null must detach the grading scheme, got %v", attached)
	}
}

func TestAnOmittedGradingSchemeLeavesTheAttachedSchemeAlone(t *testing.T) {
	o := newOfferingWorld(t)
	scheme := o.newGradingScheme(o.sessionID, "")

	if rec := o.patchOffering(o.physicsA,
		fmt.Sprintf(`{"grading_scheme_id":%q}`, scheme)); rec.Code != http.StatusOK {
		t.Fatalf("the scheme must attach first: %d %s", rec.Code, rec.Body.String())
	}

	rec := o.patchOffering(o.physicsA, `{"periods_per_week":4}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, rec.Body.String())
	}
	attached := o.attachedGrading(o.physicsA)
	if attached == nil || *attached != scheme {
		t.Fatalf("an omitted key must leave the grading scheme attached, got %v", attached)
	}
}
