package http

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
)

func contactOptions(t *testing.T, in timetableGeneratePayload) (*httptest.ResponseRecorder, bool) {
	t.Helper()

	rec := httptest.NewRecorder()
	options, ok := readGenerateOptions(rec, in, 30)
	if ok {
		if len(options.DailyContact) != len(in.DailyContact) {
			t.Fatalf("wanted %d rules kept, got %d",
				len(in.DailyContact), len(options.DailyContact))
		}
		for i := range options.DailyContact {
			if options.DailyContact[i].MinPerDay < 1 {
				t.Fatalf("rule %d came through with a floor of %d",
					i, options.DailyContact[i].MinPerDay)
			}
		}
	}
	return rec, ok
}

func contactRefusal(t *testing.T, rec *httptest.ResponseRecorder, fragment string) {
	t.Helper()

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("wanted 422, got %d: %s", rec.Code, rec.Body.String())
	}
	var body struct {
		Message string `json:"message"`
		Error   string `json:"error"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("the refusal is not JSON: %v", err)
	}
	said := body.Message + " " + body.Error
	if !strings.Contains(said, fragment) {
		t.Fatalf("wanted a refusal mentioning %q, got %q", fragment, said)
	}
}

func TestADailyContactRuleDefaultsToOneLessonADay(t *testing.T) {
	rec := httptest.NewRecorder()
	options, ok := readGenerateOptions(rec, timetableGeneratePayload{
		DailyContact: []timetableGenerateContact{
			{SectionID: uuid.NewString(), ClassTeacher: true},
		},
	}, 30)
	if !ok {
		t.Fatalf("a well-formed rule was refused: %s", rec.Body.String())
	}
	if len(options.DailyContact) != 1 || options.DailyContact[0].MinPerDay != 1 {
		t.Fatalf("wanted one rule with a floor of one, got %+v", options.DailyContact)
	}
}

func TestADailyContactRuleTakesOfferingsByHandOrResolvesThemButNotBoth(t *testing.T) {
	both := timetableGenerateContact{
		SectionID:    uuid.NewString(),
		OfferingIDs:  []string{uuid.NewString()},
		ClassTeacher: true,
	}
	rec, ok := contactOptions(t, timetableGeneratePayload{
		DailyContact: []timetableGenerateContact{both},
	})
	if ok {
		t.Fatal("a rule naming both a subject set and the class teacher was accepted")
	}
	contactRefusal(t, rec, "exactly one of the two")

	neither := timetableGenerateContact{SectionID: uuid.NewString()}
	rec, ok = contactOptions(t, timetableGeneratePayload{
		DailyContact: []timetableGenerateContact{neither},
	})
	if ok {
		t.Fatal("a rule naming nothing to place was accepted")
	}
	contactRefusal(t, rec, "exactly one of the two")
}

func TestADailyContactRuleIsKeyedByUUIDsLikeItsNeighbours(t *testing.T) {
	rec, ok := contactOptions(t, timetableGeneratePayload{
		DailyContact: []timetableGenerateContact{{SectionID: "6A", ClassTeacher: true}},
	})
	if ok {
		t.Fatal("a section named by its code was accepted")
	}
	contactRefusal(t, rec, "daily_contact.section_id")

	rec, ok = contactOptions(t, timetableGeneratePayload{
		DailyContact: []timetableGenerateContact{
			{SectionID: uuid.NewString(), OfferingIDs: []string{"maths"}},
		},
	})
	if ok {
		t.Fatal("an offering named by its code was accepted")
	}
	contactRefusal(t, rec, "daily_contact.offering_ids")
}

func TestAFloorOfZeroLessonsADayIsRefusedRatherThanTakenAsNoRule(t *testing.T) {
	zero := 0
	rec, ok := contactOptions(t, timetableGeneratePayload{
		DailyContact: []timetableGenerateContact{
			{SectionID: uuid.NewString(), ClassTeacher: true, MinPerDay: &zero},
		},
	})
	if ok {
		t.Fatal("a rule asking for nothing was accepted as a rule")
	}
	contactRefusal(t, rec, "leave the rule out")
}

func TestDailyContactIsAbsentFromTheOptionsWhenNobodyAskedForIt(t *testing.T) {
	rec := httptest.NewRecorder()
	options, ok := readGenerateOptions(rec, timetableGeneratePayload{}, 30)
	if !ok {
		t.Fatalf("an empty body was refused: %s", rec.Body.String())
	}
	if options.DailyContact != nil {
		t.Fatalf("wanted nothing recorded, got %v", options.DailyContact)
	}
}

func TestTheDailyContactPenaltyIsAWeightACallerMayName(t *testing.T) {
	rec := httptest.NewRecorder()
	if _, ok := readGenerateOptions(rec, timetableGeneratePayload{
		Weights: map[string]int{"daily_contact": 500},
	}, 30); !ok {
		t.Fatalf("the daily_contact weight was refused: %s", rec.Body.String())
	}
}
