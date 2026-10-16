import json, os, sys, urllib.request, urllib.error

BASE = os.environ.get("CAS_BASE_URL", "https://auth.tryemerge.in")
SCRATCH = os.path.expanduser("~/.emerge-scratch")
SERVICE = os.environ.get("CAS_SERVICE", "Emerge Core")
SECTION = os.environ.get("CAS_SECTION", "Emerge Core/Atoms")
RULE_KEY = os.environ.get("RULE_KEY", "core-timetable-manage")
RULE_NAME = os.environ.get("RULE_NAME", "Timetable and attendance - manage")
BUNDLES = [b.strip() for b in os.environ.get("BUNDLES", "Principal").split(",") if b.strip()]
REACH = os.environ.get("REACH", "tenant")
PREFIXES = tuple(os.environ.get(
    "PREFIXES", "core.timetable,core.attendance,core.rooms,core.calendar").split(","))
APPLY = "--apply" in sys.argv

TOKEN = os.environ.get("CAS_TOKEN", "").strip() or open(os.path.join(SCRATCH, "tok")).read().strip()


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


def service_id():
    _, body = call("GET", "/v1/admin/services?limit=200")
    for s in body or []:
        if SERVICE in (s.get("slug"), s.get("key"), s.get("name")):
            return s["id"]
    sys.exit("no service matched %r" % SERVICE)


def main():
    sid = service_id()
    _, ents = call("GET", "/v1/admin/entities?service_id=%s&limit=1000" % sid)
    skip = tuple(s for s in os.environ.get("EXCLUDE_SUFFIXES", "").split(",") if s)
    targets = [e for e in ents or []
               if e["key"].startswith(PREFIXES) and e["kind"] == "action"
               and not (skip and e["key"].endswith(skip))]
    if not targets:
        sys.exit("no entities matched %s" % (PREFIXES,))

    policies = []
    for e in sorted(targets, key=lambda x: x["key"]):
        _, detail = call("GET", "/v1/admin/entities/" + e["id"])
        keys = {f.get("key") for f in ((detail or {}).get("fields") or [])}
        children = []
        if "reach" in keys:
            children.append({"field": "reach", "operator": "=", "values": [REACH]})
        policies.append({"entity_id": e["id"], "cacheable": False,
                         "expression": {"op": "AND", "children": children}})

    print("rule    %s" % RULE_NAME)
    print("targets %d entities, reach=%s" % (len(policies), REACH))
    for e in sorted(targets, key=lambda x: x["key"])[:4]:
        print("   %s" % e["key"])
    print("   ... and %d more" % max(0, len(targets) - 4))
    print("bundles %s" % ", ".join(BUNDLES))

    if not APPLY:
        print("")
        print("dry run. re-run with --apply.")
        return

    call("POST", "/v1/admin/rules/sections", {"path": SECTION})
    _, existing = call("GET", "/v1/admin/rules?limit=500")
    rid = next((r["id"] for r in existing or [] if r.get("name") == RULE_NAME), None)
    if not rid:
        status, body = call("POST", "/v1/admin/rules", {
            "key": RULE_KEY, "name": RULE_NAME,
            "description": "Read and manage timetables, attendance, rooms and the school calendar.",
            "section": SECTION})
        if status >= 300:
            sys.exit("creating rule failed: %s %s" % (status, body))
        rid = body["id"]
        print("created rule %s" % rid)

    status, body = call("PUT", "/v1/admin/rules/%s/policies" % rid, {"policies": policies})
    if status >= 300:
        sys.exit("setting policies failed: %s %s" % (status, body))
    print("policies set: %d" % len(policies))

    _, groups = call("GET", "/v1/admin/rule-groups?limit=200")
    for name in BUNDLES:
        gid = next((g["id"] for g in groups or [] if g.get("name") == name), None)
        if not gid:
            print("  bundle %r NOT FOUND" % name)
            continue
        status, _ = call("POST", "/v1/admin/rule-groups/%s/rules/%s" % (gid, rid))
        print("  bundle %-24s %s" % (name, "added" if status < 300 else "already present"))


main()
