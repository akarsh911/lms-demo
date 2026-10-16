# Running the demo locally

The local stack talks to the deployed demo CAS at `auth-demo.tryemerge.in`, with
one seeded school and a year of data in it.

## Start it

```bash
docker compose up -d control-db dev-db tenant-db
go run ./cmd/api
```

`.env` is already set. Nothing needs exporting; the server reads it directly.

Or press **F5** in VS Code and pick **API server** — same thing, with breakpoints.

## Sign in

Every seeded person can log in. The password is the same for all of them:

```
Emerge#Demo2026
```

| Who | Identifier |
|---|---|
| Teacher | `teacher01@dps-ngp.demo` … `teacher10@dps-ngp.demo` |
| Pupil | `pupil001@dps-ngp.demo` … `pupil100@dps-ngp.demo` |
| Guardian | `guardian001@dps-ngp.demo` … `guardian096@dps-ngp.demo` |

```bash
curl -s -X POST http://localhost:8081/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"teacher01@dps-ngp.demo","password":"Emerge#Demo2026"}'
```

That returns `tokens.access_token`. Send it with the school header:

```bash
curl -s http://localhost:8081/api/v1/students \
  -H 'X-School-Id: DPS-NGP' \
  -H "Authorization: Bearer $TOKEN"
```

## What to expect right now

| Request | Answer | Why |
|---|---|---|
| `/health` | 200 | no auth |
| any `/api/v1/*` with no token | 401 | authentication |
| any `/api/v1/*` with a token | **403** | authenticated, but nobody has been granted anything yet |

**The 403 is the system working.** Login, token verification, tenant resolution
and the policy fetch all succeed; CAS returns an empty grant set, so the answer
is no. It becomes 200 the moment a grant exists for that person.

The log says which kind of empty it was, so an unexpected 403 does not need
guessing:

```
no grants at all for this caller in this school
  tenant=cms
  hint="CAS returned nothing for tenant cms: either no grant is scoped to it,
        or a grant is scoped to a group CAS has not tagged with a tenant"
```

## The data

One school, `DPS-NGP`, CAS tenant `cms`, session `2026-2027`.

| | |
|---|---|
| Classes | 3 (`G6`, `G7`, `G8`) |
| Sections | 6, two per class, 16-17 pupils each |
| Teachers | 10, each a class teacher somewhere and a subject teacher elsewhere |
| Pupils | 100 |
| Guardians | 96 — four pupils have none, deliberately |
| Subjects | 5, offered in every section (30 offerings) |

## Reseeding

The seeder is idempotent. Running it again on a seeded school reports
`nothing: everything already existed`, so it is safe to re-run after a partial
failure.

```bash
go run ./cmd/seeddemo -school DPS-NGP
```

Reshape it without editing code:

```bash
go run ./cmd/seeddemo -school DPS-NGP \
  -classes 4 -sections 3 -teachers 20 -students 240 -no-guardian 10
```

`-dry-run` reports what it would make and writes nothing.

### CAS identities

Seeding alone gives each person a random `cas_user_id`, which satisfies
emerge-core but means nobody can log in. To give them real CAS identities:

```bash
go run ./cmd/seeddemo -school DPS-NGP -backfill-cas \
  -cas-token "$SUPERADMIN_TOKEN" -cas-url https://auth-demo.tryemerge.in
```

It matches on email, so people who already have the right identity are left
alone. Around 100 seconds for 200 people.

The token must be a superadmin's own **user** token. A `client_credentials`
service token cannot call `/v1/admin/*`: those routes read a session id from the
claims and a service token deliberately has none.

## Sample paper formats

`seeddemo` makes no blueprints. `seedblueprints` does, and nothing else, so it is
the one seeder that is safe to point at a school that is already live:

```bash
go run ./cmd/seedblueprints -school DPS-NGP
```

Eight samples: a maths unit test in two versions, a Science half-yearly and
annual on the CBSE five-section shape, a reusable MCQ quiz, English and Hindi
papers banded by reading, grammar, writing and literature rather than by
remember and apply, and a Social Science annual left in draft. Subjects (ENG,
HIN, MATH, SCI, SST) and grade levels (G6, G7, G8) are resolved by code and must
already exist; the command names what is missing rather than inventing it.

Also idempotent, and resumable: a second run reports `nothing: every sample
already existed`, and a run over a half-written set finishes it. A sample a
school has since edited is reported under `left alone` and not overwritten.

`-list` prints the set as it stands and writes nothing, which is the safe way to
look before and after:

```bash
go run ./cmd/seedblueprints -school DPS-NGP -list
```

## Two settings on the demo CAS worth knowing

**2FA is off** (`login.two_factor_enabled = false`). Seeded people have
`@dps-ngp.demo` addresses that no mailbox receives, so with 2FA on nobody could
ever finish signing in. To put it back:

```bash
curl -X PUT https://auth-demo.tryemerge.in/v1/admin/settings/login.two_factor_enabled \
  -H "Authorization: Bearer $SUPERADMIN_TOKEN" \
  -H 'Content-Type: application/json' -d '{"value":true}'
```

**This machine is not in `CAS_TRUSTED_PROXIES`.** CAS throttles failed logins per
client IP, and relayed logins all arrive from one address, so a mistyped
password here counts against everyone. Fine locally; not fine deployed.

## The two audiences

They are different and the names invite confusing them:

- `CAS_AUDIENCE=mentis` — what an **end user's** token carries. The verifier
  requires it.
- `CAS_SERVICE_KEY=core` — this **service's** key, sent as `services` on the
  policy call.

Using one value for both makes CAS reject every user token with
`the token is not valid for this audience`, which reads like a token problem and
is a configuration one.
