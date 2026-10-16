import json, os, sys, urllib.request, urllib.error

BASE = os.environ.get("CAS_BASE_URL", "https://auth.tryemerge.in")
SCRATCH = os.path.expanduser("~/.emerge-scratch")
SERVICE = os.environ.get("CAS_SERVICE", "Emerge Core")
CATALOG = os.environ.get("CATALOG_JSON", os.path.join(SCRATCH, "catalog.json"))
ONLY = os.environ.get("ONLY_PREFIX", "")
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
    status, body = call("GET", "/v1/admin/services?limit=200")
    if status != 200:
        sys.exit("listing services failed: %s %s" % (status, body))
    for s in body or []:
        if SERVICE in (s.get("slug"), s.get("key"), s.get("name")):
            return s["id"]
    sys.exit("no service matched %r" % SERVICE)


def main():
    cat = json.load(open(CATALOG))
    ents = cat.get("entities") or cat.get("Entities") or []
    want = {}
    for e in ents:
        key = e.get("key") or e.get("Key")
        if ONLY and not key.startswith(tuple(ONLY.split(","))):
            continue
        fields = e.get("fields") or e.get("Fields") or []
        out = []
        for i, f in enumerate(fields):
            out.append({
                "key": f.get("key"),
                "name": f.get("name") or f.get("key"),
                "description": f.get("description") or "",
                "data_type": f.get("data_type") or "string",
                "enum_values": f.get("enum_values") or [],
                "operators": f.get("operators") or [],
                "conditionable": bool(f.get("operators")),
                "sort_order": i,
            })
        want[key] = out

    sid = service_id()
    status, body = call("GET", "/v1/admin/entities?service_id=%s&limit=1000" % sid)
    if status != 200:
        sys.exit("listing entities failed: %s %s" % (status, body))
    have = {e["key"]: e for e in body or []}

    todo = []
    for key, fields in sorted(want.items()):
        ent = have.get(key)
        if not ent:
            print("  MISSING IN CAS %s" % key)
            continue
        todo.append((key, ent["id"], fields))

    print("entities to sync: %d" % len(todo))
    for key, _id, fields in todo[:5]:
        print("   %-34s %d fields" % (key, len(fields)))
    if len(todo) > 5:
        print("   ... and %d more" % (len(todo) - 5))

    if not APPLY:
        print("")
        print("dry run. re-run with --apply.")
        return

    ok = bad = 0
    for key, eid, fields in todo:
        status, body = call("PUT", "/v1/admin/entities/%s/fields" % eid, {"fields": fields})
        if status >= 300:
            bad += 1
            print("  FAILED %-34s %s %s" % (key, status, body))
        else:
            ok += 1
    print("")
    print("synced %d, failed %d" % (ok, bad))


main()
