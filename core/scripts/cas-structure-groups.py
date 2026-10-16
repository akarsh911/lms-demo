import json, os, re, subprocess, sys, urllib.request, urllib.error

BASE = os.environ.get("CAS_BASE_URL", "https://auth.tryemerge.in")
SCRATCH = os.path.expanduser("~/.emerge-scratch")
TENANT = os.environ.get("CAS_TENANT", "dps-ngp")
SSH_HOST = os.environ.get("SSH_HOST", "editone-prod")
TENANT_DB = os.environ.get("TENANT_DB", "emerge_tenant_dps_ngp")
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
        return e.code, e.read().decode()[:200]


def slug(prefix, code):
    s = re.sub(r"[^a-z0-9]+", "-", code.lower()).strip("-")
    return "%s-%s" % (prefix, s)


def psql(sql):
    out = subprocess.run(
        ["ssh", "-o", "BatchMode=yes", SSH_HOST,
         "sudo docker exec emerge-db psql -U postgres -d %s -tAc \"%s\"" % (TENANT_DB, sql)],
        capture_output=True, text=True, timeout=90)
    if out.returncode != 0:
        sys.exit("psql failed: " + out.stderr[:200])
    return [l.strip() for l in out.stdout.splitlines() if l.strip()]


def read_structure():
    branches = [l.split("|") for l in psql("select code, name from branches")]
    grades = [l.split("|") for l in psql("select code, name from grade_levels order by code")]
    sections = [l.split("|") for l in psql(
        "select s.code, g.code, s.name from sections s join grade_levels g on g.id=s.grade_level_id order by s.code")]
    return branches, grades, sections


def main():
    branches, grades, sections = read_structure()
    print("structure: %d branch, %d grades, %d sections" % (len(branches), len(grades), len(sections)))

    _, groups = call("GET", "/v1/admin/groups?limit=400")
    bykey = {g.get("key"): g for g in groups or []}
    root = bykey.get(TENANT)
    if not root:
        sys.exit("no tenant group " + TENANT)

    plan = []
    for code, name in branches:
        plan.append((slug("branch", code), "Branch - " + name, TENANT))
    for code, name in grades:
        plan.append((slug("grade", code), name, slug("branch", branches[0][0])))
    for scode, gcode, sname in sections:
        plan.append((slug("section", scode), sname, slug("grade", gcode)))

    missing = [p for p in plan if p[0] not in bykey]
    print("groups to create: %d of %d" % (len(missing), len(plan)))
    for k, _n, parent in plan[:6]:
        print("   %-34s under %s%s" % (k, parent, "" if k in bykey else "   (new)"))
    if len(plan) > 6:
        print("   ... and %d more" % (len(plan) - 6))

    if not APPLY:
        print("")
        print("dry run. re-run with --apply.")
        return

    for key, name, parent_key in plan:
        g = bykey.get(key)
        if not g:
            s, body = call("POST", "/v1/admin/groups",
                           {"key": key, "name": name, "type": "organizational"})
            if s not in (200, 201):
                print("  create %-34s FAILED %s %s" % (key, s, body))
                continue
            g = body
            bykey[key] = g
        parent = bykey.get(parent_key)
        if not parent:
            print("  %-34s parent %s MISSING" % (key, parent_key))
            continue
        s, _ = call("POST", "/v1/admin/groups/%s/children/%s" % (parent["id"], g["id"]))
        print("  %-34s under %-24s %s" % (key, parent_key, "ok" if s < 300 else s))

    print("")
    print("context strings the frontend should send, most specific first:")
    if sections:
        scode, gcode, _ = sections[0]
        print("  [%s, %s, %s, %s]" % (
            slug("section", scode), slug("grade", gcode),
            slug("branch", branches[0][0]), TENANT))


main()
