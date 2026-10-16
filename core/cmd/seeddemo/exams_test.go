package main

import (
	"fmt"
	"testing"

	"github.com/google/uuid"

	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
)

type roundWorld struct {
	a     *academics
	index *examIndex
	left  map[uuid.UUID][]string
}

func newRoundWorld(grades, divisions, teachers int, subjects []string) *roundWorld {
	a := &academics{}
	index := &examIndex{
		offering: map[uuid.UUID]map[uuid.UUID]*tenantent.SubjectOffering{},
		subject:  map[string]uuid.UUID{},
		teacher:  map[uuid.UUID]*uuid.UUID{},
		gradeAt:  map[uuid.UUID]int{},
	}

	for _, code := range subjects {
		index.subject[code] = uuid.New()
	}

	staff := make([]uuid.UUID, teachers)
	for at := range staff {
		staff[at] = uuid.New()
	}

	for g := 0; g < grades; g++ {
		grade := &tenantent.GradeLevel{ID: uuid.New(), Code: fmt.Sprintf("G%d", g)}
		a.grades = append(a.grades, grade)
		index.gradeAt[grade.ID] = g
		for d := 0; d < divisions; d++ {
			section := &tenantent.Section{
				ID:           uuid.New(),
				GradeLevelID: grade.ID,
				Code:         fmt.Sprintf("G%d-%d", g, d),
			}
			a.sections = append(a.sections, section)
			index.offering[section.ID] = map[uuid.UUID]*tenantent.SubjectOffering{}
		}
	}

	for at, section := range a.sections {
		for j, code := range subjects {
			offering := &tenantent.SubjectOffering{
				ID:        uuid.New(),
				SectionID: section.ID,
				SubjectID: index.subject[code],
			}
			index.offering[section.ID][offering.SubjectID] = offering
			held := staff[(at*len(subjects)+j+1)%teachers]
			index.teacher[offering.ID] = &held
		}
	}

	left := map[uuid.UUID][]string{}
	for _, section := range a.sections {
		left[section.ID] = append([]string(nil), subjects...)
	}
	return &roundWorld{a: a, index: index, left: left}
}

func (w *roundWorld) run(t *testing.T) int {
	t.Helper()

	rounds := 0
	for round := 0; ; round++ {
		pending := 0
		for _, papers := range w.left {
			pending += len(papers)
		}
		if pending == 0 {
			return rounds
		}
		if round > len(w.a.sections)*10 {
			t.Fatalf("%d papers are still unplaced after %d rounds", pending, round)
		}

		chosen := matchRound(w.a, w.index, w.left, round)
		if len(chosen) != len(w.a.sections) {
			t.Fatalf("round %d seated %d of %d sections; a partial round leaves a lesson "+
				"running in the period the exam takes, which the clash engine refuses",
				round, len(chosen), len(w.a.sections))
		}

		taken := map[uuid.UUID]int{}
		for _, section := range w.a.sections {
			at, seated := chosen[section.ID]
			if !seated {
				t.Fatalf("round %d left %s without a paper", round, section.Code)
			}
			code := w.left[section.ID][at]
			offering := w.index.offeringOf(section.ID, code)
			teacher := w.index.teacher[offering.ID]
			if teacher != nil {
				taken[*teacher]++
				if taken[*teacher] > 1 {
					t.Fatalf("round %d invigilates one teacher in two rooms at once", round)
				}
			}
			w.left[section.ID] = append(
				w.left[section.ID][:at:at], w.left[section.ID][at+1:]...)
		}
		rounds++
	}
}

func TestEveryRoundSeatsEverySection(t *testing.T) {
	cases := []struct {
		name              string
		grades, divisions int
		teachers          int
		subjects          []string
		wantRounds        int
	}{
		{"the demo school, five papers", 3, 2, 10, examCoreSubjects, 5},
		{"the demo school, three papers", 3, 2, 10, examTestSubjects, 3},
		{"the CI school, three papers", 2, 2, 4, examTestSubjects, 3},
		{"the CI school, five papers", 2, 2, 4, examCoreSubjects, 5},
		{"as many teachers as sections", 4, 2, 8, examCoreSubjects, 5},
		{"one teacher per subject across the school", 2, 2, 5, examCoreSubjects, 5},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			w := newRoundWorld(tc.grades, tc.divisions, tc.teachers, tc.subjects)
			if got := w.run(t); got != tc.wantRounds {
				t.Fatalf("every section sits every paper exactly once, so the rounds must be "+
					"%d, got %d", tc.wantRounds, got)
			}
		})
	}
}

func TestASectionWithoutATeacherIsStillSeated(t *testing.T) {
	w := newRoundWorld(2, 2, 1, examTestSubjects)
	for id := range w.index.teacher {
		w.index.teacher[id] = nil
	}
	if got := w.run(t); got != len(examTestSubjects) {
		t.Fatalf("an unstaffed offering constrains nothing, so the rounds must be %d, got %d",
			len(examTestSubjects), got)
	}
}
