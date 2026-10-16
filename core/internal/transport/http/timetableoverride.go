package http

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	"github.com/Harbour-Emerge/emerge-core/internal/domain/shared"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entslot "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetableslot"
	timetablesvc "github.com/Harbour-Emerge/emerge-core/internal/service/timetable"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

const timetableOverrideReasonRunes = 500

type slotOverrideRequest struct {
	reason string
}

type slotOverride struct {
	reason   string
	by       *uuid.UUID
	at       *time.Time
	accepted []shared.AcceptedClash
}

func (o *slotOverride) recorded() bool {
	return o != nil && strings.TrimSpace(o.reason) != "" && len(o.accepted) > 0
}

func readSlotOverride(w http.ResponseWriter, in timetableSlotPayload,
	sent []string) (*slotOverrideRequest, bool) {
	if in.ClashOverride == nil || !*in.ClashOverride {
		if wasSent(sent, entslot.FieldClashOverrideReason) && in.ClashOverride == nil {
			response.Error(w, http.StatusUnprocessableEntity,
				entslot.FieldClashOverrideReason+" means nothing without "+
					entslot.FieldClashOverride+": say which clash you are accepting")
			return nil, false
		}
		return nil, true
	}

	reason := ""
	if in.ClashOverrideReason != nil {
		reason = strings.TrimSpace(*in.ClashOverrideReason)
	}
	if reason == "" {
		response.Error(w, http.StatusUnprocessableEntity,
			entslot.FieldClashOverride+" needs a "+entslot.FieldClashOverrideReason+
				": a double-booking nobody explained is indistinguishable from a mistake")
		return nil, false
	}
	if !withinRunes(w, entslot.FieldClashOverrideReason, reason, timetableOverrideReasonRunes) {
		return nil, false
	}
	return &slotOverrideRequest{reason: reason}, true
}

func (s *Server) mayOverrideClash(ctx context.Context, w http.ResponseWriter) bool {
	subject, err := authorization.SubjectFrom(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return false
	}
	decision, err := s.guard.Allow(ctx, subject, authorization.TimetableOverride, nil)
	if err != nil {
		writeTenancyErr(w, err)
		return false
	}
	if !decision.Allowed {
		response.Error(w, http.StatusForbidden,
			"arranging a week and forcing a double-booking are different powers: "+
				string(authorization.TimetableOverride)+" is required")
		return false
	}
	return true
}

func carriedOverride(current *tenantent.TimetableSlot) *timetablesvc.Override {
	if current == nil || !current.ClashOverride || len(current.ClashOverrideJSON) == 0 {
		return nil
	}
	id := current.ID
	note := &timetablesvc.Override{SlotID: &id, Accepted: current.ClashOverrideJSON}
	if current.ClashOverrideReason != nil {
		note.Reason = *current.ClashOverrideReason
	}
	note.By = current.ClashOverriddenBy
	note.At = current.ClashOverriddenAt
	return note
}

func (s *Server) settleSlotClash(ctx context.Context, w http.ResponseWriter, client *tenantent.Client,
	timetable *tenantent.Timetable, proposal timetablesvc.Proposal, viewer *access.Viewer,
	fresh *slotOverrideRequest) (*slotOverride, bool) {
	branch, err := branchOfScheme(ctx, client, timetable.PeriodSchemeID)
	if err != nil {
		writeTenantEntErr(w, err, timetableSchemeNotFound)
		return nil, false
	}

	service, err := timetablesvc.FromContext(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return nil, false
	}

	report, err := service.Check(ctx, timetablesvc.ClashQuery{
		BranchID:    branch,
		TimetableID: timetable.ID,
		Proposed:    []timetablesvc.Proposal{proposal},
	})
	if err != nil {
		writeTimetableServiceErr(w, err, timetableNotFound)
		return nil, false
	}

	blocking := report.Blocking()
	if len(blocking) > 0 {
		if fresh == nil {
			writeClashReport(w, report,
				"this slot collides with a class that is already timetabled")
			return nil, false
		}
		for _, clash := range blocking {
			if !clash.Overridable {
				writeClashReport(w, report,
					"a pupil cannot be in two rooms at once: a "+string(clash.Rule)+
						" clash is not overridable, the offerings have to be moved apart")
				return nil, false
			}
		}
	}

	out := &slotOverride{accepted: timetablesvc.AcceptedFor(report, proposal.Ref)}
	switch {
	case fresh != nil:
		now := time.Now().UTC()
		out.reason, out.by, out.at = fresh.reason, viewer.PersonID, &now
	case proposal.Override != nil:
		out.reason, out.by, out.at = proposal.Override.Reason, proposal.Override.By, proposal.Override.At
	}
	return out, true
}

func applySlotOverride(create *tenantent.TimetableSlotCreate,
	override *slotOverride) *tenantent.TimetableSlotCreate {
	if !override.recorded() {
		return create
	}
	return create.
		SetClashOverride(true).
		SetClashOverrideReason(override.reason).
		SetNillableClashOverriddenBy(override.by).
		SetNillableClashOverriddenAt(override.at).
		SetClashOverrideJSON(override.accepted)
}

func updateSlotOverride(update *tenantent.TimetableSlotUpdate,
	override *slotOverride) *tenantent.TimetableSlotUpdate {
	if !override.recorded() {
		return update.
			SetClashOverride(false).
			ClearClashOverrideReason().
			ClearClashOverriddenBy().
			ClearClashOverriddenAt().
			ClearClashOverrideJSON()
	}
	return update.
		SetClashOverride(true).
		SetClashOverrideReason(override.reason).
		SetNillableClashOverriddenBy(override.by).
		SetNillableClashOverriddenAt(override.at).
		SetClashOverrideJSON(override.accepted)
}
