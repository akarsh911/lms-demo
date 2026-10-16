import json, os, re, sys, urllib.request, urllib.error

BASE = os.environ.get("CAS_BASE_URL", "https://auth.tryemerge.in")
SCRATCH = os.path.expanduser("~/.emerge-scratch")
TENANT = os.environ.get("CAS_TENANT", "dps-ngp")
APPLY = "--apply" in sys.argv

ROLE_GROUPS = [
    ("emerge-leadership", "Leadership"),
    ("emerge-teachers", "Teachers"),
    ("emerge-students", "Students"),
    ("emerge-parents", "Parents"),
]

ASSIGN = [
    (re.compile(r"^teacher\d+@dps-ngp\.demo$"), "emerge-teachers"),
    (re.compile(r"^pupil\d+@dps-ngp\.demo$"), "emerge-students"),
    (re.compile(r"^guardian\d+@dps-ngp\.demo$"), "emerge-parents"),
    (re.compile(r"^principal@dps-ngp\.tryemerge\.in$"), "emerge-leadership"),
]

EXTRA_LEADERSHIP = [u.strip() for u in os.environ.get("EXTRA_LEADERSHIP", "superadmin").split(",") if u.strip()]

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
        return e.code, e.read().decode()[:200]


def role_for(user):
    email = user.get("email") or ""
    for pat, key in ASSIGN:
        if pat.match(email):
            return key
    if (user.get("username") or "") in EXTRA_LEADERSHIP:
        return "emerge-leadership"
    return None


def main():
    _, groups = call("GET", "/v1/admin/groups?limit=300")
    bykey = {g.get("key"): g for g in groups or []}
    root = bykey.get(TENANT) or next((g for g in groups or [] if g.get("tenant_id") == TENANT), None)
    if not root:
        sys.exit("no tenant group " + TENANT)

    users, off = [], 0
    while True:
        s, page = call("GET", "/v1/admin/users?limit=200&offset=%d" % off)
        if s != 200 or not page:
            break
        users.extend(page)
        if len(page) < 200:
            break
        off += 200

    plan = {}
    for u in users:
        key = role_for(u)
        if key:
            plan.setdefault(key, []).append(u)

    print("tenant group %s (%s)" % (TENANT, root["id"]))
    for key, _name in ROLE_GROUPS:
        print("  %-20s exists=%-5s members to add=%d"
              % (key, key in bykey, len(plan.get(key, []))))

    if not APPLY:
        print("")
        print("dry run. re-run with --apply.")
        return

    for key, name in ROLE_GROUPS:
        g = bykey.get(key)
        if not g:
            s, body = call("POST", "/v1/admin/groups",
                           {"key": key, "name": name, "type": "organizational"})
            if s not in (200, 201):
                print("  create %s FAILED %s %s" % (key, s, body))
                continue
            g = body
            bykey[key] = g
            print("  created group %s" % key)
        s, _ = call("POST", "/v1/admin/groups/%s/children/%s" % (root["id"], g["id"]))
        print("  nest %-20s under %s -> %s" % (key, TENANT, "ok" if s < 300 else s))

    for key, _name in ROLE_GROUPS:
        g = bykey.get(key)
        if not g:
            continue
        added = 0
        for u in plan.get(key, []):
            s, _ = call("POST", "/v1/admin/groups/%s/users/%s" % (g["id"], u["id"]))
            if s < 300:
                added += 1
        print("  %-20s members added %d/%d" % (key, added, len(plan.get(key, []))))


main()
