package http

import (
	"context"
	"net/http"
	"net/url"
	"strconv"
	"unicode/utf8"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	"github.com/Harbour-Emerge/emerge-core/internal/data/filter"
	"github.com/Harbour-Emerge/emerge-core/internal/domain/shared"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entcurriculum "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/curriculum"
	entnode "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/curriculumnode"
	entgrade "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/gradelevel"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
	entsection "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/section"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

const (
	curriculumNameRunes = 200
	boardRunes          = 64
	curriculumNodeRunes = 255
	maxCurriculumDepth  = 64
)

type curriculumPayload struct {
	Name              *string         `json:"name"`
	Code              *string         `json:"code"`
	AcademicSessionID *uuid.UUID      `json:"academic_session_id"`
	SubjectID         *uuid.UUID      `json:"subject_id"`
	GradeLevelID      *uuid.UUID      `json:"grade_level_id"`
	Board             *string         `json:"board"`
	Description       *string         `json:"description"`
	Origin            *string         `json:"origin"`
	Status            *string         `json:"status"`
	SupersedesID      *uuid.UUID      `json:"supersedes_id"`
	CopiedFromID      *uuid.UUID      `json:"copied_from_id"`
	Metadata          shared.Metadata `json:"metadata_json"`
}

type curriculumNodePayload struct {
	CurriculumID *uuid.UUID      `json:"curriculum_id"`
	ParentID     *uuid.UUID      `json:"parent_id"`
	CopiedFromID *uuid.UUID      `json:"copied_from_id"`
	Kind         *string         `json:"kind"`
	Title        *string         `json:"title"`
	Sequence     *int            `json:"sequence"`
	Description  *string         `json:"description"`
	Status       *string         `json:"status"`
	Metadata     shared.Metadata `json:"metadata_json"`
}

type curriculumFilters struct {
	AcademicSessionID *uuid.UUID
	SubjectID         *uuid.UUID
	GradeLevelID      *uuid.UUID
	CopiedFromID      *uuid.UUID
	Origin            *entcurriculum.Origin
	Status            *entcurriculum.Status

	Limit  int
	Offset int
}

func parseCurriculumFilters(values url.Values) (curriculumFilters, error) {
	p := filter.New(values)

	f := curriculumFilters{
		AcademicSessionID: p.UUID("academic_session_id"),
		SubjectID:         p.UUID("subject_id"),
		GradeLevelID:      p.UUID("grade_level_id"),
		CopiedFromID:      p.UUID("copied_from_id"),
	}
	f.Limit, f.Offset = p.Page(DefaultPageSize, MaxPageSize)

	if raw := p.Enum("origin", func(v string) error {
		return entcurriculum.OriginValidator(entcurriculum.Origin(v))
	}); raw != nil {
		origin := entcurriculum.Origin(*raw)
		f.Origin = &origin
	}
	if raw := p.Enum("status", func(v string) error {
		return entcurriculum.StatusValidator(entcurriculum.Status(v))
	}); raw != nil {
		status := entcurriculum.Status(*raw)
		f.Status = &status
	}

	if err := p.Err(); err != nil {
		return curriculumFilters{}, err
	}
	return f, nil
}

func (f curriculumFilters) apply(q *tenantent.CurriculumQuery) *tenantent.CurriculumQuery {
	if f.AcademicSessionID != nil {
		q = q.Where(entcurriculum.AcademicSessionID(*f.AcademicSessionID))
	}
	if f.SubjectID != nil {
		q = q.Where(entcurriculum.SubjectID(*f.SubjectID))
	}
	if f.GradeLevelID != nil {
		q = q.Where(entcurriculum.GradeLevelID(*f.GradeLevelID))
	}
	if f.CopiedFromID != nil {
		q = q.Where(entcurriculum.CopiedFromID(*f.CopiedFromID))
	}
	if f.Origin != nil {
		q = q.Where(entcurriculum.OriginEQ(*f.Origin))
	}
	if f.Status != nil {
		q = q.Where(entcurriculum.StatusEQ(*f.Status))
	}
	return q.Limit(f.Limit).Offset(f.Offset)
}

type curriculumNodeFilters struct {
	ParentID *uuid.UUID
	Kind     *entnode.Kind
	Status   *entnode.Status

	Limit  int
	Offset int
}

func parseCurriculumNodeFilters(values url.Values) (curriculumNodeFilters, error) {
	p := filter.New(values)

	f := curriculumNodeFilters{ParentID: p.UUID("parent_id")}
	f.Limit, f.Offset = p.Page(DefaultPageSize, MaxPageSize)

	if raw := p.Enum("kind", func(v string) error {
		return entnode.KindValidator(entnode.Kind(v))
	}); raw != nil {
		kind := entnode.Kind(*raw)
		f.Kind = &kind
	}
	if raw := p.Enum("status", func(v string) error {
		return entnode.StatusValidator(entnode.Status(v))
	}); raw != nil {
		status := entnode.Status(*raw)
		f.Status = &status
	}

	if err := p.Err(); err != nil {
		return curriculumNodeFilters{}, err
	}
	return f, nil
}

func (f curriculumNodeFilters) apply(q *tenantent.CurriculumNodeQuery) *tenantent.CurriculumNodeQuery {
	if f.ParentID != nil {
		q = q.Where(entnode.ParentID(*f.ParentID))
	}
	if f.Kind != nil {
		q = q.Where(entnode.KindEQ(*f.Kind))
	}
	if f.Status != nil {
		q = q.Where(entnode.StatusEQ(*f.Status))
	}
	return q.Limit(f.Limit).Offset(f.Offset)
}

func withinRunes(w http.ResponseWriter, name, value string, limit int) bool {
	if utf8.RuneCountInString(value) > limit {
		response.Error(w, http.StatusBadRequest,
			name+" must be at most "+strconv.Itoa(limit)+" characters")
		return false
	}
	return true
}

func curriculumOrigin(w http.ResponseWriter, raw *string) (entcurriculum.Origin, bool) {
	origin := entcurriculum.Origin(*raw)
	if err := entcurriculum.OriginValidator(origin); err != nil {
		response.Error(w, http.StatusBadRequest, "origin must be school or imported")
		return "", false
	}
	return origin, true
}

func curriculumStatus(w http.ResponseWriter, raw *string) (entcurriculum.Status, bool) {
	status := entcurriculum.Status(*raw)
	if err := entcurriculum.StatusValidator(status); err != nil {
		response.Error(w, http.StatusBadRequest, "status must be draft, active or archived")
		return "", false
	}
	return status, true
}

func curriculumNodeKind(w http.ResponseWriter, raw *string) (entnode.Kind, bool) {
	kind := entnode.Kind(*raw)
	if err := entnode.KindValidator(kind); err != nil {
		response.Error(w, http.StatusBadRequest, "kind must be unit, chapter or topic")
		return "", false
	}
	return kind, true
}

func curriculumNodeStatus(w http.ResponseWriter, raw *string) (entnode.Status, bool) {
	status := entnode.Status(*raw)
	if err := entnode.StatusValidator(status); err != nil {
		response.Error(w, http.StatusBadRequest, "status must be active or inactive")
		return "", false
	}
	return status, true
}

func rejectImmutableCurriculumFields(w http.ResponseWriter, sent []string) bool {
	for _, name := range []string{
		entcurriculum.FieldCode,
		entcurriculum.FieldAcademicSessionID,
		entcurriculum.FieldSubjectID,
		entcurriculum.FieldGradeLevelID,
	} {
		if wasSent(sent, name) {
			response.Error(w, http.StatusUnprocessableEntity,
				name+" is recorded when the curriculum is created and cannot be changed")
			return false
		}
	}
	return true
}

func rejectImmutableCurriculumNodeFields(w http.ResponseWriter, sent []string) bool {
	if wasSent(sent, entnode.FieldCurriculumID) {
		response.Error(w, http.StatusUnprocessableEntity,
			entnode.FieldCurriculumID+" is recorded when the node is created and cannot be changed")
		return false
	}
	return true
}

type curriculumLineage struct {
	name string
	id   *uuid.UUID
}

func (s *Server) checkCurriculumLineage(ctx context.Context, w http.ResponseWriter,
	client *tenantent.Client, self uuid.UUID, refs []curriculumLineage) bool {
	supplied := false
	for _, ref := range refs {
		if ref.id != nil {
			supplied = true
		}
	}
	if !supplied {
		return true
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.CurriculumRead, authorization.CurriculumReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return false
	}
	if !decision.Allowed {
		response.Error(w, http.StatusForbidden,
			"recording curriculum lineage requires "+string(authorization.CurriculumRead))
		return false
	}

	for _, ref := range refs {
		if ref.id == nil {
			continue
		}
		if self != uuid.Nil && *ref.id == self {
			response.Error(w, http.StatusUnprocessableEntity,
				ref.name+" must not name the curriculum itself")
			return false
		}
		found, err := client.Curriculum.Query().
			Where(entcurriculum.ID(*ref.id), access.CurriculaFor(viewer, decision)).
			Exist(ctx)
		if err != nil {
			writeTenancyErr(w, err)
			return false
		}
		if !found {
			response.Error(w, http.StatusUnprocessableEntity,
				ref.name+" does not name a curriculum you can read")
			return false
		}
	}
	return true
}

func viewerTeachesSubjectGrade(v *access.Viewer, subject, grade uuid.UUID) bool {
	for _, pair := range v.TaughtSubjectGrades {
		if pair.SubjectID == subject && pair.GradeLevelID == grade {
			return true
		}
	}
	for _, id := range v.SectionGradeIDs {
		if id == grade {
			return true
		}
	}
	return false
}

func curriculumCreateReach(v *access.Viewer, d authorization.Decision,
	subject, grade uuid.UUID) (within, all bool) {
	if !d.HasReach {
		return viewerTeachesSubjectGrade(v, subject, grade), false
	}

	switch d.Reach {
	case authorization.ReachTenant:
		return true, true
	case authorization.ReachTeacherAssignment:
		return viewerTeachesSubjectGrade(v, subject, grade), false
	default:
		return false, false
	}
}

func curriculumPinTranslatable(group []authorization.Constraint) bool {
	for _, c := range group {
		if !c.Satisfied() || !authorization.RowField(c.Field) {
			return false
		}
	}
	return true
}

func curriculumPinsUsable(groups [][]authorization.Constraint) bool {
	for _, group := range groups {
		if curriculumPinTranslatable(group) {
			return true
		}
	}
	return len(groups) == 0
}

func gradeLevelMatchingPin(c authorization.Constraint) predicate.GradeLevel {
	switch c.Field {
	case "section":
		return entgrade.HasSectionsWith(entsection.CodeIn(c.Values...))
	case "grade_level":
		return entgrade.CodeIn(c.Values...)
	default:
		return entgrade.IDIn()
	}
}

func gradeLevelWithinPins(ctx context.Context, client *tenantent.Client,
	grade uuid.UUID, groups [][]authorization.Constraint) (bool, error) {
	ors := make([]predicate.GradeLevel, 0, len(groups))
	for _, group := range groups {
		if !curriculumPinTranslatable(group) {
			continue
		}
		ands := make([]predicate.GradeLevel, 0, len(group))
		for _, c := range group {
			ands = append(ands, gradeLevelMatchingPin(c))
		}
		ors = append(ors, entgrade.And(ands...))
	}
	if len(ors) == 0 {
		return false, nil
	}
	return client.GradeLevel.Query().
		Where(entgrade.ID(grade), entgrade.Or(ors...)).
		Exist(ctx)
}

func curriculumCreateWithinReach(ctx context.Context, client *tenantent.Client,
	v *access.Viewer, d authorization.Decision, subject, grade uuid.UUID) (bool, error) {
	if v == nil {
		return false, nil
	}
	if v.Unrestricted {
		return true, nil
	}
	if !curriculumPinsUsable(d.Constraints) {
		return false, nil
	}

	within, all := curriculumCreateReach(v, d, subject, grade)
	if !all && !within {
		return false, nil
	}
	if len(d.Constraints) == 0 {
		return true, nil
	}
	return gradeLevelWithinPins(ctx, client, grade, d.Constraints)
}

func checkCurriculumCreateReach(ctx context.Context, w http.ResponseWriter, client *tenantent.Client,
	v *access.Viewer, d authorization.Decision, subject, grade uuid.UUID) bool {
	within, err := curriculumCreateWithinReach(ctx, client, v, d, subject, grade)
	if err != nil {
		writeTenancyErr(w, err)
		return false
	}
	if !within {
		response.Error(w, http.StatusForbidden,
			"your grant of "+string(authorization.CurriculumCreate)+" does not reach the "+
				entcurriculum.FieldSubjectID+" and "+entcurriculum.FieldGradeLevelID+
				" you named; you may only create a curriculum you could then write")
		return false
	}
	return true
}

func activeCurriculumClashes(ctx context.Context, client *tenantent.Client,
	session, subject, grade, except uuid.UUID) (bool, error) {
	ids, err := client.Curriculum.Query().
		Where(
			entcurriculum.AcademicSessionID(session),
			entcurriculum.SubjectID(subject),
			entcurriculum.GradeLevelID(grade),
			entcurriculum.StatusEQ(entcurriculum.StatusActive),
		).
		Limit(2).
		IDs(ctx)
	if err != nil {
		return false, err
	}
	for _, id := range ids {
		if id != except {
			return true, nil
		}
	}
	return false, nil
}

func checkActiveCurriculum(ctx context.Context, w http.ResponseWriter, client *tenantent.Client,
	session, subject, grade, except uuid.UUID) bool {
	clash, err := activeCurriculumClashes(ctx, client, session, subject, grade, except)
	if err != nil {
		writeTenancyErr(w, err)
		return false
	}
	if clash {
		response.Error(w, http.StatusConflict,
			"curriculum_active_exists: an active curriculum already exists for that "+
				"academic session, subject and grade level; archive it before activating another")
		return false
	}
	return true
}

func checkCurriculumNodeParent(ctx context.Context, w http.ResponseWriter, client *tenantent.Client,
	parent, curriculum uuid.UUID) bool {
	within, err := curriculumNodeUnder(ctx, client, parent, curriculum)
	if err != nil {
		writeTenancyErr(w, err)
		return false
	}
	if !within {
		response.Error(w, http.StatusUnprocessableEntity,
			entnode.FieldParentID+" must name a node of the same curriculum")
		return false
	}
	return true
}

var curriculumNodeKinds = []entnode.Kind{
	entnode.KindUnit, entnode.KindChapter, entnode.KindTopic,
}

func curriculumKindHolds(kind entnode.Kind) []entnode.Kind {
	switch kind {
	case entnode.KindUnit:
		return []entnode.Kind{entnode.KindChapter}
	case entnode.KindChapter:
		return []entnode.Kind{entnode.KindTopic}
	default:
		return nil
	}
}

func curriculumKindRefuses(kind entnode.Kind) []entnode.Kind {
	holds := curriculumKindHolds(kind)
	refused := make([]entnode.Kind, 0, len(curriculumNodeKinds))
	for _, candidate := range curriculumNodeKinds {
		allowed := false
		for _, held := range holds {
			if candidate == held {
				allowed = true
			}
		}
		if !allowed {
			refused = append(refused, candidate)
		}
	}
	return refused
}

func curriculumKindFitsUnder(child entnode.Kind, parent *entnode.Kind) bool {
	if parent == nil {
		return child != entnode.KindTopic
	}
	for _, held := range curriculumKindHolds(*parent) {
		if child == held {
			return true
		}
	}
	return false
}

func curriculumNodeNamed(node uuid.UUID) string {
	if node == uuid.Nil {
		return "the node you are creating"
	}
	return "node " + node.String()
}

func curriculumShapeRefusal(w http.ResponseWriter, node uuid.UUID,
	child entnode.Kind, parent *uuid.UUID, parentKind *entnode.Kind) {
	named := curriculumNodeNamed(node)
	switch {
	case parentKind == nil && child == entnode.KindTopic:
		response.Error(w, http.StatusUnprocessableEntity,
			"curriculum_shape: a topic must sit inside a chapter, so "+named+
				" needs a "+entnode.FieldParentID+" naming one")
	case parentKind != nil && child == entnode.KindUnit:
		response.Error(w, http.StatusUnprocessableEntity,
			"curriculum_shape: a unit is a top-level grouping, so "+named+
				" must not name a "+entnode.FieldParentID+", but it names "+parent.String())
	default:
		response.Error(w, http.StatusUnprocessableEntity,
			"curriculum_shape: a "+string(child)+" may only sit under a "+
				string(curriculumRequiredParent(child))+", but "+named+" names "+
				entnode.FieldParentID+" "+parent.String()+", which is a "+string(*parentKind))
	}
}

func curriculumRequiredParent(child entnode.Kind) entnode.Kind {
	if child == entnode.KindTopic {
		return entnode.KindChapter
	}
	return entnode.KindUnit
}

func curriculumNodeKindOf(ctx context.Context, client *tenantent.Client,
	node uuid.UUID) (*entnode.Kind, error) {
	row, err := client.CurriculumNode.Query().Where(entnode.ID(node)).Only(ctx)
	if err != nil {
		return nil, err
	}
	return &row.Kind, nil
}

func checkCurriculumNodeShape(ctx context.Context, w http.ResponseWriter, client *tenantent.Client,
	node uuid.UUID, kind entnode.Kind, parent *uuid.UUID) bool {
	var parentKind *entnode.Kind
	if parent != nil {
		found, err := curriculumNodeKindOf(ctx, client, *parent)
		if err != nil {
			writeTenantEntErr(w, err, "curriculum node not found")
			return false
		}
		parentKind = found
	}
	if !curriculumKindFitsUnder(kind, parentKind) {
		curriculumShapeRefusal(w, node, kind, parent, parentKind)
		return false
	}
	return true
}

func checkCurriculumNodeChildren(ctx context.Context, w http.ResponseWriter, client *tenantent.Client,
	node uuid.UUID, kind entnode.Kind) bool {
	illegal, err := client.CurriculumNode.Query().
		Where(entnode.ParentID(node), entnode.KindIn(curriculumKindRefuses(kind)...)).
		Exist(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return false
	}
	if !illegal {
		return true
	}
	if kind == entnode.KindTopic {
		response.Error(w, http.StatusUnprocessableEntity,
			"curriculum_shape: a topic holds no children, but node "+node.String()+
				" already has some; move them before making it a topic")
		return false
	}
	response.Error(w, http.StatusUnprocessableEntity,
		"curriculum_shape: a "+string(kind)+" holds only "+
			string(curriculumKindHolds(kind)[0])+"s, but node "+node.String()+
			" already has a child that is not one")
	return false
}

func curriculumNodeWouldCycle(ctx context.Context, client *tenantent.Client,
	node, parent uuid.UUID) (bool, error) {
	at := parent
	for depth := 0; depth < maxCurriculumDepth; depth++ {
		if at == node {
			return true, nil
		}
		row, err := client.CurriculumNode.Query().Where(entnode.ID(at)).Only(ctx)
		if err != nil {
			if tenantent.IsNotFound(err) {
				return false, nil
			}
			return false, err
		}
		if row.ParentID == nil {
			return false, nil
		}
		at = *row.ParentID
	}
	return true, nil
}

func checkCurriculumNodeCycle(ctx context.Context, w http.ResponseWriter, client *tenantent.Client,
	node, parent uuid.UUID) bool {
	cycles, err := curriculumNodeWouldCycle(ctx, client, node, parent)
	if err != nil {
		writeTenancyErr(w, err)
		return false
	}
	if cycles {
		response.Error(w, http.StatusUnprocessableEntity,
			entnode.FieldParentID+" must not name the node itself or one of its own descendants")
		return false
	}
	return true
}

func writableCurriculum(ctx context.Context, w http.ResponseWriter, client *tenantent.Client,
	id uuid.UUID, v *access.Viewer, d authorization.Decision) (*tenantent.Curriculum, bool) {
	row, err := client.Curriculum.Query().
		Where(entcurriculum.ID(id), access.CurriculaWritableBy(v, d)).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "curriculum not found")
		return nil, false
	}
	return row, true
}

func (s *Server) listCurricula(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	filters, err := parseCurriculumFilters(r.URL.Query())
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.CurriculumRead, authorization.CurriculumReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	q := client.Curriculum.Query().Where(access.CurriculaFor(viewer, decision))

	rows, err := filters.apply(q).
		Order(tenantent.Desc(entcurriculum.FieldCreatedAt)).
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
		"curricula": projected,
		"count":     len(rows),
		"page":      pageOf(filters.Limit, filters.Offset, len(rows)),
	})
}

func (s *Server) getCurriculum(w http.ResponseWriter, r *http.Request) {
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
		authorization.CurriculumRead, authorization.CurriculumReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	row, err := client.Curriculum.Query().
		Where(entcurriculum.ID(id), access.CurriculaFor(viewer, decision)).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "curriculum not found")
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

func (s *Server) createCurriculum(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	var in curriculumPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.CurriculumCreate, authorization.CurriculumWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entcurriculum.Columns, sent) {
		return
	}

	if in.Name == nil || *in.Name == "" {
		response.Error(w, http.StatusBadRequest, "name is required")
		return
	}
	if !withinRunes(w, entcurriculum.FieldName, *in.Name, curriculumNameRunes) {
		return
	}
	if in.Code == nil || *in.Code == "" {
		response.Error(w, http.StatusBadRequest, "code is required")
		return
	}
	if in.AcademicSessionID == nil || in.SubjectID == nil || in.GradeLevelID == nil {
		response.Error(w, http.StatusBadRequest,
			"academic_session_id, subject_id and grade_level_id are required")
		return
	}
	if !checkCurriculumCreateReach(ctx, w, client, viewer, decision,
		*in.SubjectID, *in.GradeLevelID) {
		return
	}
	in.Board = normalizedBoard(in.Board)
	if in.Board != nil && !withinRunes(w, entcurriculum.FieldBoard, *in.Board, boardRunes) {
		return
	}

	status := entcurriculum.DefaultStatus
	if in.Status != nil {
		parsed, ok := curriculumStatus(w, in.Status)
		if !ok {
			return
		}
		status = parsed
	}

	if !s.checkCurriculumLineage(ctx, w, client, uuid.Nil, []curriculumLineage{
		{name: entcurriculum.FieldSupersedesID, id: in.SupersedesID},
		{name: entcurriculum.FieldCopiedFromID, id: in.CopiedFromID},
	}) {
		return
	}

	if status == entcurriculum.StatusActive && !checkActiveCurriculum(ctx, w, client,
		*in.AcademicSessionID, *in.SubjectID, *in.GradeLevelID, uuid.Nil) {
		return
	}

	create := client.Curriculum.Create().
		SetName(*in.Name).
		SetCode(*in.Code).
		SetAcademicSessionID(*in.AcademicSessionID).
		SetSubjectID(*in.SubjectID).
		SetGradeLevelID(*in.GradeLevelID).
		SetStatus(status).
		SetNillableBoard(in.Board).
		SetNillableDescription(in.Description).
		SetNillableSupersedesID(in.SupersedesID).
		SetNillableCopiedFromID(in.CopiedFromID)

	if in.Metadata != nil {
		create = create.SetMetadataJSON(in.Metadata)
	}
	if in.Origin != nil {
		origin, ok := curriculumOrigin(w, in.Origin)
		if !ok {
			return
		}
		create = create.SetOrigin(origin)
	}

	row, err := create.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "curriculum not found")
		return
	}
	w.Header().Set("Location", "/api/v1/curricula/"+row.ID.String())
	response.JSON(w, http.StatusCreated, row)
}

func (s *Server) updateCurriculum(w http.ResponseWriter, r *http.Request) {
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

	var in curriculumPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.CurriculumWrite, authorization.CurriculumWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	current, err := client.Curriculum.Query().
		Where(entcurriculum.ID(id), access.CurriculaWritableBy(viewer, decision)).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "curriculum not found")
		return
	}

	if !rejectUnauthorizedFields(w, r, decision, entcurriculum.Columns, sent) {
		return
	}
	if !rejectImmutableCurriculumFields(w, sent) {
		return
	}

	if in.Name != nil {
		if *in.Name == "" {
			response.Error(w, http.StatusBadRequest, "name must not be empty")
			return
		}
		if !withinRunes(w, entcurriculum.FieldName, *in.Name, curriculumNameRunes) {
			return
		}
	}
	in.Board = normalizedBoard(in.Board)
	if in.Board != nil && !withinRunes(w, entcurriculum.FieldBoard, *in.Board, boardRunes) {
		return
	}

	status := current.Status
	if in.Status != nil {
		parsed, ok := curriculumStatus(w, in.Status)
		if !ok {
			return
		}
		status = parsed
	}

	if !s.checkCurriculumLineage(ctx, w, client, id, []curriculumLineage{
		{name: entcurriculum.FieldSupersedesID, id: in.SupersedesID},
		{name: entcurriculum.FieldCopiedFromID, id: in.CopiedFromID},
	}) {
		return
	}

	if status == entcurriculum.StatusActive && current.Status != entcurriculum.StatusActive &&
		!checkActiveCurriculum(ctx, w, client, current.AcademicSessionID,
			current.SubjectID, current.GradeLevelID, id) {
		return
	}

	update := client.Curriculum.Update().
		Where(entcurriculum.ID(id), access.CurriculaWritableBy(viewer, decision)).
		SetStatus(status).
		SetNillableName(in.Name).
		SetNillableBoard(in.Board).
		SetNillableDescription(in.Description).
		SetNillableSupersedesID(in.SupersedesID).
		SetNillableCopiedFromID(in.CopiedFromID)

	if in.Metadata != nil {
		update = update.SetMetadataJSON(in.Metadata)
	}
	if in.Origin != nil {
		origin, ok := curriculumOrigin(w, in.Origin)
		if !ok {
			return
		}
		update = update.SetOrigin(origin)
	}

	n, err := update.Save(ctx)
	if !wroteScopedRow(w, n, err, "curriculum not found") {
		return
	}

	row, err := client.Curriculum.Query().Where(entcurriculum.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "curriculum not found")
		return
	}
	response.JSON(w, http.StatusOK, row)
}

func (s *Server) deleteCurriculum(w http.ResponseWriter, r *http.Request) {
	s.deleteScoped(w, r, "curriculum not found",
		authorization.CurriculumDelete, authorization.CurriculumDeleteAll,
		func(ctx context.Context, c *tenantent.Client, id uuid.UUID,
			v *access.Viewer, d authorization.Decision) (int, error) {
			return c.Curriculum.Delete().
				Where(entcurriculum.ID(id), access.CurriculaWritableBy(v, d)).
				Exec(ctx)
		})
}

func (s *Server) listCurriculumNodes(w http.ResponseWriter, r *http.Request) {
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

	filters, err := parseCurriculumNodeFilters(r.URL.Query())
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.CurriculumRead, authorization.CurriculumReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	found, err := client.Curriculum.Query().
		Where(entcurriculum.ID(id), access.CurriculaFor(viewer, decision)).
		Exist(ctx)
	if !mustReach(w, found, err, "curriculum not found") {
		return
	}

	q := client.CurriculumNode.Query().Where(
		entnode.CurriculumID(id),
		access.CurriculumNodesFor(viewer, decision),
	)

	rows, err := filters.apply(q).
		Order(tenantent.Asc(entnode.FieldSequence), tenantent.Asc(entnode.FieldCreatedAt)).
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
		"curriculum_nodes": projected,
		"count":            len(rows),
		"page":             pageOf(filters.Limit, filters.Offset, len(rows)),
	})
}

func (s *Server) createCurriculumNode(w http.ResponseWriter, r *http.Request) {
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

	var in curriculumNodePayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.CurriculumCreate, authorization.CurriculumWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entnode.Columns, sent) {
		return
	}
	if wasSent(sent, entnode.FieldCurriculumID) {
		response.Error(w, http.StatusUnprocessableEntity,
			entnode.FieldCurriculumID+" is taken from the path and must not be supplied")
		return
	}

	curriculum, ok := writableCurriculum(ctx, w, client, id, viewer, decision)
	if !ok {
		return
	}

	if in.Title == nil || *in.Title == "" {
		response.Error(w, http.StatusBadRequest, "title is required")
		return
	}
	if !withinRunes(w, entnode.FieldTitle, *in.Title, curriculumNodeRunes) {
		return
	}
	if in.Sequence == nil {
		response.Error(w, http.StatusBadRequest, "sequence is required")
		return
	}
	if *in.Sequence < 0 {
		response.Error(w, http.StatusBadRequest, "sequence must not be negative")
		return
	}

	kind := entnode.DefaultKind
	if in.Kind != nil {
		parsed, ok := curriculumNodeKind(w, in.Kind)
		if !ok {
			return
		}
		kind = parsed
	}
	status := entnode.DefaultStatus
	if in.Status != nil {
		parsed, ok := curriculumNodeStatus(w, in.Status)
		if !ok {
			return
		}
		status = parsed
	}

	if in.ParentID != nil && !checkCurriculumNodeParent(ctx, w, client, *in.ParentID, curriculum.ID) {
		return
	}
	if in.CopiedFromID != nil && !checkCurriculumNodeParent(ctx, w, client, *in.CopiedFromID, curriculum.ID) {
		return
	}
	if !checkCurriculumNodeShape(ctx, w, client, uuid.Nil, kind, in.ParentID) {
		return
	}

	create := client.CurriculumNode.Create().
		SetCurriculumID(curriculum.ID).
		SetKind(kind).
		SetStatus(status).
		SetTitle(*in.Title).
		SetSequence(*in.Sequence).
		SetNillableParentID(in.ParentID).
		SetNillableCopiedFromID(in.CopiedFromID).
		SetNillableDescription(in.Description)

	if in.Metadata != nil {
		create = create.SetMetadataJSON(in.Metadata)
	}

	row, err := create.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "curriculum not found")
		return
	}
	w.Header().Set("Location", "/api/v1/curriculum-nodes/"+row.ID.String())
	response.JSON(w, http.StatusCreated, row)
}

func (s *Server) updateCurriculumNode(w http.ResponseWriter, r *http.Request) {
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

	var in curriculumNodePayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.CurriculumWrite, authorization.CurriculumWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	current, err := client.CurriculumNode.Query().
		Where(entnode.ID(id), access.CurriculumNodesWritableBy(viewer, decision)).
		Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "curriculum node not found")
		return
	}

	if !rejectUnauthorizedFields(w, r, decision, entnode.Columns, sent) {
		return
	}
	if !rejectImmutableCurriculumNodeFields(w, sent) {
		return
	}

	if in.Title != nil {
		if *in.Title == "" {
			response.Error(w, http.StatusBadRequest, "title must not be empty")
			return
		}
		if !withinRunes(w, entnode.FieldTitle, *in.Title, curriculumNodeRunes) {
			return
		}
	}
	if in.Sequence != nil && *in.Sequence < 0 {
		response.Error(w, http.StatusBadRequest, "sequence must not be negative")
		return
	}

	kind := current.Kind
	if in.Kind != nil {
		parsed, ok := curriculumNodeKind(w, in.Kind)
		if !ok {
			return
		}
		kind = parsed
	}
	status := current.Status
	if in.Status != nil {
		parsed, ok := curriculumNodeStatus(w, in.Status)
		if !ok {
			return
		}
		status = parsed
	}

	clearsParent := in.ParentID == nil && wasSent(sent, entnode.FieldParentID)
	parent := current.ParentID
	switch {
	case in.ParentID != nil:
		parent = in.ParentID
	case clearsParent:
		parent = nil
	}

	if in.ParentID != nil {
		if !checkCurriculumNodeParent(ctx, w, client, *in.ParentID, current.CurriculumID) {
			return
		}
		if !checkCurriculumNodeCycle(ctx, w, client, id, *in.ParentID) {
			return
		}
	}
	if in.CopiedFromID != nil &&
		!checkCurriculumNodeParent(ctx, w, client, *in.CopiedFromID, current.CurriculumID) {
		return
	}

	if in.ParentID != nil || clearsParent || kind != current.Kind {
		if !checkCurriculumNodeShape(ctx, w, client, id, kind, parent) {
			return
		}
	}
	if kind != current.Kind && !checkCurriculumNodeChildren(ctx, w, client, id, kind) {
		return
	}

	update := client.CurriculumNode.Update().
		Where(entnode.ID(id), access.CurriculumNodesWritableBy(viewer, decision)).
		SetNillableTitle(in.Title).
		SetNillableSequence(in.Sequence).
		SetNillableDescription(in.Description).
		SetNillableParentID(in.ParentID).
		SetNillableCopiedFromID(in.CopiedFromID)

	if clearsParent {
		update = update.ClearParentID()
	}
	if in.Metadata != nil {
		update = update.SetMetadataJSON(in.Metadata)
	}
	if in.Kind != nil {
		update = update.SetKind(kind)
	}
	if in.Status != nil {
		update = update.SetStatus(status)
	}

	n, err := update.Save(ctx)
	if !wroteScopedRow(w, n, err, "curriculum node not found") {
		return
	}

	row, err := client.CurriculumNode.Query().Where(entnode.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "curriculum node not found")
		return
	}
	response.JSON(w, http.StatusOK, row)
}

func (s *Server) deleteCurriculumNode(w http.ResponseWriter, r *http.Request) {
	s.deleteScoped(w, r, "curriculum node not found",
		authorization.CurriculumDelete, authorization.CurriculumDeleteAll,
		func(ctx context.Context, c *tenantent.Client, id uuid.UUID,
			v *access.Viewer, d authorization.Decision) (int, error) {
			return c.CurriculumNode.Delete().
				Where(entnode.ID(id), access.CurriculumNodesWritableBy(v, d)).
				Exec(ctx)
		})
}
