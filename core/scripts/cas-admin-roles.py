import json, os, sys, urllib.request, urllib.error

BASE = os.environ.get("CAS_BASE_URL", "https://auth.tryemerge.in")
SP = os.path.expanduser("~/.emerge-scratch")
TOKEN = open(os.path.join(SP, "tok")).read().strip()
SECTION = "CAS/Roles"
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

CAS = json.load(open(os.path.join(SP, "casmap.json")))
FIELDS = {}

def declared(key):
    if key not in FIELDS:
        _, d = call("GET", "/v1/admin/entities/" + CAS[key])
        FIELDS[key] = {f["key"] for f in ((d or {}).get("fields") or [])}
    return FIELDS[key]

NOT_ADMIN = {"field": "target_is_admin", "operator": "=", "values": [False]}
ORG_GROUP = {"field": "group_type", "operator": "=", "values": ["organizational"]}
CORE_ROLES_ONLY = [
    {"field": "object_type", "operator": "=", "values": ["rule"]},
    {"field": "object_section", "operator": "STARTS_WITH", "values": ["Emerge Core/Roles"]},
]

USER_MANAGE = ["cas.users.read", "cas.users.list", "cas.users.update",
               "cas.users.set_status", "cas.users.reset_password", "cas.users.unlock",
               "cas.users.read_groups", "cas.users.read_permissions",
               "cas.users.read_sessions", "cas.users.revoke_sessions"]
USER_SUPPORT = ["cas.users.read", "cas.users.list", "cas.users.reset_password",
                "cas.users.unlock", "cas.users.read_sessions", "cas.users.revoke_sessions"]
USER_LOOK = ["cas.users.read", "cas.users.list", "cas.users.read_groups"]
GROUP_LOOK = ["cas.groups.read", "cas.groups.list", "cas.groups.read_users"]

ROLES = [
    {"key": "cas-school-admin", "name": "CAS \u2014 school administrator",
     "desc": "Manage the people and memberships of one school inside CAS. "
             "Cannot touch another administrator, and cannot grant CAS rules.",
     "policies": [(e, [NOT_ADMIN]) for e in USER_MANAGE]
                 + [(e, [ORG_GROUP]) for e in GROUP_LOOK
                    + ["cas.groups.add_user", "cas.groups.remove_user"]]
                 + [("cas.permissions.create", CORE_ROLES_ONLY),
                    ("cas.permissions.revoke", []),
                    ("cas.permissions.list", []),
                    ("cas.permissions.read", [])]},

    {"key": "cas-support-desk", "name": "CAS \u2014 support desk",
     "desc": "Unblock people who cannot sign in. Password resets, unlocks and session "
             "revocation only, never permissions and never an administrator.",
     "policies": [(e, [NOT_ADMIN]) for e in USER_SUPPORT]},

    {"key": "cas-directory-read", "name": "CAS \u2014 directory reader",
     "desc": "See who exists and which groups they are in. No writes of any kind.",
     "policies": [(e, [NOT_ADMIN]) for e in USER_LOOK]
                 + [(e, []) for e in GROUP_LOOK]},
]

missing = sorted({e for r in ROLES for e, _ in r["policies"] if e not in CAS})
if missing:
    print("entities CAS does not have:", *missing, sep="\n  ")
    sys.exit(1)

if APPLY:
    code, _ = call("POST", "/v1/admin/rules/sections", {"path": SECTION})
    print("section %s -> %s\n" % (SECTION, "ok" if code < 300 else code))

_, existing = call("GET", "/v1/admin/rules")
by_name = {r["name"]: r["id"] for r in (existing or []) if isinstance(r, dict)}

for role in ROLES:
    rid = by_name.get(role["name"])
    print("%-8s %-34s %2d policies" % ("exists" if rid else "create", role["name"], len(role["policies"])))

    policies, dropped = [], []
    for key, conds in role["policies"]:
        keep = [c for c in conds if c["field"] in declared(key)]
        dropped += [c["field"] for c in conds if c["field"] not in declared(key)]
        policies.append({"entity_id": CAS[key], "cacheable": False,
                         "expression": {"op": "AND", "children": keep}})
    if dropped:
        print("   conditions not supported by their entity, dropped:", sorted(set(dropped)))

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
    code, out = call("PUT", "/v1/admin/rules/%s/policies" % rid, {"policies": policies})
    print("   policies ->", "ok" if code < 300 else (code, out))

if not APPLY:
    print("\ndry run. re-run with --apply to write to", BASE)
