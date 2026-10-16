import json, os, sys, urllib.request, urllib.error

BASE = os.environ.get("CAS_BASE_URL", "https://auth.tryemerge.in")
SP = os.path.expanduser("~/.emerge-scratch")
TOKEN = open(os.path.join(SP, "tok")).read().strip()
SECTION = "Emerge Core/Roles"
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

def reach(value):
    return {"op": "AND", "children": [
        {"field": "reach", "operator": "=", "values": [value]}]}

def inc(*keys):
    return {"mode": "include", "keys": list(keys)}

PUPIL_VIEW = ["core.students.read", "core.persons.read", "core.enrollments.read",
              "core.subject_enrollments.read", "core.student_documents.read",
              "core.student_addresses.read"]

ROLES = [
    {"key": "core-student-self", "name": "Student \u2014 own record",
     "desc": "What a pupil may see about themselves. Reach is self, so it never widens.",
     "policies": [(e, reach("self"), None) for e in PUPIL_VIEW]},

    {"key": "core-guardian-ward", "name": "Guardian \u2014 wards",
     "desc": "What a guardian may see about the children linked to them.",
     "policies": [(e, reach("guardian_ward"), None) for e in PUPIL_VIEW]},

    {"key": "core-teacher-class", "name": "Teacher \u2014 class teacher",
     "desc": "Full pupil record for the sections this teacher is assigned to, plus notes.",
     "policies": [
        ("core.students.read", reach("teacher_assignment"), None),
        ("core.persons.read", reach("teacher_assignment"), None),
        ("core.enrollments.read", reach("teacher_assignment"), None),
        ("core.subject_enrollments.read", reach("teacher_assignment"), None),
        ("core.student_notes.read", reach("teacher_assignment"), None),
        ("core.student_notes.write", reach("teacher_assignment"), None),
        ("core.teacher_assignments.read", reach("teacher_assignment"), None),
     ]},

    {"key": "core-teacher-subject", "name": "Teacher \u2014 subject teacher",
     "desc": "Narrower than the class teacher: the pupils they teach, identifying fields only.",
     "policies": [
        ("core.students.read", reach("teacher_assignment"), inc("student_code", "status")),
        ("core.persons.read", reach("teacher_assignment"),
         inc("first_name", "last_name", "display_name")),
        ("core.subject_enrollments.read", reach("teacher_assignment"), None),
        ("core.teacher_assignments.read", reach("teacher_assignment"), None),
     ]},

    {"key": "core-school-admin", "name": "School administrator",
     "desc": "School-wide read and edit. Reach is tenant, so a grant is bounded by its scope.",
     "policies": [
        ("core.students.read_all", reach("tenant"), None),
        ("core.students.write_all", reach("tenant"), None),
        ("core.persons.read_all", reach("tenant"), None),
        ("core.persons.write_all", reach("tenant"), None),
        ("core.enrollments.read_all", reach("tenant"), None),
        ("core.enrollments.write_all", reach("tenant"), None),
        ("core.teachers.read_all", reach("tenant"), None),
        ("core.staff.read_all", reach("tenant"), None),
        ("core.guardians.read_all", reach("tenant"), None),
        ("core.sections.read", reach("tenant"), None),
        ("core.academic_sessions.read", reach("tenant"), None),
        ("core.subject_offerings.read", reach("tenant"), None),
        ("core.teacher_assignments.read_all", reach("tenant"), None),
     ]},

    {"key": "core-admissions", "name": "Admissions office",
     "desc": "Brings new people into the school. Creation only, separate from editing.",
     "policies": [
        ("core.students.create", reach("tenant"), None),
        ("core.teachers.create", reach("tenant"), None),
        ("core.guardians.create", reach("tenant"), None),
        ("core.staff.write", reach("tenant"), None),
        ("core.persons.write", reach("tenant"), None),
        ("core.enrollments.write", reach("tenant"), None),
     ]},
]

SUPPORTS_REACH = {}

def declares_reach(key):
    if key not in SUPPORTS_REACH:
        code, d = call("GET", "/v1/admin/entities/" + ENT[key])
        fields = (d or {}).get("fields") or []
        SUPPORTS_REACH[key] = any(f.get("key") == "reach" for f in fields)
    return SUPPORTS_REACH[key]

missing = sorted({e for r in ROLES for e, _, _ in r["policies"] if e not in ENT})
if missing:
    print("entities CAS does not have:")
    for m in missing:
        print("  ", m)
    sys.exit(1)

status, existing = call("GET", "/v1/admin/rules")
by_name = {r["name"]: r["id"] for r in (existing or []) if isinstance(r, dict)}

for role in ROLES:
    rid = by_name.get(role["name"])
    action = "exists" if rid else "create"
    print("%-8s %-34s %2d policies" % (action, role["name"], len(role["policies"])))
    if not APPLY:
        continue

    if not rid:
        code, out = call("POST", "/v1/admin/rules", {
            "key": role["key"], "name": role["name"],
            "description": role["desc"], "section": SECTION})
        if code >= 300:
            print("   FAILED:", code, out)
            continue
        rid = out["id"]

    policies = []
    for e, expr, f in role["policies"]:
        if expr is not None and not declares_reach(e):
            expr = {"op": "AND", "children": []}
        entry = {"entity_id": ENT[e], "expression": expr, "cacheable": False}
        if f:
            entry["fields"] = f
        policies.append(entry)
    code, out = call("PUT", "/v1/admin/rules/%s/policies" % rid, {"policies": policies})
    print("   policies ->", code if code >= 300 else "ok", out if code >= 300 else "")

if not APPLY:
    print("\ndry run. re-run with --apply to write to", BASE)
