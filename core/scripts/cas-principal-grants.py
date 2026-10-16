#!/usr/bin/env python3
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = os.environ.get("CAS_BASE_URL", "https://auth.tryemerge.in")
SCRATCH = os.path.expanduser("~/.emerge-scratch")
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEYDOC = os.path.join(REPO, "docs", "CAS-KEYS-TO-REGISTER.md")
SERVICE = os.environ.get("CAS_SERVICE", "Emerge Core")
SECTION = os.environ.get("CAS_SECTION", "Emerge Core/Atoms")
RULE_KEY = os.environ.get("RULE_KEY", "core-principal-school-wide")
RULE_NAME = os.environ.get("RULE_NAME", "Principal - everything in this school")
RULE_DESC = os.environ.get(
    "RULE_DESC",
    "Every Emerge Core capability at tenant reach. CAS answers whether the principal may "
    "touch the area at all; emerge-core's row predicates still decide which rows.")
PRINCIPAL_ID = os.environ.get("CAS_PRINCIPAL_ID", "8f4cd645-4269-4a3a-9739-814b3da60d45")
SCOPE_GROUP_ID = os.environ.get("CAS_SCOPE_GROUP_ID", "41160616-f264-48a1-bfd8-d4ba14bedcd7")
REACH = os.environ.get("REACH", "tenant")
PREFIX = "core."
APPLY = "--apply" in sys.argv


def positive_env(name, default):
    raw = os.environ.get(name, "").strip()
    if not raw.isdigit():
        return default
    return int(raw)


LIST_CAP = positive_env("LIST_CAP", 25)

UUID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")


def read_token():
    raw = os.environ.get("CAS_TOKEN", "").strip()
    if raw:
        return raw
    path = os.path.join(SCRATCH, "tok")
    if not os.path.exists(path):
        sys.exit("no token: set CAS_TOKEN, or place one in " + path)
    try:
        raw = open(path).read().strip()
    except OSError as e:
        sys.exit("cannot read %s: %s" % (path, e))
    if not raw:
        sys.exit("no token: %s is empty and CAS_TOKEN is unset" % path)
    return raw


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
    except urllib.error.URLError as e:
        return 0, "cannot reach %s: %s" % (BASE, e.reason)
    except (TimeoutError, OSError, ValueError) as e:
        return 0, "cannot reach %s: %s" % (BASE, e)


def need(method, path, what):
    status, body = call(method, path)
    if status in (401, 403):
        sys.exit("%s refused (%s): the token is expired or lacks admin reach.\n  %s %s\n  %s" % (
            what, status, method, path, body))
    if status != 200:
        sys.exit("%s failed (%s): %s" % (what, status or "no response", body))
    return body


def service_id():
    for s in need("GET", "/v1/admin/services?limit=200", "listing services") or []:
        if SERVICE in (s.get("slug"), s.get("key"), s.get("name")):
            return s["id"]
    sys.exit("no service matched %r; set CAS_SERVICE" % SERVICE)


def core_entities(sid):
    listed = need("GET", "/v1/admin/entities?service_id=%s&limit=1000" % sid, "listing entities")
    return {e["key"]: e["id"] for e in listed or []
            if e.get("kind") == "action" and str(e.get("key", "")).startswith(PREFIX)}


FIELDS = {}


def fields_of(key, eid):
    if key not in FIELDS:
        detail = need("GET", "/v1/admin/entities/" + eid, "reading entity " + key)
        FIELDS[key] = {f.get("key") for f in (detail or {}).get("fields") or []}
    return FIELDS[key]


def has_reach(key, eid):
    return "reach" in fields_of(key, eid)


def area_of(key):
    return key.split(".")[1]


def verb_of(key):
    return key.split(".")[2]


def narrowable_areas(keys):
    return {area_of(k): True for k in keys if verb_of(k).endswith("_all")}


def reach_expected(key, narrowable):
    return narrowable.get(area_of(key), False) and verb_of(key) != "create"


def group_tenant(group):
    if group.get("tenant_id"):
        return group["tenant_id"]
    groups = need("GET", "/v1/admin/groups?limit=500", "listing groups") or []
    edges = need("GET", "/v1/admin/groups/edges", "listing group edges") or []
    by_id = {g["id"]: g for g in groups}
    parents = {}
    for e in edges or []:
        parents.setdefault(e["child_id"], []).append(e["parent_id"])
    seen, stack = set(), [group["id"]]
    while stack:
        gid = stack.pop()
        if gid in seen:
            continue
        seen.add(gid)
        if (by_id.get(gid) or {}).get("tenant_id"):
            return by_id[gid]["tenant_id"]
        stack.extend(parents.get(gid, []))
    return None


def nodes(expr):
    if not isinstance(expr, dict):
        return
    if expr.get("field"):
        yield expr
    for child in expr.get("children") or []:
        for found in nodes(child):
            yield found


def reach_of(alt):
    for n in nodes(alt.get("expression")):
        if n.get("field") == "reach" and n.get("operator") == "=" and n.get("values"):
            return str(n["values"][0])
    return None


def pins_of(alt):
    return sorted({n["field"] for n in nodes(alt.get("expression")) if n.get("field") != "reach"})


def field_limit(alt):
    policy = alt.get("fields")
    if not policy or policy.get("mode") in (None, "", "all"):
        return None
    keys = policy.get("keys") or []
    return "%s %s" % (policy.get("mode"), ",".join(keys[:4]) + ("..." if len(keys) > 4 else ""))


def describe(alt, reachable):
    bits = []
    if reachable:
        bits.append("reach=" + (reach_of(alt) or "unset"))
    if pins_of(alt):
        bits.append("pinned " + ",".join(pins_of(alt)))
    if field_limit(alt):
        bits.append("columns " + field_limit(alt))
    return (alt.get("rule") or "?") + (" [" + ", ".join(bits) + "]" if bits else "")


def covers(alt, reachable):
    if field_limit(alt) or pins_of(alt):
        return False
    return reach_of(alt) == REACH if reachable else True


def declared_keys():
    if not os.path.exists(KEYDOC):
        return set()
    return set(re.findall(r"^core\.[a-z_]+\.[a-z_]+$", open(KEYDOC).read(), re.M))


def held_alternatives(tenant):
    path = "/v1/admin/users/%s/policies?tenant=%s" % (
        PRINCIPAL_ID, urllib.parse.quote(tenant, safe=""))
    body = need("GET", path, "resolving the principal's policies")
    return {e["entity"]: e.get("alternatives") or []
            for e in (body or {}).get("entities") or []
            if str(e.get("entity", "")).startswith(PREFIX)}


def main():
    if not UUID_RE.match(PRINCIPAL_ID):
        sys.exit("CAS_PRINCIPAL_ID is not a uuid: " + PRINCIPAL_ID)
    if not UUID_RE.match(SCOPE_GROUP_ID):
        sys.exit("CAS_SCOPE_GROUP_ID is not a uuid: " + SCOPE_GROUP_ID)

    user = need("GET", "/v1/admin/users/" + PRINCIPAL_ID, "reading the principal")
    group = need("GET", "/v1/admin/groups/" + SCOPE_GROUP_ID, "reading the scope group")
    tenant = group_tenant(group)
    if not tenant:
        sys.exit("scope group %s carries no tenant, directly or by inheritance; a grant there "
                 "would resolve in no tenant at all" % SCOPE_GROUP_ID)

    sid = service_id()
    entities = core_entities(sid)
    if not entities:
        sys.exit("service %r has no %s* action entities registered" % (SERVICE, PREFIX))
    narrowable = narrowable_areas(entities)

    print("cas      %s" % BASE)
    print("service  %s (%s)" % (SERVICE, sid))
    print("subject  %s (%s)" % (user.get("username") or user.get("email") or "?", PRINCIPAL_ID))
    print("scope    %s (%s) tenant=%s" % (
        group.get("key") or group.get("name"), SCOPE_GROUP_ID, tenant))

    held = held_alternatives(tenant)
    if any(a.get("rule") == "Superadmin" for alts in held.values() for a in alts):
        print("\nNOTE this user resolves as a CAS superadmin: every entity is already held in "
              "every tenant, so the gap below reads empty for the wrong reason.")

    reachable = {key: has_reach(key, eid) for key, eid in sorted(entities.items())}
    missing_reach_field = {k for k in entities
                           if reach_expected(k, narrowable) and not reachable[k]}

    covered, gap = [], []
    for key in sorted(entities):
        alternatives = held.get(key) or []
        if key in missing_reach_field:
            gap.append((key, "no reach field in CAS: tenant reach cannot be expressed and "
                             "emerge-core narrows the grant to self, ward and taught"))
            continue
        winner = next((a for a in alternatives if covers(a, reachable[key])), None)
        if winner:
            covered.append((key, describe(winner, reachable[key])))
        elif alternatives:
            gap.append((key, "held but narrow: " + "; ".join(
                describe(a, reachable[key]) for a in alternatives[:3])))
        else:
            gap.append((key, "not held"))

    print("\nregistered %d %s* entities, %d of them with a reach dimension" % (
        len(entities), PREFIX, sum(1 for k in reachable if reachable[k])))

    print("\nGAP: %d of %d entities the principal cannot exercise school-wide" % (
        len(gap), len(entities)))
    for key, why in gap:
        print("  %-42s %s" % (key, why))
    if not gap:
        print("  (none)")

    print("\nalready school-wide: %d" % len(covered))
    for key, via in covered:
        print("  %-42s via %s" % (key, via))

    unregistered = sorted(declared_keys() - set(entities))
    if unregistered:
        print("\ndeclared in docs/CAS-KEYS-TO-REGISTER.md but NOT registered in CAS (%d)." % len(
            unregistered))
        print("nobody can hold these and this script cannot grant them; run "
              "scripts/cas-register-entities.py first.")
        for key in unregistered[:LIST_CAP]:
            print("  " + key)
        if len(unregistered) > LIST_CAP:
            print("  ... and %d more" % (len(unregistered) - LIST_CAP))

    if missing_reach_field:
        print("\nno reach field in CAS although the area is narrowable (%d)." % len(
            missing_reach_field))
        print("run scripts/cas-sync-entity-fields.py before granting these, or they land "
              "without a reach constraint and stay narrow.")
        for key in sorted(missing_reach_field):
            print("  " + key)

    policies = []
    for key in sorted(entities):
        children = ([{"field": "reach", "operator": "=", "values": [REACH]}]
                    if reachable[key] else [])
        policies.append({"entity_id": entities[key], "cacheable": False,
                         "expression": {"op": "AND", "children": children}})

    direct = need("GET", "/v1/admin/users/%s/permissions" % PRINCIPAL_ID,
                  "listing the principal's grants") or []
    unscoped = [p for p in direct if not p.get("scope_id")]

    print("\nplan")
    print("  rule      %s (key %s, section %s)" % (RULE_NAME, RULE_KEY, SECTION))
    print("  policies  %d entities, %d at reach=%s, %d with no reach dimension" % (
        len(policies), sum(1 for k in reachable if reachable[k]), REACH,
        sum(1 for k in reachable if not reachable[k])))
    print("  grant     rule -> user %s at scope %s (%s)" % (
        PRINCIPAL_ID, group.get("key") or group.get("name"), SCOPE_GROUP_ID))
    print("  scope_id  explicit on every write; a null scope is refused")

    if unscoped:
        print("\nWARNING the principal already holds %d direct grant(s) with a NULL scope, which "
              "reach every tenant in the estate:" % len(unscoped))
        for p in unscoped:
            print("  %s %s (%s)" % (p.get("object_type"),
                                    p.get("object_name") or p.get("object_id"), p.get("id")))
        print("this script does not touch them; revoke them by hand.")

    if not APPLY:
        print("\ndry run. re-run with --apply to write to " + BASE)
        return

    call("POST", "/v1/admin/rules/sections", {"path": SECTION})
    existing = need("GET", "/v1/admin/rules?limit=500", "listing rules") or []
    rid = next((r["id"] for r in existing
                if r.get("key") == RULE_KEY or r.get("name") == RULE_NAME), None)
    if rid:
        print("\nrule exists %s" % rid)
    else:
        status, body = call("POST", "/v1/admin/rules", {
            "key": RULE_KEY, "name": RULE_NAME, "description": RULE_DESC, "section": SECTION})
        if status >= 300:
            sys.exit("creating the rule failed: %s %s" % (status, body))
        rid = body["id"]
        print("\ncreated rule %s" % rid)

    status, body = call("PUT", "/v1/admin/rules/%s/policies" % rid, {"policies": policies})
    if status >= 300:
        sys.exit("replacing the rule's policies failed: %s %s" % (status, body))
    print("policies set: %d" % len(policies))

    if any(p.get("object_id") == rid and p.get("scope_id") == SCOPE_GROUP_ID for p in direct):
        print("grant already held at scope %s" % SCOPE_GROUP_ID)
        return

    payload = {"subject_type": "user", "subject_id": PRINCIPAL_ID,
               "object_type": "rule", "object_id": rid,
               "scope_id": SCOPE_GROUP_ID,
               "reason": "school-wide capability for the principal of " + tenant}
    if not payload.get("scope_id") or not UUID_RE.match(str(payload["scope_id"])):
        sys.exit("refusing to write a grant without an explicit scope")
    status, body = call("POST", "/v1/admin/permissions", payload)
    if status >= 300:
        sys.exit("granting failed: %s %s" % (status, body))
    print("granted rule %s to %s at scope %s" % (rid, PRINCIPAL_ID, SCOPE_GROUP_ID))


main()
