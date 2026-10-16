import json, os, sys, urllib.request, urllib.error

BASE = os.environ.get("CAS_BASE_URL", "https://auth.tryemerge.in")
SP = os.path.expanduser("~/.emerge-scratch")
TOKEN = open(os.path.join(SP, "tok")).read().strip()
ATOMS_SECTION = "Emerge Core/Atoms"
BUNDLE_SECTION = "Emerge Core/Bundles"
APPLY = "--apply" in sys.argv


def call(method, path, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Authorization", "Bearer " + TOKEN)
    if data:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = r.read().decode()
            return r.status, (json.loads(body) if body.strip() else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:300]


ENT = json.load(open(os.path.join(SP, "entmap.json")))
REACHABLE = {}


def has_reach(key):
    if key not in REACHABLE:
        _, d = call("GET", "/v1/admin/entities/" + ENT[key])
        REACHABLE[key] = any(f.get("key") == "reach" for f in ((d or {}).get("fields") or []))
    return REACHABLE[key]


NAMES = ["first_name", "middle_name", "last_name", "display_name"]
DASH = "—"


def A(key, name, desc, reach, entities, fields=None):
    out = []
    for e in entities:
        if isinstance(e, tuple):
            out.append((e[0], reach, e[1]))
        else:
            out.append((e, reach, fields))
    return {"key": key, "name": name, "desc": desc, "policies": out}


ATOMS = [
    A("core-self-profile", "Own profile " + DASH + " read",
      "The person's own record and pupil row.", "self",
      ["core.persons.read", "core.students.read"]),
    A("core-self-enrolment", "Own enrolment " + DASH + " read",
      "Which section and subjects the person is enrolled in.", "self",
      ["core.enrollments.read", "core.subject_enrollments.read"]),
    A("core-self-documents", "Own documents " + DASH + " read",
      "The person's own certificates and uploaded documents.", "self",
      ["core.student_documents.read"]),
    A("core-self-addresses", "Own addresses " + DASH + " read",
      "The person's own addresses.", "self", ["core.student_addresses.read"]),
    A("core-self-profile-edit", "Own profile " + DASH + " edit",
      "Change one's own contact details.", "self", ["core.persons.write"]),

    A("core-dir-pupils", "Pupil directory " + DASH + " names only",
      "Every pupil in the school, names only. There is no classmate reach, so peer "
      "visibility is school-wide with the fields cut back instead.", "tenant",
      ["core.persons.read_all"], {"mode": "include", "keys": NAMES}),
    A("core-dir-pupil-codes", "Pupil directory " + DASH + " codes",
      "Pupil codes and status for the directory listing.", "tenant",
      ["core.students.read_all"], {"mode": "include", "keys": ["student_code", "status"]}),
    A("core-dir-staff", "Staff directory " + DASH + " names only",
      "Every teacher and staff member, role and status only.", "tenant",
      [("core.teachers.read_all", {"mode": "include", "keys": ["teacher_code", "status"]}),
       ("core.staff.read_all", {"mode": "include", "keys": ["designation", "status"]})]),

    A("core-ward-profile", "Ward profile " + DASH + " read",
      "The children linked to this guardian.", "guardian_ward",
      ["core.persons.read", "core.students.read"]),
    A("core-ward-enrolment", "Ward enrolment " + DASH + " read",
      "Where the guardian's children are enrolled.", "guardian_ward",
      ["core.enrollments.read", "core.subject_enrollments.read"]),
    A("core-ward-documents", "Ward documents " + DASH + " read",
      "Documents and addresses belonging to the guardian's children.", "guardian_ward",
      ["core.student_documents.read", "core.student_addresses.read"]),
    A("core-ward-notes", "Ward notes " + DASH + " read",
      "Notes teachers have written about the guardian's children.", "guardian_ward",
      ["core.student_notes.read"]),

    A("core-taught-profile", "Taught pupils " + DASH + " profile",
      "Full record of the pupils this teacher is assigned to.", "teacher_assignment",
      ["core.persons.read", "core.students.read"]),
    A("core-taught-identity", "Taught pupils " + DASH + " identity only",
      "Names of taught pupils and nothing more. For subject teachers.",
      "teacher_assignment", ["core.persons.read"], {"mode": "include", "keys": NAMES}),
    A("core-taught-enrolment", "Taught pupils " + DASH + " enrolment",
      "Section and subject enrolment of taught pupils.", "teacher_assignment",
      ["core.enrollments.read", "core.subject_enrollments.read"]),
    A("core-taught-notes-read", "Taught pupils " + DASH + " read notes",
      "Read notes about taught pupils.", "teacher_assignment", ["core.student_notes.read"]),
    A("core-taught-notes-write", "Taught pupils " + DASH + " write notes",
      "Write notes about taught pupils.", "teacher_assignment", ["core.student_notes.write"]),
    A("core-taught-contact", "Taught pupils " + DASH + " contact details",
      "Addresses of taught pupils. Class teachers, not subject teachers.",
      "teacher_assignment", ["core.student_addresses.read"]),
    A("core-own-assignments", "Own teaching assignments",
      "Which sections and subjects this teacher is assigned to.", "teacher_assignment",
      ["core.teacher_assignments.read"]),

    A("core-all-pupils-read", "All pupils " + DASH + " read",
      "Every pupil in the school, unnarrowed.", "tenant",
      ["core.students.read", "core.students.read_all",
       "core.persons.read", "core.persons.read_all",
       "core.enrollments.read", "core.enrollments.read_all"]),
    A("core-all-pupils-edit", "All pupils " + DASH + " edit",
      "Edit any pupil in the school. Does not follow from school-wide read.", "tenant",
      ["core.students.write", "core.students.write_all",
       "core.persons.write", "core.persons.write_all"]),
    A("core-all-staff-read", "All staff " + DASH + " read",
      "Every staff member and teacher, unnarrowed.", "tenant",
      ["core.staff.read", "core.staff.read_all",
       "core.teachers.read", "core.teachers.read_all"]),
    A("core-all-staff-edit", "All staff " + DASH + " edit",
      "Edit any staff member or teacher.", "tenant",
      ["core.staff.write", "core.staff.write_all",
       "core.teachers.write", "core.teachers.write_all"]),
    A("core-guardians-read", "All guardians " + DASH + " read",
      "Every guardian in the school.", "tenant",
      ["core.guardians.read", "core.guardians.read_all"]),
    A("core-guardians-edit", "All guardians " + DASH + " edit",
      "Edit any guardian.", "tenant",
      ["core.guardians.write", "core.guardians.write_all"]),
    A("core-enrolments-manage", "Enrolments " + DASH + " manage",
      "Move pupils between sections and subjects.", "tenant",
      ["core.enrollments.write", "core.enrollments.write_all",
       "core.subject_enrollments.write", "core.subject_enrollments.write_all"]),
    A("core-assignments-manage", "Teaching assignments " + DASH + " manage",
      "Assign teachers to sections and subjects.", "tenant",
      ["core.teacher_assignments.read", "core.teacher_assignments.read_all",
       "core.teacher_assignments.write", "core.teacher_assignments.write_all"]),
    A("core-notes-all", "Notes " + DASH + " all pupils",
      "Read and write notes about any pupil.", "tenant",
      ["core.student_notes.read", "core.student_notes.read_all",
       "core.student_notes.write", "core.student_notes.write_all"]),
    A("core-documents-all", "Documents " + DASH + " all pupils",
      "Read and write documents for any pupil.", "tenant",
      ["core.student_documents.read", "core.student_documents.read_all",
       "core.student_documents.write", "core.student_documents.write_all"]),
    A("core-admissions-add", "Admissions " + DASH + " add people",
      "Bring new pupils, teachers and guardians into the school.", "tenant",
      ["core.students.create", "core.teachers.create", "core.guardians.create",
       "core.persons.write", "core.staff.write"]),
    A("core-config-read", "Configuration " + DASH + " read",
      "Sections, sessions, subject offerings and reference data.", "tenant",
      ["core.sections.read", "core.academic_sessions.read",
       "core.subject_offerings.read", "core.reference.read"]),
    A("core-config-manage", "Configuration " + DASH + " manage",
      "Change the school's sections, sessions and subject offerings.", "tenant",
      ["core.sections.write", "core.academic_sessions.write",
       "core.subject_offerings.write", "core.reference.write"]),
    A("core-removals", "Removals " + DASH + " pupils and enrolments",
      "Delete pupil records and enrolments. Deliberately separate from editing.", "tenant",
      ["core.students.delete", "core.students.delete_all",
       "core.enrollments.delete", "core.enrollments.delete_all"]),
]

BUNDLES = [
    {"key": "bundle-student", "name": "Student", "children": [],
     "desc": "A pupil: their own record, and their classmates by name only.",
     "rules": ["Own profile " + DASH + " read", "Own enrolment " + DASH + " read",
               "Own documents " + DASH + " read", "Own addresses " + DASH + " read",
               "Own profile " + DASH + " edit",
               "Pupil directory " + DASH + " names only"]},

    {"key": "bundle-guardian", "name": "Guardian", "children": [],
     "desc": "A parent or guardian: everything about their own children, nothing about others.",
     "rules": ["Own profile " + DASH + " read", "Own profile " + DASH + " edit",
               "Ward profile " + DASH + " read", "Ward enrolment " + DASH + " read",
               "Ward documents " + DASH + " read", "Ward notes " + DASH + " read"]},

    {"key": "bundle-staff-base", "name": "Staff (base)", "children": [],
     "desc": "The floor every employee stands on. Nested inside the other staff bundles.",
     "rules": ["Own profile " + DASH + " read", "Own profile " + DASH + " edit",
               "Configuration " + DASH + " read",
               "Staff directory " + DASH + " names only"]},

    {"key": "bundle-teacher-subject", "name": "Subject teacher",
     "children": ["Staff (base)"],
     "desc": "Teaches a subject to sections they do not own. Identity of pupils, not their file.",
     "rules": ["Taught pupils " + DASH + " identity only",
               "Taught pupils " + DASH + " enrolment", "Own teaching assignments",
               "Taught pupils " + DASH + " read notes"]},

    {"key": "bundle-teacher-class", "name": "Class teacher",
     "children": ["Staff (base)"],
     "desc": "Owns a section. Full record of their pupils, contact details and notes.",
     "rules": ["Taught pupils " + DASH + " profile", "Taught pupils " + DASH + " enrolment",
               "Taught pupils " + DASH + " contact details",
               "Taught pupils " + DASH + " read notes",
               "Taught pupils " + DASH + " write notes", "Own teaching assignments",
               "Pupil directory " + DASH + " names only"]},

    {"key": "bundle-office", "name": "Office / admissions",
     "children": ["Staff (base)"],
     "desc": "Runs admissions and enrolment. Adds people; does not teach.",
     "rules": ["All pupils " + DASH + " read", "All guardians " + DASH + " read",
               "Admissions " + DASH + " add people", "Enrolments " + DASH + " manage",
               "Documents " + DASH + " all pupils"]},

    {"key": "bundle-principal", "name": "Principal",
     "children": ["Class teacher", "Office / admissions"],
     "desc": "Everything a class teacher and the office can do, plus school-wide edit, "
             "staffing and configuration. A bundle of bundles.",
     "rules": ["All pupils " + DASH + " edit", "All staff " + DASH + " read",
               "All staff " + DASH + " edit", "All guardians " + DASH + " edit",
               "Notes " + DASH + " all pupils", "Teaching assignments " + DASH + " manage",
               "Configuration " + DASH + " manage",
               "Removals " + DASH + " pupils and enrolments"]},
]

missing = sorted({e for a in ATOMS for e, _, _ in a["policies"] if e not in ENT})
if missing:
    print("entities CAS does not have:", *missing, sep="\n  ")
    sys.exit(1)

atom_names = {a["name"] for a in ATOMS}
bundle_names = {b["name"] for b in BUNDLES}
for b in BUNDLES:
    for r in b["rules"]:
        if r not in atom_names:
            print("bundle %s references unknown rule %r" % (b["name"], r))
            sys.exit(1)
    for c in b["children"]:
        if c not in bundle_names:
            print("bundle %s references unknown bundle %r" % (b["name"], c))
            sys.exit(1)

print("%d atoms, %d bundles, %d policies\n" % (
    len(ATOMS), len(BUNDLES), sum(len(a["policies"]) for a in ATOMS)))

if not APPLY:
    for a in ATOMS:
        print("  atom    %-44s %d" % (a["name"], len(a["policies"])))
    for b in BUNDLES:
        print("  bundle  %-44s %d rules, %d nested" % (
            b["name"], len(b["rules"]), len(b["children"])))
    print("\ndry run. re-run with --apply to write to", BASE)
    sys.exit(0)

for path in (ATOMS_SECTION, BUNDLE_SECTION):
    call("POST", "/v1/admin/rules/sections", {"path": path})

_, existing = call("GET", "/v1/admin/rules")
rule_id = {r["name"]: r["id"] for r in (existing or []) if isinstance(r, dict)}

for a in ATOMS:
    rid = rule_id.get(a["name"])
    if not rid:
        code, out = call("POST", "/v1/admin/rules", {
            "key": a["key"], "name": a["name"], "description": a["desc"],
            "section": ATOMS_SECTION})
        if code >= 300:
            print("atom    %-44s FAILED %s %s" % (a["name"], code, out))
            continue
        rid = out["id"]
        rule_id[a["name"]] = rid
    policies = []
    for e, reach, fields in a["policies"]:
        children = [{"field": "reach", "operator": "=", "values": [reach]}] if has_reach(e) else []
        entry = {"entity_id": ENT[e], "cacheable": False,
                 "expression": {"op": "AND", "children": children}}
        if fields:
            entry["fields"] = fields
        policies.append(entry)
    code, out = call("PUT", "/v1/admin/rules/%s/policies" % rid, {"policies": policies})
    print("atom    %-44s %s" % (a["name"], "ok" if code < 300 else (code, out)))

_, groups = call("GET", "/v1/admin/rule-groups")
group_id = {g["name"]: g["id"] for g in (groups or []) if isinstance(g, dict)}

for b in BUNDLES:
    gid = group_id.get(b["name"])
    if not gid:
        code, out = call("POST", "/v1/admin/rule-groups", {
            "key": b["key"], "name": b["name"], "description": b["desc"],
            "section": BUNDLE_SECTION})
        if code >= 300:
            print("bundle  %-44s FAILED %s %s" % (b["name"], code, out))
            continue
        gid = out["id"]
        group_id[b["name"]] = gid
    added, absent = 0, []
    for r in b["rules"]:
        if r not in rule_id:
            absent.append(r)
            continue
        code, _ = call("POST", "/v1/admin/rule-groups/%s/rules/%s" % (gid, rule_id[r]))
        added += code < 300
    if absent:
        print("        rules that were never created:", absent)
    print("bundle  %-44s %d/%d rules" % (b["name"], added, len(b["rules"])))

for b in BUNDLES:
    for c in b["children"]:
        code, out = call("POST", "/v1/admin/rule-groups/%s/children/%s" % (
            group_id[b["name"]], group_id[c]))
        print("nest    %-26s <- %-26s %s" % (b["name"], c, "ok" if code < 300 else (code, out)))
