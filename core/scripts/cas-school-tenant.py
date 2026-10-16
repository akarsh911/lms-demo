import json, os, sys, urllib.request, urllib.error

BASE = os.environ.get("CAS_BASE_URL", "https://auth.tryemerge.in")
SCRATCH = os.path.expanduser("~/.emerge-scratch")
TENANT = os.environ.get("CAS_TENANT", "dps-ngp")
GROUP_NAME = os.environ.get("CAS_GROUP_NAME", "DPS Nagpur")
USERNAME = os.environ.get("CAS_ADMIN_USERNAME", "dps.principal")
BUNDLE = os.environ.get("CAS_BUNDLE", "Principal")
APPLY = "--apply" in sys.argv


def read_token():
    raw = os.environ.get("CAS_TOKEN", "").strip()
    if raw:
        return raw
    return open(os.path.join(SCRATCH, "tok")).read().strip()


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
        return e.code, e.read().decode()[:300]


def find_group():
    _, groups = call("GET", "/v1/admin/groups?limit=200")
    for g in groups or []:
        if g.get("key") == TENANT or g.get("tenant_id") == TENANT:
            return g
    return None


def find_user():
    _, users = call("GET", "/v1/admin/users?q=" + urllib.parse.quote(USERNAME))
    for u in users or []:
        if u.get("username") == USERNAME:
            return u
    return None


def find_bundle():
    _, bundles = call("GET", "/v1/admin/rule-groups?limit=200")
    for b in bundles or []:
        if b.get("name") == BUNDLE:
            return b
    return None


def main():
    user = find_user()
    if not user:
        sys.exit("no CAS user named %r" % USERNAME)
    bundle = find_bundle()
    if not bundle:
        sys.exit("no CAS rule group named %r" % BUNDLE)

    group = find_group()
    print("user   %s %s" % (USERNAME, user["id"]))
    print("bundle %s %s" % (BUNDLE, bundle["id"]))
    print("group  %s" % (group["id"] if group else "MISSING, will create"))

    if not APPLY:
        print("")
        print("dry run. re-run with --apply.")
        return

    if not group:
        status, body = call("POST", "/v1/admin/groups",
                            {"key": TENANT, "name": GROUP_NAME, "type": "organizational"})
        if status not in (200, 201):
            sys.exit("creating group failed: %s %s" % (status, body))
        group = body
        print("created group %s" % group["id"])

    status, body = call("PUT", "/v1/admin/groups/%s/tenant" % group["id"], {"tenant_id": TENANT})
    if status not in (200, 201, 204):
        sys.exit("tagging tenant failed: %s %s" % (status, body))
    print("tenant tagged %s" % TENANT)

    status, _ = call("POST", "/v1/admin/groups/%s/users/%s" % (group["id"], user["id"]))
    print("group membership: %s" % ("added" if status in (200, 201, 204) else "already present"))

    _, held = call("GET", "/v1/admin/permissions?limit=1000")
    if any(p.get("subject_id") == user["id"] and p.get("object_id") == bundle["id"]
           and p.get("scope_id") == group["id"] for p in (held or [])):
        print("grant: already held")
        return

    status, body = call("POST", "/v1/admin/permissions", {
        "subject_type": "user", "subject_id": user["id"],
        "object_type": "rule_group", "object_id": bundle["id"],
        "scope_id": group["id"],
        "reason": "school administrator for tenant " + TENANT,
    })
    if status >= 300:
        sys.exit("granting failed: %s %s" % (status, body))
    print("granted %s to %s scoped to %s" % (BUNDLE, USERNAME, TENANT))


main()
