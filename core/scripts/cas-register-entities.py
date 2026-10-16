import json, os, re, sys, urllib.request, urllib.error

BASE = os.environ.get("CAS_BASE_URL", "https://auth.tryemerge.in")
SCRATCH = os.path.expanduser("~/.emerge-scratch")
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEYDOC = os.path.join(REPO, "docs", "CAS-KEYS-TO-REGISTER.md")
SERVICE = os.environ.get("CAS_SERVICE", "emerge-core")
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


def wanted_keys():
    keys = re.findall(r"^core\.[a-z_]+\.[a-z_]+$", open(KEYDOC).read(), re.M)
    if not keys:
        sys.exit("no keys parsed from " + KEYDOC)
    return sorted(set(keys))


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


def main():
    sid = service_id()
    have = existing_entities(sid)
    print("service %s  existing entities %d" % (sid, len(have)))

    need_folders, need_actions = [], []
    for key in wanted_keys():
        root, area, _verb = key.split(".")
        folder = root + "." + area
        if folder not in have and folder not in need_folders:
            need_folders.append(folder)
        if key not in have:
            need_actions.append(key)

    if not need_folders and not need_actions:
        print("nothing to do: every key in the doc is already registered")
        return

    print("missing folders (%d): %s" % (len(need_folders), ", ".join(need_folders) or "-"))
    print("missing actions (%d):" % len(need_actions))
    for key in need_actions:
        print("  " + key)

    if not APPLY:
        print("")
        print("dry run. re-run with --apply to create them.")
        return

    for folder in need_folders:
        have[folder] = create(sid, None, folder.split(".")[1], "folder")
        print("created folder " + folder)

    for key in need_actions:
        parent = have[".".join(key.split(".")[:2])]
        have[key] = create(sid, parent, key.split(".")[2], "action")
        print("created action " + key)

    print("")
    print("done. %d folders, %d actions." % (len(need_folders), len(need_actions)))


main()
