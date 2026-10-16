import json, os, sys, urllib.request, urllib.error

BASE = os.environ.get("CAS_BASE_URL", "https://auth.tryemerge.in")
SP = os.path.expanduser("~/.emerge-scratch")


def read_token():
    raw = os.environ.get("CAS_TOKEN", "").strip()
    if raw:
        return raw
    path = os.path.join(SP, "tok")
    if not os.path.exists(path):
        sys.exit("no token: set CAS_TOKEN, or place one in " + path)
    return open(path).read().strip()


TOKEN = read_token()
TENANT = os.environ.get("CAS_TENANT", "cms")
USERNAME = os.environ.get("ADMIN_USERNAME", "admin.dpsngp")
EMAIL = os.environ.get("ADMIN_EMAIL", "admin.dpsngp@dps-ngp.demo")
FULLNAME = os.environ.get("ADMIN_NAME", "DPS Nagpur Administrator")
PASSWORD = os.environ.get("ADMIN_PASSWORD", "Emerge#Demo2026")
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


_, groups = call("GET", "/v1/admin/groups")
root = next((g for g in (groups or []) if g.get("tenant_id") == TENANT), None)
if not root:
    print("no group carries tenant", TENANT)
    sys.exit(1)

_, rules = call("GET", "/v1/admin/rules")
_, bundles = call("GET", "/v1/admin/rule-groups")
OBJ = {"rule": {r["name"]: r["id"] for r in (rules or []) if isinstance(r, dict)},
       "rule_group": {g["name"]: g["id"] for g in (bundles or []) if isinstance(g, dict)}}

GRANTS = [
    ("rule_group", "Principal", None),
    ("rule", "CAS — school administrator",
     {"op": "AND", "children": [
         {"field": "tenant", "operator": "=", "values": [TENANT]}]}),
]

print("school-scoped administrator")
print("  username %s" % USERNAME)
print("  email    %s" % EMAIL)
print("  scope    %s (%s) tenant=%s" % (root.get("key") or root["name"], root["id"], TENANT))
for kind, name, bound in GRANTS:
    mark = "MISSING" if name not in OBJ[kind] else ("tenant=" + TENANT if bound else "scope only")
    print("  grant    %-30s %-11s %s" % (name, kind, mark))

if not APPLY:
    print("\ndry run. re-run with --apply to write to " + BASE)
    sys.exit(0)

_, found = call("GET", "/v1/admin/users?q=" + USERNAME)
user = next((u for u in (found or []) if u.get("username") == USERNAME), None)
if user:
    print("\nuser exists: %s" % user["id"])
else:
    code, out = call("POST", "/v1/admin/users", {
        "username": USERNAME, "email": EMAIL,
        "full_name": FULLNAME, "password": PASSWORD})
    if code >= 300:
        print("\ncreate user FAILED", code, out)
        sys.exit(1)
    user = out
    print("\nuser created: %s" % user["id"])

code, out = call("POST", "/v1/admin/groups/%s/users/%s" % (root["id"], user["id"]))
print("group membership -> %s" % ("ok" if code < 300 else (code, out)))

_, held = call("GET", "/v1/admin/permissions?limit=1000")
have = {(p.get("subject_id"), p.get("object_id"), p.get("scope_id")) for p in (held or [])}

for kind, name, bound in GRANTS:
    oid = OBJ[kind].get(name)
    if not oid:
        print("grant %-30s SKIPPED, object missing" % name)
        continue
    if (user["id"], oid, root["id"]) in have:
        print("grant %-30s already held" % name)
        continue
    payload = {"subject_type": "user", "subject_id": user["id"],
               "object_type": kind, "object_id": oid, "scope_id": root["id"],
               "reason": "school-scoped administrator for tenant " + TENANT}
    if bound:
        payload["constraints"] = bound
    code, out = call("POST", "/v1/admin/permissions", payload)
    print("grant %-30s %s" % (name, "ok" if code < 300 else (code, out)))

print("\nsign in as %s / %s" % (USERNAME, PASSWORD))
print("this admin CANNOT create users: CreateUser is requireGlobal in CAS today")
