import json
import os
import sys
import urllib.error
import urllib.request

BASE = os.environ.get("CAS_BASE_URL", "https://auth.tryemerge.in")
SERVICE = os.environ.get("CAS_SERVICE", "Emerge Core")
APPLY = "--apply" in sys.argv

TOKEN = os.environ.get("CAS_TOKEN", "").strip()
if not TOKEN:
    sys.exit("no token: set CAS_TOKEN")


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
        return e.code, e.read().decode()[:400]


def field(key, name, description, data_type="string", enum_values=None,
          operators=("=", "IN"), sort_order=0):
    return {
        "key": key,
        "name": name,
        "description": description,
        "data_type": data_type,
        "enum_values": list(enum_values or []),
        "operators": list(operators),
        "conditionable": True,
        "sort_order": sort_order,
    }


REACH = field("reach", "Reach",
              "How wide this grant reaches before the service narrows rows.",
              enum_values=["tenant", "self", "guardian_ward", "teacher_assignment"],
              operators=("=",), sort_order=0)
GRADE = field("grade_level", "Grade level", "Pins the grant to named grade levels.", sort_order=1)
SECTION = field("section", "Section", "Pins the grant to named class sections.", sort_order=2)
SUBJECT = field("subject", "Subject",
                "Pins the grant to named subjects, so a teacher of one subject does not "
                "reach another subject's material for the same class.", sort_order=3)

ANSWER_DATA = field("answer_data_json", "Answer data",
                    "The worked answer a question version carries. Withhold it from anyone "
                    "who may read a question but must not read its answer.",
                    operators=(), sort_order=10)
ANSWER_DATA["conditionable"] = False

AREAS = {
    "core.question_bank": ["create", "read", "read_all", "write", "write_all",
                           "delete", "delete_all"],
    "core.blueprints": ["create", "read", "read_all", "write", "write_all",
                        "delete", "delete_all"],
    "core.papers": ["create", "read", "read_all", "write", "write_all",
                    "delete", "delete_all"],
    "core.paper_generation": ["create", "read", "read_all", "write", "write_all"],
}

ROW_SCOPED = {"core.papers", "core.question_bank", "core.blueprints"}
CARRIES_ANSWERS = {"core.question_bank"}


def fields_for(area):
    out = [REACH]
    if area in ROW_SCOPED:
        out += [GRADE, SECTION, SUBJECT]
    if area in CARRIES_ANSWERS:
        out.append(ANSWER_DATA)
    return out


def service_id():
    status, body = call("GET", "/v1/admin/services?limit=200")
    if status != 200:
        sys.exit("listing services failed: %s %s" % (status, body))
    for s in body or []:
        if SERVICE in (s.get("key"), s.get("slug"), s.get("name")):
            return s["id"]
    sys.exit("no service matched %r" % SERVICE)


def main():
    sid = service_id()
    status, body = call("GET", "/v1/admin/entities?service_id=%s&limit=1000" % sid)
    if status != 200:
        sys.exit("listing entities failed: %s %s" % (status, body))
    have = {e["key"]: e["id"] for e in (body or [])}

    targets = []
    for area, verbs in AREAS.items():
        for key in [area] + [area + "." + v for v in verbs]:
            if key in have:
                targets.append((key, area))

    missing = [area + "." + v for area, verbs in AREAS.items() for v in verbs
               if area + "." + v not in have]
    if missing:
        sys.exit("these entities are not registered:\n  " + "\n  ".join(missing))

    print("service %s" % sid)
    for area in sorted(AREAS):
        names = ", ".join(f["key"] for f in fields_for(area))
        print("  %-24s %d entities  fields: %s"
              % (area, 1 + len(AREAS[area]), names))

    if not APPLY:
        print("")
        print("DRY RUN. Nothing was written. Re-run with --apply.")
        return

    for key, area in targets:
        status, out = call("PUT", "/v1/admin/entities/%s/fields" % have[key],
                           {"fields": fields_for(area)})
        if status not in (200, 201):
            sys.exit("setting fields on %s failed: %s %s" % (key, status, out))
    print("")
    print("declared fields on %d entities." % len(targets))


main()
