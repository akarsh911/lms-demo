import json, os, re, sys, urllib.request, urllib.error

BASE = os.environ.get("CAS_BASE_URL", "https://auth.tryemerge.in")
SP = os.path.expanduser("~/.emerge-scratch")
TOKEN = open(os.path.join(SP, "tok")).read().strip()
TENANT = os.environ.get("CAS_TENANT", "cms")
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


TENANT_BOUND = {"op": "AND", "children": [
    {"field": "tenant", "operator": "=", "values": [TENANT]}]}

ASSIGN = [
    (re.compile(r"^teacher\d+$"),  [("rule_group", "Class teacher", None)]),
    (re.compile(r"^pupil\d+$"),    [("rule_group", "Student", None)]),
    (re.compile(r"^guardian\d+$"), [("rule_group", "Guardian", None)]),
    (re.compile(r"^superadmin$"),  [("rule_group", "Principal", None),
                                    ("rule", "CAS — school administrator", TENANT_BOUND)]),
]

_, groups = call("GET", "/v1/admin/groups")
root = next((g for g in (groups or []) if g.get("tenant_id") == TENANT), None)
if not root:
    print("no group carries tenant", TENANT)
    sys.exit(1)
print("scope: %s (%s) tenant=%s\n" % (root.get("key") or root["name"], root["id"], TENANT))

_, rules = call("GET", "/v1/admin/rules")
_, bundles = call("GET", "/v1/admin/rule-groups")
OBJ = {
    "rule": {r["name"]: r["id"] for r in (rules or []) if isinstance(r, dict)},
    "rule_group": {g["name"]: g["id"] for g in (bundles or []) if isinstance(g, dict)},
}

_, users = call("GET", "/v1/admin/users?limit=500")
_, held = call("GET", "/v1/admin/permissions?limit=1000")
have = {(p.get("subject_id"), p.get("object_id"), p.get("scope_id")) for p in (held or [])}

planned = granted = skipped = 0
for u in sorted(users or [], key=lambda x: x.get("username") or ""):
    name = u.get("username") or ""
    grants = next((g for pat, g in ASSIGN if pat.match(name)), None)
    if not grants:
        continue
    for kind, obj_name, bound in grants:
        oid = OBJ[kind].get(obj_name)
        if not oid:
            print("  %-14s %-30s MISSING (%s)" % (name, obj_name, kind))
            continue
        if (u["id"], oid, root["id"]) in have:
            skipped += 1
            continue
        planned += 1
        print("  %-14s %-30s %-11s %s" % (
            name, obj_name, kind, "tenant=" + TENANT if bound else "scope only"))
        if not APPLY:
            continue
        payload = {"subject_type": "user", "subject_id": u["id"],
                   "object_type": kind, "object_id": oid,
                   "scope_id": root["id"],
                   "reason": "seeded role for tenant " + TENANT}
        if bound:
            payload["constraints"] = bound
        code, out = call("POST", "/v1/admin/permissions", payload)
        if code >= 300:
            print("      FAILED", code, out)
        else:
            granted += 1

print("\nto grant %d, already held %d, granted %d" % (planned, skipped, granted))
if not APPLY:
    print("dry run. re-run with --apply")
