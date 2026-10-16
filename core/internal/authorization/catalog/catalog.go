package catalog

import (
	"sort"
	"strings"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	entsession "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/academicsession"
	entachievement "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/achievement"
	entassignment "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/assignment"
	entsubmission "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/assignmentsubmission"
	entattendance "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/attendanceperiod"
	entblueprint "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/blueprint"
	entcalendar "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/calendarday"
	entmastery "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/conceptmastery"
	entcontentitem "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentitem"
	entplacement "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentplacement"
	entcurriculum "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/curriculum"
	entguardian "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/guardian"
	entpaper "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/paper"
	entrun "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/papergenerationrun"
	entperson "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/person"
	entpraise "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/praise"
	entreaction "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/praisereaction"
	entquestion "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/question"
	entroom "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/room"
	entsection "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/section"
	entstaff "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/staff"
	entstreamcomment "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/streamcomment"
	entstreampost "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/streampost"
	entstudent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/student"
	entstudentachievement "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentachievement"
	entaddress "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentaddress"
	entstudentassign "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentassignment"
	entdocument "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentdocument"
	entenrollment "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentenrollment"
	entlink "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentguardian"
	entnote "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentnote"
	entsubjenroll "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentsubjectenrollment"
	entoffering "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/subjectoffering"
	entteacher "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/teacher"
	entteacherassign "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/teacherassignment"
	entslot "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/timetableslot"
)

type Field struct {
	Key        string   `json:"key"`
	Name       string   `json:"name"`
	DataType   string   `json:"data_type"`
	EnumValues []string `json:"enum_values,omitempty"`
	Operators  []string `json:"operators,omitempty"`
}

type Entity struct {
	Key         string  `json:"key"`
	Name        string  `json:"name"`
	Description string  `json:"description,omitempty"`
	Fields      []Field `json:"fields"`
}

type Catalog struct {
	Service  string   `json:"service"`
	Entities []Entity `json:"entities"`
}

var areaColumns = map[string][]string{
	"persons":                entperson.Columns,
	"students":               entstudent.Columns,
	"staff":                  entstaff.Columns,
	"teachers":               entteacher.Columns,
	"guardians":              entguardian.Columns,
	"student_guardians":      entlink.Columns,
	"enrollments":            entenrollment.Columns,
	"subject_enrollments":    entsubjenroll.Columns,
	"teacher_assignments":    entteacherassign.Columns,
	"student_assignments":    entstudentassign.Columns,
	"student_notes":          entnote.Columns,
	"student_addresses":      entaddress.Columns,
	"student_documents":      entdocument.Columns,
	"library":                entcontentitem.Columns,
	"curriculum":             entcurriculum.Columns,
	"content_placements":     entplacement.Columns,
	"sections":               entsection.Columns,
	"academic_sessions":      entsession.Columns,
	"subject_offerings":      entoffering.Columns,
	"timetable":              entslot.Columns,
	"attendance":             entattendance.Columns,
	"stream_posts":           entstreampost.Columns,
	"stream_comments":        entstreamcomment.Columns,
	"assignments":            entassignment.Columns,
	"assignment_submissions": entsubmission.Columns,
	"achievements":           entachievement.Columns,
	"student_achievements":   entstudentachievement.Columns,
	"praises":                entpraise.Columns,
	"praise_reactions":       entreaction.Columns,
	"question_bank":          entquestion.Columns,
	"blueprints":             entblueprint.Columns,
	"papers":                 entpaper.Columns,
	"paper_generation":       entrun.Columns,
	"concept_mastery":        entmastery.Columns,
	"rooms":                  entroom.Columns,
	"calendar":               entcalendar.Columns,
}

var verbNames = map[string]string{
	"read":       "Read %s",
	"read_all":   "Read all %s",
	"write":      "Create and edit %s",
	"write_all":  "Create and edit any %s",
	"delete":     "Delete %s",
	"delete_all": "Delete any %s",
	"create":     "Add %s",
	"override":   "Override a %s clash",
	"generate":   "Auto-fill a %s",
}

var verbDescriptions = map[string]string{
	"read":       "The %s this caller is related to. Emerge Core narrows to them.",
	"read_all":   "Every %s in the school, unnarrowed. Wider than the read above.",
	"write_all":  "Every %s in the school. Does not follow from school-wide read.",
	"delete_all": "Every %s in the school. Does not follow from school-wide edit.",
	"create":     "Bring a new %s into the school, separate from editing an existing one.",
	"override":   "Save a %s entry that clashes, against a recorded reason. Separate from editing one that does not.",
	"generate":   "Fill a whole draft %s from the solver in one press. Wider than editing a slot, which reaches one section at a time.",
}

func Build() Catalog {
	narrowable := narrowableAreas()

	entities := make([]Entity, 0, len(authorization.AllEntities))
	for _, e := range authorization.AllEntities {
		area, verb, ok := split(string(e))
		if !ok {
			continue
		}
		entities = append(entities, Entity{
			Key:         string(e),
			Name:        name(verbNames[verb], area),
			Description: name(verbDescriptions[verb], area),
			Fields:      fieldsFor(area, verb, narrowable[area]),
		})
	}

	sort.Slice(entities, func(i, j int) bool { return entities[i].Key < entities[j].Key })
	return Catalog{Service: authorization.Service, Entities: entities}
}

func narrowableAreas() map[string]bool {
	out := map[string]bool{}
	for _, e := range authorization.AllEntities {
		if area, verb, ok := split(string(e)); ok && strings.HasSuffix(verb, "_all") {
			out[area] = true
		}
	}
	return out
}

func split(key string) (string, string, bool) {
	parts := strings.SplitN(key, ".", 3)
	if len(parts) != 3 || parts[0] != authorization.Service {
		return "", "", false
	}
	return parts[1], parts[2], true
}

func fieldsFor(area, verb string, narrowable bool) []Field {
	var out []Field
	if narrowable && verb != "create" {
		out = append(out, scopeFields()...)
	}
	if verb == "delete" || verb == "delete_all" {
		return out
	}
	return append(out, columnFields(areaColumns[area])...)
}

func scopeFields() []Field {
	out := []Field{{
		Key:        authorization.ReachField,
		Name:       label(authorization.ReachField),
		DataType:   "enum",
		EnumValues: authorization.ReachValues(),
		Operators:  []string{"="},
	}}
	for _, f := range authorization.RowFields() {
		out = append(out, Field{
			Key:       f,
			Name:      label(f),
			DataType:  "string",
			Operators: authorization.ConstraintOperators(),
		})
	}
	return out
}

func columnFields(columns []string) []Field {
	out := make([]Field, 0, len(columns))
	for _, c := range columns {
		if authorization.ServerOwned(c) {
			continue
		}
		out = append(out, Field{Key: c, Name: label(c), DataType: "string"})
	}
	return out
}

func name(pattern, area string) string {
	if pattern == "" {
		return ""
	}
	return strings.Replace(pattern, "%s", strings.ToLower(label(area)), 1)
}

func label(segment string) string {
	words := strings.Split(segment, "_")
	for i, w := range words {
		if w == "" {
			continue
		}
		if i == 0 {
			words[i] = strings.ToUpper(w[:1]) + w[1:]
			continue
		}
		words[i] = w
	}
	return strings.Join(words, " ")
}

func Split(key string) (string, string, bool) { return split(key) }

func (e Entity) ColumnFields() []Field {
	out := make([]Field, 0, len(e.Fields))
	for _, f := range e.Fields {
		if f.Key == authorization.ReachField || authorization.RowField(f.Key) {
			continue
		}
		out = append(out, f)
	}
	return out
}
