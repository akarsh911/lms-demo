import json
import os
import sys
import urllib.error
import urllib.request

BASE = os.environ.get("CAS_BASE_URL", "https://auth.tryemerge.in")
SCRATCH = os.path.expanduser("~/.emerge-scratch")
SERVICE = os.environ.get("CAS_SERVICE", "Emerge Core")
ATOMS_SECTION = "Emerge Core/Atoms"
BUNDLE_SECTION = "Emerge Core/Bundles"
APPLY = "--apply" in sys.argv


def read_token():
    raw = os.environ.get("CAS_TOKEN", "").strip()
    if raw:
        return raw
    path = os.path.join(SCRATCH, "tok")
    if not os.path.exists(path):
        sys.exit("no token: set CAS_TOKEN, or place one in " + path)
    return open(path).read().strip()


TOKEN = read_token()


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


REACH_VALUES = ["tenant", "self", "guardian_ward", "teacher_assignment"]
ROW_FIELDS = ["grade_level", "section", "subject"]
ROW_OPERATORS = ("=", "IN")
SERVER_OWNED = ("id", "created_at", "updated_at")

MASTERY_COLUMNS = [
    "id", "created_at", "updated_at", "student_id", "academic_session_id",
    "content_item_id", "engine_section_id", "node_id", "state", "score",
    "attempts", "last_attempt_at", "structure_digest", "structure_chunks",
]

AREAS = {
    "core.mindmaps": {
        "verbs": ["read"],
        "narrowable": False,
        "columns": [],
    },
    "core.concept_mastery": {
        "verbs": ["read", "read_all", "write"],
        "narrowable": True,
        "columns": MASTERY_COLUMNS,
    },
}


def label(segment):
    words = segment.split("_")
    if words and words[0]:
        words[0] = words[0][:1].upper() + words[0][1:]
    return " ".join(words)


def field(key, name, data_type="string", enum_values=(), operators=(), sort_order=0):
    return {
        "key": key,
        "name": name,
        "description": "",
        "data_type": data_type,
        "enum_values": list(enum_values),
        "operators": list(operators),
        "conditionable": bool(operators),
        "sort_order": sort_order,
    }


def scope_fields():
    out = [field("reach", label("reach"), "enum", REACH_VALUES, ("=",))]
    out += [field(f, label(f), "string", (), ROW_OPERATORS) for f in ROW_FIELDS]
    return out


def column_fields(columns):
    return [field(c, label(c)) for c in columns if c not in SERVER_OWNED]


def fields_for(area, verb):
    spec = AREAS[area]
    out = []
    if spec["narrowable"] and verb != "create":
        out += scope_fields()
    if verb not in ("delete", "delete_all"):
        out += column_fields(spec["columns"])
    for i, f in enumerate(out):
        f["sort_order"] = i
    return out


def declares_reach(area, verb):
    return any(f["key"] == "reach" for f in fields_for(area, verb))


DASH = "—"


def A(key, name, desc, reach, entities):
    return {"key": key, "name": name, "desc": desc, "reach": reach,
            "entities": entities}


SOURCES = ["core.library.read", "core.curriculum.read",
           "core.content_placements.read"]

SOURCES_WIDE = SOURCES + ["core.library.read_all", "core.curriculum.read_all",
                          "core.content_placements.read_all"]

ATOMS = [
    A("core-mindmap-read", "Mind maps " + DASH + " draw them",
      "Switches mind maps on for this holder. Necessary and not sufficient: every route "
      "loads the book under the caller's own library grant, so this reaches no book on "
      "its own. The key carries no fields and is asked as a plain capability probe.",
      None, ["core.mindmaps.read"]),

    A("core-mindmap-sources-self", "Mind map sources " + DASH + " own books",
      "The library items, curricula and placements a pupil's own enrolment reaches. "
      "A holder of the mind-map key without these is refused by every route, so these "
      "travel together.",
      "self", SOURCES),

    A("core-mindmap-sources-ward", "Mind map sources " + DASH + " ward books",
      "The same three, reaching the books and curricula of this guardian's children.",
      "guardian_ward", SOURCES),

    A("core-mindmap-sources-taught", "Mind map sources " + DASH + " taught books",
      "The same three, reaching the books and curricula of the sections and offerings "
      "this teacher is assigned to. Must be granted unpinned: a row pin on the library "
      "grant drops the school-wide shelf, which is where a school's textbooks usually sit.",
      "teacher_assignment", SOURCES),

    A("core-mindmap-sources-school", "Mind map sources " + DASH + " every book",
      "Every book, curriculum and placement in the school, unnarrowed. The breadth keys "
      "are only honoured when the grant carries no row pin.",
      "tenant", SOURCES_WIDE),

    A("core-mastery-self", "Own mastery " + DASH + " read and record",
      "A pupil's own concept mastery, and the power to record it. The write key does not "
      "decide whose row is written: the row is always filed under the caller's own pupil "
      "record, so a holder with no pupil record records nothing.",
      "self", ["core.concept_mastery.read", "core.concept_mastery.write"]),

    A("core-mastery-ward", "Ward mastery " + DASH + " read",
      "The concept mastery of this guardian's children. Read only; nobody records mastery "
      "on anyone else's behalf.",
      "guardian_ward", ["core.concept_mastery.read"]),

    A("core-mastery-taught", "Taught pupils " + DASH + " mastery",
      "The concept mastery of the pupils this teacher is assigned to. Read only.",
      "teacher_assignment", ["core.concept_mastery.read"]),

    A("core-mastery-school", "Mastery " + DASH + " every pupil",
      "Every pupil's concept mastery, unnarrowed. For a head or an academic coordinator.",
      "tenant", ["core.concept_mastery.read", "core.concept_mastery.read_all"]),
]

BUNDLES = {
    "Student": ["Mind maps " + DASH + " draw them",
                "Mind map sources " + DASH + " own books",
                "Own mastery " + DASH + " read and record"],
    "Guardian": ["Mind maps " + DASH + " draw them",
                 "Mind map sources " + DASH + " ward books",
                 "Ward mastery " + DASH + " read"],
    "Subject teacher": ["Mind maps " + DASH + " draw them",
                        "Mind map sources " + DASH + " taught books",
                        "Taught pupils " + DASH + " mastery"],
    "Class teacher": ["Mind maps " + DASH + " draw them",
                      "Mind map sources " + DASH + " taught books",
                      "Taught pupils " + DASH + " mastery"],
    "Principal": ["Mind maps " + DASH + " draw them",
                  "Mind map sources " + DASH + " every book",
                  "Mastery " + DASH + " every pupil"],
}


def check_tables():
    names = {a["name"] for a in ATOMS}
    if len(names) != len(ATOMS):
        sys.exit("two atoms share a name")
    for bundle, rules in BUNDLES.items():
        for r in rules:
            if r not in names:
                sys.exit("bundle %s references unknown atom %r" % (bundle, r))


def service_id():
    status, body = call("GET", "/v1/admin/services?limit=200")
    if status != 200:
        sys.exit("listing services failed: %s %s" % (status, body))
    for s in body or []:
        if SERVICE in (s.get("slug"), s.get("key"), s.get("name")):
            return s["id"]
    sys.exit("no service matched %r; saw %s" % (
        SERVICE, [s.get("slug") or s.get("name") for s in (body or [])]))


def existing_entities(sid):
    status, body = call("GET", "/v1/admin/entities?service_id=%s&limit=1000" % sid)
    if status != 200:
        sys.exit("listing entities failed: %s %s" % (status, body))
    return {e["key"]: e["id"] for e in (body or [])}


def create(sid, parent, segment, kind):
    payload = {"service_id": sid, "segment": segment, "kind": kind}
    if parent:
        payload["parent_id"] = parent
    status, body = call("POST", "/v1/admin/entities", payload)
    if status not in (200, 201):
        sys.exit("creating %s failed: %s %s" % (segment, status, body))
    return body["id"]


def wanted_keys():
    out = []
    for area in sorted(AREAS):
        for verb in AREAS[area]["verbs"]:
            out.append((area, verb, area + "." + verb))
    return out


def plan_entities(have):
    folders, actions = [], []
    for area, _verb, key in wanted_keys():
        if area not in have and area not in folders:
            folders.append(area)
        if key not in have:
            actions.append(key)
    return folders, actions


def register_entities(sid, have):
    folders, actions = plan_entities(have)

    print("entities")
    print("  folders missing (%d): %s" % (len(folders), ", ".join(folders) or "-"))
    print("  actions missing (%d): %s" % (len(actions), ", ".join(actions) or "-"))

    if not APPLY:
        return

    for folder in folders:
        have[folder] = create(sid, None, folder.split(".")[1], "folder")
        print("  created folder " + folder)
    for key in actions:
        parent = have[".".join(key.split(".")[:2])]
        have[key] = create(sid, parent, key.split(".")[2], "action")
        print("  created action " + key)


def field_targets():
    out = []
    for area in sorted(AREAS):
        for verb in AREAS[area]["verbs"]:
            out.append((area + "." + verb, fields_for(area, verb)))
    return out


def declare_fields(have):
    print("")
    print("fields, declared on the action entities")

    pending = []
    for key, fields in field_targets():
        if not fields:
            print("  %-32s fieldless by design, nothing to declare" % key)
            continue
        print("  %-32s %d fields: %s" % (
            key, len(fields), ", ".join(f["key"] for f in fields)))
        pending.append((key, fields))

    if not APPLY:
        return

    for key, fields in pending:
        if key not in have:
            sys.exit("cannot declare fields: %s is not registered" % key)
        status, body = call("PUT", "/v1/admin/entities/%s/fields" % have[key],
                            {"fields": fields})
        if status >= 300:
            sys.exit("declaring fields on %s failed: %s %s" % (key, status, body))
        print("  declared %s" % key)


REACH_CACHE = {}


def has_reach(key, have):
    for area in AREAS:
        if key.startswith(area + "."):
            return declares_reach(area, key.split(".")[2])
    if key not in REACH_CACHE:
        status, body = call("GET", "/v1/admin/entities/" + have[key])
        if status != 200:
            sys.exit("reading fields of %s failed: %s %s" % (key, status, body))
        REACH_CACHE[key] = any(
            f.get("key") == "reach" for f in ((body or {}).get("fields") or []))
    return REACH_CACHE[key]


def check_entities_present(have):
    planned = {key for _area, _verb, key in wanted_keys()}
    absent = sorted({e for a in ATOMS for e in a["entities"]
                     if e not in have and e not in planned})
    if absent:
        print("")
        print("these entities are in no plan and CAS does not have them:")
        for key in absent:
            print("  " + key)
        sys.exit("refusing to author rules that name an entity nobody can hold")


def policies_for(atom, have):
    out = []
    for key in atom["entities"]:
        children = []
        if atom["reach"] and has_reach(key, have):
            children.append({"field": "reach", "operator": "=",
                             "values": [atom["reach"]]})
        out.append({"entity_id": have[key], "cacheable": False,
                    "expression": {"op": "AND", "children": children}})
    return out


def author_rules(have):
    print("")
    print("rules and bundles")
    for a in ATOMS:
        pinned = a["reach"] or "no reach condition"
        print("  atom    %-42s %-18s %s" % (
            a["name"], pinned, ", ".join(a["entities"])))

    status, groups = call("GET", "/v1/admin/rule-groups")
    if status != 200:
        sys.exit("listing rule groups failed: %s %s" % (status, groups))
    group_id = {g["name"]: g["id"] for g in (groups or []) if isinstance(g, dict)}

    unknown = [b for b in BUNDLES if b not in group_id]
    if unknown:
        sys.exit("these bundles do not exist in CAS; run cas-core-roles.py first: "
                 + ", ".join(sorted(unknown)))

    for bundle in sorted(BUNDLES):
        print("  bundle  %-42s + %d rules" % (bundle, len(BUNDLES[bundle])))

    if not APPLY:
        return

    call("POST", "/v1/admin/rules/sections", {"path": ATOMS_SECTION})

    status, existing = call("GET", "/v1/admin/rules")
    if status != 200:
        sys.exit("listing rules failed: %s %s" % (status, existing))
    rule_id = {r["name"]: r["id"] for r in (existing or []) if isinstance(r, dict)}

    for a in ATOMS:
        rid = rule_id.get(a["name"])
        if not rid:
            code, out = call("POST", "/v1/admin/rules", {
                "key": a["key"], "name": a["name"], "description": a["desc"],
                "section": ATOMS_SECTION})
            if code >= 300:
                sys.exit("creating atom %s failed: %s %s" % (a["name"], code, out))
            rid = out["id"]
            rule_id[a["name"]] = rid
        code, out = call("PUT", "/v1/admin/rules/%s/policies" % rid,
                         {"policies": policies_for(a, have)})
        if code >= 300:
            sys.exit("setting policies on %s failed: %s %s" % (a["name"], code, out))
        print("  atom    %-42s ok" % a["name"])

    for bundle in sorted(BUNDLES):
        carried = 0
        for name in BUNDLES[bundle]:
            code, out = call("POST", "/v1/admin/rule-groups/%s/rules/%s" % (
                group_id[bundle], rule_id[name]))
            if code >= 300 and code != 409:
                print("  bundle  %-42s FAILED %s %s %s" % (bundle, name, code, out))
                continue
            carried += 1
        print("  bundle  %-42s %d/%d rules" % (bundle, carried, len(BUNDLES[bundle])))


def main():
    check_tables()
    sid = service_id()
    have = existing_entities(sid)
    print("service %s  existing entities %d  target %s" % (sid, len(have), BASE))
    print("")

    check_entities_present(have)
    register_entities(sid, have)
    declare_fields(have)
    author_rules(have)

    print("")
    if not APPLY:
        print("DRY RUN. Nothing was written. Re-run with --apply to write to " + BASE)
        return
    print("done. the feature key emerge.learning.mindmap is not granted here; "
          "cas-register-features.py registers it, granting it is a separate step.")


main()
