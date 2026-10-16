import json, os, re, sys, urllib.request, urllib.error

BASE = os.environ.get("CAS_BASE_URL", "https://auth.tryemerge.in")
SCRATCH = os.path.expanduser("~/.emerge-scratch")
FEATURES_TS = os.environ.get(
    "FEATURES_TS", r"D:\emerge-frontend\src\constants\features.ts")
SECTION = os.environ.get("CAS_FEATURE_SECTION", "Emerge")
GROUP_KEY = os.environ.get("CAS_FEATURE_GROUP", "emerge-all")
GROUP_NAME = os.environ.get("CAS_FEATURE_GROUP_NAME", "Emerge - everything")
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
        return e.code, e.read().decode()[:250]


def wanted():
    src = open(FEATURES_TS, encoding="utf-8").read()
    keys = re.findall(r"^\s{2}'([a-z0-9][a-z0-9.\-]*)'", src, re.M)
    out, seen = [], set()
    for k in keys:
        if k not in seen:
            seen.add(k)
            out.append(k)
    if not out:
        sys.exit("no feature keys parsed from " + FEATURES_TS)
    return out


def label(key):
    tail = key.split(".")[-1].replace("-", " ")
    return tail[:1].upper() + tail[1:]


def main():
    keys = wanted()
    status, existing = call("GET", "/v1/admin/features?limit=500")
    if status != 200:
        sys.exit("listing features failed: %s %s" % (status, existing))
    have = {f["key"]: f["id"] for f in existing or []}

    missing = [k for k in keys if k not in have]
    print("frontend keys: %d   already in CAS: %d   missing: %d"
          % (len(keys), len(keys) - len(missing), len(missing)))
    for k in missing[:6]:
        print("   " + k)
    if len(missing) > 6:
        print("   ... and %d more" % (len(missing) - 6))

    if not APPLY:
        print("")
        print("dry run. re-run with --apply.")
        return

    call("POST", "/v1/admin/features/sections", {"path": SECTION})

    for i, key in enumerate(keys):
        if key in have:
            continue
        status, body = call("POST", "/v1/admin/features", {
            "key": key, "name": label(key), "section": SECTION,
            "sort_order": i, "is_active": True, "is_enabled": True})
        if status not in (200, 201):
            print("  FAILED %-34s %s %s" % (key, status, body))
            continue
        have[key] = body["id"]
    print("features present: %d" % len([k for k in keys if k in have]))

    status, groups = call("GET", "/v1/admin/feature-groups?limit=200")
    gid = next((g["id"] for g in groups or [] if g.get("key") == GROUP_KEY), None)
    if not gid:
        status, body = call("POST", "/v1/admin/feature-groups",
                            {"key": GROUP_KEY, "name": GROUP_NAME})
        if status not in (200, 201):
            sys.exit("creating feature group failed: %s %s" % (status, body))
        gid = body["id"]
        print("created feature group %s" % gid)

    status, inside = call("GET", "/v1/admin/feature-groups/%s/features" % gid)
    held = {f["key"] for f in inside or []} if isinstance(inside, list) else set()
    added = 0
    for key in keys:
        if key in held or key not in have:
            continue
        s, _ = call("POST", "/v1/admin/feature-groups/%s/features/%s" % (gid, have[key]))
        if s < 300:
            added += 1
    print("feature group %s now carries %d of %d (added %d)"
          % (GROUP_KEY, len(held) + added, len(keys), added))
    print("group id: %s" % gid)


main()
