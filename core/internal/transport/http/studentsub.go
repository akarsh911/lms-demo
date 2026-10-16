package http

import (
	"entgo.io/ent/dialect/sql"

	"context"
	"net/http"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	"github.com/Harbour-Emerge/emerge-core/internal/data/studentrecord"
	"github.com/Harbour-Emerge/emerge-core/internal/domain/shared"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/predicate"
	entaddress "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentaddress"
	entdocument "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentdocument"
	entnote "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentnote"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

type addressPayload struct {
	StudentID   *uuid.UUID      `json:"student_id"`
	AddressType *string         `json:"address_type"`
	Address     *shared.Address `json:"address_json"`
	IsPrimary   *bool           `json:"is_primary"`
	ValidFrom   *string         `json:"valid_from"`
	ValidTo     *string         `json:"valid_to"`
}

func (s *Server) listAddresses(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	filters, err := studentrecord.ParseAddressFilters(r.URL.Query())
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.StudentAddressesRead, authorization.StudentAddressesReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	q := client.StudentAddress.Query().
		Where(entaddress.HasStudentWith(access.StudentsFor(viewer, decision)))

	rows, err := filters.Apply(q).All(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	projected, err := projectAll(rows, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	response.JSON(w, http.StatusOK, response.Envelope{
		"student_addresses": projected, "count": len(rows),
		"page": pageOf(filters.Limit, filters.Offset, len(rows)),
	})
}

func (s *Server) createAddress(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	var in addressPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	_, decision, err := s.scopeFor(ctx,
		authorization.StudentAddressesWrite, authorization.StudentAddressesWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entaddress.Columns, sent) {
		return
	}

	if in.StudentID == nil {
		response.Error(w, http.StatusBadRequest, "student_id is required")
		return
	}
	if in.Address == nil {
		response.Error(w, http.StatusBadRequest, "address_json is required")
		return
	}

	from, err := parseDate(in.ValidFrom)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "valid_from must be YYYY-MM-DD")
		return
	}
	to, err := parseDate(in.ValidTo)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "valid_to must be YYYY-MM-DD")
		return
	}

	create := client.StudentAddress.Create().
		SetStudentID(*in.StudentID).
		SetAddressJSON(in.Address)

	if in.AddressType != nil {
		kind := entaddress.AddressType(*in.AddressType)
		if err := entaddress.AddressTypeValidator(kind); err != nil {
			response.Error(w, http.StatusBadRequest, "address_type must be home, hostel or other")
			return
		}
		create = create.SetAddressType(kind)
	}
	if in.IsPrimary != nil {
		create = create.SetIsPrimary(*in.IsPrimary)
	}
	if from != nil {
		create = create.SetValidFrom(*from)
	}
	if to != nil {
		create = create.SetValidTo(*to)
	}

	row, err := create.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "address not found")
		return
	}
	if in.IsPrimary != nil && *in.IsPrimary {
		if _, err := client.StudentAddress.Update().
			Where(entaddress.StudentID(*in.StudentID), entaddress.IDNEQ(row.ID)).
			SetIsPrimary(false).Save(ctx); err != nil {
			response.ServerError(w, err)
			return
		}
	}
	response.JSON(w, http.StatusCreated, row)
}

func (s *Server) deleteAddress(w http.ResponseWriter, r *http.Request) {
	s.deleteScoped(w, r, "address not found",
		authorization.StudentAddressesDelete, authorization.StudentAddressesDeleteAll,
		func(ctx context.Context, c *tenantent.Client, id uuid.UUID,
			v *access.Viewer, d authorization.Decision) (int, error) {
			return c.StudentAddress.Delete().
				Where(entaddress.ID(id), entaddress.HasStudentWith(access.StudentsFor(v, d))).
				Exec(ctx)
		})
}

type documentPayload struct {
	StudentID          *uuid.UUID `json:"student_id"`
	DocumentType       *string    `json:"document_type"`
	AssetID            *uuid.UUID `json:"asset_id"`
	DocumentNumber     *string    `json:"document_number"`
	IssuedBy           *string    `json:"issued_by"`
	IssuedAt           *string    `json:"issued_at"`
	ExpiresAt          *string    `json:"expires_at"`
	AcademicSessionID  *uuid.UUID `json:"academic_session_id"`
	VerificationStatus *string    `json:"verification_status"`
	VerifiedBy         *uuid.UUID `json:"verified_by"`
}

func (s *Server) listDocuments(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	filters, err := studentrecord.ParseDocumentFilters(r.URL.Query())
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.StudentDocumentsRead, authorization.StudentDocumentsReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	q := client.StudentDocument.Query().
		Where(documentsVisibleTo(viewer, decision))

	rows, err := filters.Apply(q).All(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	projected, err := projectAll(rows, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	response.JSON(w, http.StatusOK, response.Envelope{
		"student_documents": projected, "count": len(rows),
		"page": pageOf(filters.Limit, filters.Offset, len(rows)),
	})
}

func (s *Server) createDocument(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	var in documentPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	_, decision, err := s.scopeFor(ctx,
		authorization.StudentDocumentsWrite, authorization.StudentDocumentsWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entdocument.Columns, sent) {
		return
	}

	if in.StudentID == nil || in.AssetID == nil {
		response.Error(w, http.StatusBadRequest, "student_id and asset_id are required")
		return
	}
	if in.DocumentType == nil || *in.DocumentType == "" {
		response.Error(w, http.StatusBadRequest, "document_type is required")
		return
	}

	issued, err := parseDate(in.IssuedAt)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "issued_at must be YYYY-MM-DD")
		return
	}
	expires, err := parseDate(in.ExpiresAt)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "expires_at must be YYYY-MM-DD")
		return
	}

	create := client.StudentDocument.Create().
		SetStudentID(*in.StudentID).
		SetAssetID(*in.AssetID).
		SetDocumentType(*in.DocumentType).
		SetNillableDocumentNumber(in.DocumentNumber).
		SetNillableIssuedBy(in.IssuedBy)

	if issued != nil {
		create = create.SetIssuedAt(*issued)
	}
	if expires != nil {
		create = create.SetExpiresAt(*expires)
	}
	if in.AcademicSessionID != nil {
		create = create.SetAcademicSessionID(*in.AcademicSessionID)
	}

	row, err := create.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "document not found")
		return
	}
	response.JSON(w, http.StatusCreated, row)
}

func (s *Server) verifyDocument(w http.ResponseWriter, r *http.Request) {
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

	var in documentPayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.StudentDocumentsWrite, authorization.StudentDocumentsWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	found, err := reachDocument(ctx, client, id, viewer, decision)
	if !mustReach(w, found, err, "document not found") {
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entdocument.Columns, sent) {
		return
	}

	if in.VerificationStatus == nil {
		response.Error(w, http.StatusBadRequest, "verification_status is required")
		return
	}
	kind := entdocument.VerificationStatus(*in.VerificationStatus)
	if err := entdocument.VerificationStatusValidator(kind); err != nil {
		response.Error(w, http.StatusBadRequest,
			"verification_status must be unverified, pending, verified or rejected")
		return
	}

	verifier, ok := attributedToOptional(w, viewer, in.VerifiedBy, "verified_by")
	if !ok {
		return
	}

	update := client.StudentDocument.Update().
		Where(entdocument.ID(id), documentsVisibleTo(viewer, decision)).
		SetVerificationStatus(kind).
		SetVerifiedAt(nowUTC()).
		SetNillableVerifiedBy(verifier)

	n, err := update.Save(ctx)
	if !wroteScopedRow(w, n, err, "document not found") {
		return
	}

	row, err := client.StudentDocument.Query().Where(entdocument.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "document not found")
		return
	}
	response.JSON(w, http.StatusOK, row)
}

func (s *Server) deleteDocument(w http.ResponseWriter, r *http.Request) {
	s.deleteScoped(w, r, "document not found",
		authorization.StudentDocumentsDelete, authorization.StudentDocumentsDeleteAll,
		func(ctx context.Context, c *tenantent.Client, id uuid.UUID,
			v *access.Viewer, d authorization.Decision) (int, error) {
			return c.StudentDocument.Delete().
				Where(entdocument.ID(id), documentsVisibleTo(v, d)).
				Exec(ctx)
		})
}

type notePayload struct {
	StudentID         *uuid.UUID `json:"student_id"`
	AcademicSessionID *uuid.UUID `json:"academic_session_id"`
	AuthorPersonID    *uuid.UUID `json:"author_person_id"`
	Category          *string    `json:"category"`
	Title             *string    `json:"title"`
	Body              *string    `json:"body"`
	Visibility        *string    `json:"visibility"`
}

func (s *Server) listNotes(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	filters, err := studentrecord.ParseNoteFilters(r.URL.Query())
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.StudentNotesRead, authorization.StudentNotesReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	q := client.StudentNote.Query()
	if viewer.Restricted() {
		p, ok := visibleNotes(viewer, decision)
		if !ok {
			response.JSON(w, http.StatusOK, response.Envelope{
				"student_notes": []any{}, "count": 0,
				"page": pageOf(filters.Limit, filters.Offset, 0),
			})
			return
		}
		q = q.Where(p)
	}

	rows, err := filters.Apply(q).Order(tenantent.Desc(entnote.FieldCreatedAt)).All(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	projected, err := projectAll(rows, decision.Fields)
	if err != nil {
		response.ServerError(w, err)
		return
	}
	response.JSON(w, http.StatusOK, response.Envelope{
		"student_notes": projected, "count": len(rows),
		"page": pageOf(filters.Limit, filters.Offset, len(rows)),
	})
}

func (s *Server) createNote(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	var in notePayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.StudentNotesWrite, authorization.StudentNotesWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entnote.Columns, sent) {
		return
	}

	if in.StudentID == nil || in.AcademicSessionID == nil {
		response.Error(w, http.StatusBadRequest, "student_id and academic_session_id are required")
		return
	}
	if in.Category == nil || *in.Category == "" || in.Body == nil || *in.Body == "" {
		response.Error(w, http.StatusBadRequest, "category and body are required")
		return
	}

	author, ok := attributedTo(w, viewer, in.AuthorPersonID, "author_person_id")
	if !ok {
		return
	}

	create := client.StudentNote.Create().
		SetStudentID(*in.StudentID).
		SetAcademicSessionID(*in.AcademicSessionID).
		SetAuthorPersonID(author).
		SetCategory(*in.Category).
		SetBody(*in.Body).
		SetNillableTitle(in.Title)

	if in.Visibility != nil {
		kind := entnote.Visibility(*in.Visibility)
		if err := entnote.VisibilityValidator(kind); err != nil {
			response.Error(w, http.StatusBadRequest, "visibility must be private, staff or guardian")
			return
		}
		create = create.SetVisibility(kind)
	}

	row, err := create.Save(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "note not found")
		return
	}
	response.JSON(w, http.StatusCreated, row)
}

func (s *Server) updateNote(w http.ResponseWriter, r *http.Request) {
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

	var in notePayload
	sent, err := response.DecodeFields(r, &in)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.StudentNotesWrite, authorization.StudentNotesWriteAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	found, err := reachNote(ctx, client, id, viewer, decision)
	if !mustReach(w, found, err, "note not found") {
		return
	}
	if !rejectUnauthorizedFields(w, r, decision, entnote.Columns, sent) {
		return
	}

	update := client.StudentNote.Update().
		Where(entnote.ID(id), notesVisibleTo(viewer, decision)).
		SetNillableTitle(in.Title).
		SetNillableCategory(in.Category).
		SetNillableBody(in.Body)

	if in.Visibility != nil {
		kind := entnote.Visibility(*in.Visibility)
		if err := entnote.VisibilityValidator(kind); err != nil {
			response.Error(w, http.StatusBadRequest, "visibility must be private, staff or guardian")
			return
		}
		update = update.SetVisibility(kind)
	}

	n, err := update.Save(ctx)
	if !wroteScopedRow(w, n, err, "note not found") {
		return
	}

	row, err := client.StudentNote.Query().Where(entnote.ID(id)).Only(ctx)
	if err != nil {
		writeTenantEntErr(w, err, "note not found")
		return
	}
	response.JSON(w, http.StatusOK, row)
}

func (s *Server) deleteNote(w http.ResponseWriter, r *http.Request) {
	s.deleteScoped(w, r, "note not found",
		authorization.StudentNotesDelete, authorization.StudentNotesDeleteAll,
		func(ctx context.Context, c *tenantent.Client, id uuid.UUID,
			v *access.Viewer, d authorization.Decision) (int, error) {
			return c.StudentNote.Delete().
				Where(entnote.ID(id), notesVisibleTo(v, d)).
				Exec(ctx)
		})
}

func notesAuthored(v *access.Viewer) predicate.StudentNote {
	if v.PersonID == nil {
		return nil
	}
	return entnote.AuthorPersonID(*v.PersonID)
}

func notesAboutSelf(v *access.Viewer) predicate.StudentNote {
	if len(v.StudentIDs) == 0 {
		return nil
	}
	return entnote.And(
		entnote.VisibilityEQ(entnote.VisibilityGuardian),
		entnote.HasStudentWith(access.StudentsSelf(v)),
	)
}

func notesTaught(v *access.Viewer) predicate.StudentNote {
	if v.StaffID == nil {
		return nil
	}
	return entnote.And(
		entnote.VisibilityIn(entnote.VisibilityStaff, entnote.VisibilityGuardian),
		entnote.HasStudentWith(access.StudentsTaughtBy(v)),
	)
}

func notesGuarded(v *access.Viewer) predicate.StudentNote {
	if v.GuardianID == nil {
		return nil
	}
	return entnote.And(
		entnote.VisibilityEQ(entnote.VisibilityGuardian),
		entnote.HasStudentWith(access.StudentsOfGuardian(v)),
	)
}

func anyOf(parts ...predicate.StudentNote) (predicate.StudentNote, bool) {
	var ors []predicate.StudentNote
	for _, p := range parts {
		if p != nil {
			ors = append(ors, p)
		}
	}
	if len(ors) == 0 {
		return nil, false
	}
	return entnote.Or(ors...), true
}

func visibleNotes(v *access.Viewer, d authorization.Decision) (predicate.StudentNote, bool) {
	if v == nil {
		return nil, false
	}

	if !d.HasReach {
		return anyOf(notesAuthored(v), notesTaught(v), notesGuarded(v))
	}

	switch d.Reach {
	case authorization.ReachTenant:
		return anyNote(), true
	case authorization.ReachSelf:
		return anyOf(notesAuthored(v), notesAboutSelf(v))
	case authorization.ReachGuardianWard:
		return anyOf(notesGuarded(v))
	case authorization.ReachTeacherAssignment:
		return anyOf(notesTaught(v))
	default:
		return nil, false
	}
}

func anyNote() predicate.StudentNote { return func(*sql.Selector) {} }

func notesVisibleTo(v *access.Viewer, d authorization.Decision) predicate.StudentNote {
	if !v.Restricted() {
		return anyNote()
	}
	p, ok := visibleNotes(v, d)
	if !ok {
		return entnote.IDIn()
	}
	return p
}
