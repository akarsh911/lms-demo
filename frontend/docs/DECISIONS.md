# Decisions, why it's built this way

Only the ones that will look wrong until you know the reason. Distilled from the
design work; the full research is not kept, because nobody reads 14,000 lines.

---

## Architecture

- **BFF, not a SPA.** CAS never sends `Access-Control-Allow-Credentials`, so a
  cross-origin cookie session is *impossible*. The Next server is the only place
  a session can live.
- **Tokens in an HttpOnly sealed cookie.** Client JS never holds one. There is
  no client-side entitlement store, so there is nothing to tamper with.
- **Encrypting a client cache was considered and rejected.** A key shipped in
  the bundle is available to whoever would forge the payload. The BFF deletes
  the problem instead of guarding it.
- **No roles.** CAS has none (`grep -rniE '\brole\b'` over CAS → 1 hit, a
  comment). A person is in many groups; features are a union. A `switch` on role
  cannot represent that.

## Entitlement

- **`/v1/me` is a candidate set, never a render source.** Its last clause is
  `WHERE f.is_active = TRUE AND f.kill_switch = FALSE`
  (`CAS/internal/repo/authz.go:145`), so it applies two of a feature's three
  axes and not the third: `is_enabled = false` still appears there. That is
  deliberate: a disabled feature is meant to be drawn and inert, so it has to
  reach the client. It is also **scope-blind**, so a scoped grant reads as
  global.
- **`POST /v1/features/evaluate` is the authority.** Capped at 64 keys; we
  intersect `registry ∩ me.features` first, so payloads stay small.
- **Nav-level evaluate sends NO `context`.** Scope runs *downward* from the
  granted group; membership is a different set. `emerge.parent` holds attendance
  for `emerge-class-10` without being in it, passing their own groups returns
  `out_of_scope` and hides real access. Do not "fix" this.
- **Ten reasons, and `scoped_grant` is not one of them.** The scoped hit is
  `scope_match`. CAS's own docs are wrong here. The list was seven for a long
  time: `grant_off`, `feature_group_off` and `disabled` were missing, and
  because `uiStateFor` ends in an exhaustive `never`, a real CAS answer carrying
  one of them threw. `disabled` is reachable the moment a feature has
  `is_enabled = false`.
- **CAS's `visible` is cross-checked, not trusted or ignored.** Evaluate returns
  `state` and `visible` beside the reason. Visibility is derived from the reason
  here, because only the reason can say *why*; the two are then compared and a
  disagreement is logged. Two divergences are deliberate and named in
  `DELIBERATE_VISIBILITY_DIVERGENCE`: `scoped_grant_needs_context` (CAS says
  off, we show it reachable, the user holds it and the destination screen asks
  which class) and `kill_switch` (CAS says off, we show it disabled, an incident
  should not look like a revocation).
- **Unknown keys return `200 no_grant`**, identical to a deliberate denial.
  That is why `CAS_REGISTERED_KEYS` is an explicit list and why
  `check-routes.mjs` exists: a typo is otherwise silent forever.

## Navigation

- **Placement is declared here, not inferred from key depth.** CAS carries
  `features.placement` (`sidebar` | `widget`) but returns it only from the admin
  catalog, which no Emerge user can read. So the route registry declares the
  sidebar keys, the widget registry declares the widget keys, and
  `check-routes.mjs` refuses a key that claims both. The old rule, 2 segments
  is a section and 3+ is a widget, made a nested sidebar entry unrepresentable.
- **A nested route declares one path segment, not a full path.** The registry
  composes the URL from the tree, so a nav row and its href cannot end up nested
  under different things.
- **A child's feature key must descend from its parent's.** The URL tree and the
  key tree are then the same tree, which is what makes ancestor inheritance in
  `resolve-key.ts` mean what it looks like it means. Build-enforced.
- **A group with sidebar-only children has no page.** If every child of
  `emerge.learning` is itself a sidebar route, the parent owns no content and
  its page would be a list of links the sidebar is already showing. So it has no
  href and no route, `/p/x/learning` 404s, and the whole row is a disclosure
  control. Give it any widget key and it becomes a page again. Derived from the
  two registries, never declared, so they cannot disagree.
- **A group that DOES have a page is a link AND a disclosure, as two controls.**
  Making the whole row toggle would cost its page; making the whole row navigate
  would make the group unopenable while you are standing on it. The chevron also
  keeps working when the parent is disabled, so a killed parent never strands
  live children.
- **A disabled nav row says nothing extra.** Disabled is the signal; a hint line
  under every inert row is noise. `hintFor` survives for the widget grid, where
  a whole greyed card genuinely needs a sentence.
- **A parent the user has lost does not take its children down.** `buildNav`
  hoists visible children to the parent's level. The breadcrumb on the child
  page renders that unreachable ancestor as text rather than a link.
- **The open branch is derived, not stored.** A group is open when the current
  page is inside it; what is stored is the user's toggles, scoped to the branch
  they were made on. Mirroring the trail into state from an effect costs a
  second render on every navigation and is what `react-hooks/set-state-in-effect`
  is pointing at.

## Personas

- **A persona is a lens, not a permission.** It intersects with what the user
  holds and can only ever narrow. A forged persona in the URL shows *less*.
- **The preset orders; CAS decides existence.** An earlier version filtered by
  the preset, which made it a hardcoded per-role allowlist a real grant could
  not get past, the principal held `emerge.grades` and it rendered nowhere.
- **`role_name` lives in the frontend for now.** CAS cannot attribute a feature
  to the group that granted it (`SELECT DISTINCT f.key`), so this mapping could
  not come from CAS even if roles existed. Swap point is `selectPersonas()`.
- **Only leaf groups confer a persona.** `/v1/me.groups` is the *ancestor
  closure*, every user contains `emerge-school`. Mapping it would give one
  persona to the whole tenant. Asserted at startup.

## Session

- **Refresh happens in `proxy.ts` only.** CAS rotates the refresh token and
  revokes the whole session on replay. A Server Component cannot set a cookie,
  so a refresh there could not be persisted, and an unpersisted rotation is
  what triggers theft detection.
- **A 429 on refresh must NOT sign out and must NOT rotate.** CAS throttles
  *before* the token lookup, so the token is unspent. Treating it like any other
  failure turns a rate limit into a mass logout.
- **Rotation is recorded per session before the latch clears.** The latch alone
  only covers requests overlapping in time; the dangerous one arrives just after.

## Sign-in, credentials and 2FA

Measured against the live CAS on 2026-09-23 (`auth.tryemerge.in` and
`auth-demo.tryemerge.in`), not from the docs.

- **The field is `identifier`, never `username` or `email`.**
  `POST /v1/auth/login` takes `{identifier, password, channel?}`. Anything else
  is a 400 `invalid_body` before CAS is even asked.
- **One response shape covers three endpoints.** `/v1/auth/login`,
  `/login/verify` and `/password/change` all answer with `LoginResult`:
  `requires_2fa` plus EITHER `otp` OR `tokens`. `/v1/auth/refresh` alone answers
  a bare pair. That is why `fromLoginResult` is one function — the MFA-off path
  and the post-OTP path are the same branch, so the no-2FA case cannot land on
  an OTP screen by construction.
- **`must_change_password` is absent at the challenge stage.** It is only
  meaningful once tokens exist, so it is read as `=== true` and never as a
  falsy default.
- **A must-change-password session is held in `emerge_pending`, not
  `emerge_session`.** CAS's `RequirePasswordChanged` allows exactly
  `/v1/auth/password/change` and `/v1/auth/logout`; `/v1/me` and
  `/v1/features/evaluate` are both behind it and answer 403
  `password_change_required`. Sealing such a token as a real session would let
  the user into the app and have the entitlement resolver sign them straight
  back out — a loop. Every seeded user in the demo estate carries the flag, so
  this is the common case, not an edge one. The pending cookie is sealed with
  the same AES-256-GCM secret and lives 15 minutes; `proxy.ts` does not read it,
  so it can never stand in for a session.
- **`otp_error` is ONE code for nine outcomes.** Wrong code, expired, already
  used, attempt limit, resend-too-soon, resend limit, daily limit, unknown
  challenge and no destination all come back as `400 {"code":"otp_error"}`;
  only `message` differs. `lib/auth/otp-failure.ts` maps the message, which is
  the only thing the wire gives us, and every unmatched message degrades to one
  honest "something went wrong" rather than guessing.
- **Resend revives a dead challenge.** Verified live: after five wrong codes
  ("too many incorrect attempts") and after expiry ("otp expired"),
  `POST /v1/auth/otp/resend` still answers 200 with a fresh `expires_at` and a
  new code on the SAME `challenge_id`. So those states disable the verify
  button but keep the user on the OTP step with resend as the way out; they are
  not a dead end that needs the password re-typing.
- **The cooldown is the API's, not a constant here.** `next_resend_at` came
  back 30s out on issue and 60s out on the first resend, so a hardcoded timer
  would be wrong on the second press. The button reads the field.
- **`GET /v1/auth/password/policy` 404s on the deployed CAS.** It exists in the
  CAS source but not in the running build, so the sign-in screen states no rules
  up front and instead surfaces the `password_policy` rejection message, which
  does state them.
- **Passwordless start is kept as a secondary action.** CAS answers
  `otp/start` 200 for any identifier, including one that does not exist, as an
  anti-enumeration decoy. The UI therefore says a code was sent, never that the
  account exists.
- **Auth stays on the CAS client, not the emerge-core relay.** emerge-core
  relays `login`, `login/verify`, `otp/start`, `refresh`, `logout`,
  `password/change` and `password/reset` — but NOT `otp/resend`, which
  `POST https://core.tryemerge.in/api/v1/auth/otp/resend` confirms with a 404.
  Routing sign-in through core would cost the resend button.

## emerge-core, and the tenant header

- **emerge-core is database-per-tenant, so `X-School-Id` is not a filter.** It
  selects the DATABASE a request runs against
  (`internal/transport/http/middleware/tenant.go`). A client-supplied value is
  therefore a cross-tenant read, not a preference, which is why the proxy strips
  the header from every incoming request and states its own.
- **The value is configured, then CONFIRMED, and only the confirmed one is
  sent.** `CORE_SCHOOL_ID` is a server-side candidate. `server/core/tenant.ts`
  spends it once per session on `GET /auth/me`; emerge-core resolves that school
  and compares its `cas_tenant_id` with the `tenant_id` claim in the RS256-verified
  access token, answering 403 when they disagree. What every later request
  carries is the `school_id` UUID out of that confirmed response — a value the
  backend produced for this session.
- **There is no bootstrap from the session alone, and it is worth knowing why.**
  `/auth/me` is the one route behind `OptionalTenant`, but without the header it
  answers with the token's claims only: no `school`, no `person`, no `roles`.
  And its `tenant_id` is the CAS tenant SLUG, which `RequireTenant` cannot
  resolve — it parses the header as a UUID and otherwise looks it up by school
  `code`. `Registry.GetByCASTenant` exists and the middleware does not call it.
- **A tenant that cannot be established REFUSES rather than omits.** Forwarding
  without the header would produce a 400 from emerge-core that reads as a bug in
  the caller, when the fix is an env var on this server. The proxy answers 503
  `tenant_unconfigured`, 403 `tenant_refused` or 502 instead, each distinguishable.
- **`core` has no fallback base URL**, alone among the services. A default would
  point at a host by guessing, and the thing on the other end is one school's
  real people.
- **`GET /capabilities` describes; it never decides.** It chooses which controls
  to draw and nothing else — the same division as CAS feature keys, one level
  down. A 403 from the endpoint remains the answer.
- **Its `fields` answer is three-valued and all three differ.** `all: true`
  means the absence of a policy PERMITS everything. `enumerated: false` means
  the catalogue cannot name that area's columns, which is "cannot say" and not
  "nothing is permitted": read as a denial it hides inputs the caller was
  entitled to use. `lib/core/fields.ts` is the only place that is interpreted.
- **An absent field in a response is withheld, not empty.** emerge-core deletes
  a denied field rather than nulling it, and `omitempty` deletes a null one too,
  so the response alone cannot tell them apart. The read capability's own field
  policy — the same policy the projection used — is what separates them.
- **A profile edit sends only what changed.** A field the caller may not READ
  starts blank in the form, so submitting wholesale would erase a value they
  were never shown; and emerge-core checks the fields a request CARRIES, so an
  untouched unwritable column would turn a good edit into a 403 naming a field
  nobody touched.

## emerge-core, reading lists

- **`page.has_more` is derived, not counted.** `pageOf` sets it from
  `returned === limit` (`internal/transport/http/common.go`). There is no total
  and no page count, so every pager here is Previous/Next and says which rows
  are on screen, never how many exist. A last page that is exactly full reports
  `has_more: true` and the page after it is EMPTY — at a non-zero offset that
  is the end of the list, and it is drawn as such rather than as a failure.
- **`count` is not the length of the array.** It is taken before
  `projectPerRow` drops rows the caller is not covered for, so a page can show
  three of twelve, or none of twelve. The difference is reported as withheld.
  Rendering `count` as "N results" claims rows that are not on the page.
- **A field-restricted row loses its whole `edges` key**, before any column is
  considered (`project()` in `fields.go`). Since ent tags `edges` without
  `omitempty`, the PRESENCE of that key is an exact test for "no field policy
  narrowed this row" — which is the only way to tell a person with no record
  from a person you may not see. `fieldsIntact` is that test.
- **A detail panel takes its field list from the read capability**, not from a
  table in this repo. `fields.permitted` is the catalogue's own column list
  with a `name` for each, so labels and order are the API's. It also resolves
  the absent-field ambiguity: a column that IS permitted and has no value is
  genuinely unset, so it reads "Not set" rather than "not shown".
- **`breadth: not_applicable` is not a restriction.** Five areas have no `_all`
  key at all — `schools`, `academic_sessions`, `reference`, `sections`,
  `subject_offerings` — so there is nothing for a caller to be narrowed
  against. `showsSubsetOfSchool` returns true only for `narrowed`, so no screen
  can tell someone the timetable structure is a restricted view of itself.
- **The academic endpoints default to the CURRENT session, silently.** Nothing
  here sends `all_sessions`: it would put two years of Class 10 in one list
  with no column saying which. The screens name the session instead.
- **A class roll joins two endpoints on purpose.** `/enrollments` carries the
  roll number and, because `Basic()` is `WithSection().WithStudent()` with no
  person below it, no names; `/students?section_id=` carries the person edge
  and no roll number. The alternative is one `/persons/{id}` per student. The
  join is decoration: a student whose enrollment is out of reach keeps their
  place on the roll without a roll number, because two endpoints with two
  reaches must not be intersected into a shorter list than either returned.
- **`index_status` is `none` and resolution is `unindexed`, for everything.**
  Indexing sits behind a flag that is off. The material is present and
  readable; only search is missing. It is stated once per page rather than
  marked per row, because a mark per row reads as a catalogue of broken
  records.
- **Nothing uploads or downloads.** `POST /library/assets` needs an object
  store and answers 503 without one, and no link can be minted either. An item
  names its asset instead of offering a button that fails for a reason the user
  cannot see.
- **`restricted` is reported as itself.** A curriculum node with placements
  whose content the caller may not read is not "nothing here"; the difference
  is exactly what a teacher would ask about.

## Public demo

- **`PUBLIC_DEMO` is a separate flag from `DEV_BYPASS`, not a mode of it.**
  `DEV_BYPASS` is compiled out of a production build on purpose; the public demo
  needs the same fixture machinery in a production build, so it is read at
  runtime instead. Collapsing them would either drag the dev bypass into
  production or make the demo impossible to build. `DEV_BYPASS` does not imply
  `PUBLIC_DEMO`: serving a host with no sign-in has to be stated on purpose.
- **The `deploy/` bundle is shaped for one fixture-only host**,
  `labs.tryemerge.in`. It is not a general deployment path and must not become
  one while it sets `PUBLIC_DEMO=1`: that flag signs everyone in as the same
  fixture user. Real auth there means dropping the flag, a real
  `SESSION_SECRET`, a reachable CAS with this origin in `CAS_CORS_ORIGINS`, and
  `CAS_TRUSTED_PROXIES` set, which is still open below.

## Single sign-on, authenticator 2FA and step-up (2026-10-14)

Built to CAS's wire contract v1 (`CAS/docs/FEDERATION_MFA_STEPUP_PLAN.md` §8)
before CAS shipped it, so none of it has met a live CAS yet.

- **SSO is a flag, `CAS_SSO_ENABLED`.** Off, nothing changes: the password
  hand-off, CAS `/logout`, the security page and its top-bar link, the 2FA
  prompt and `SessionWatch` all check it. Only `client_id` on password sign-in
  follows `CAS_CLIENT_ID` alone. On, `/sign-in`
  redirects to `/auth/login`, which seals `{state, verifier}` into
  `emerge_sso_flow` (10 minutes, path `/auth`) and sends the browser to
  `/oauth/authorize` with PKCE S256. `/auth/callback` checks state, exchanges
  the code server-side with `CAS_CLIENT_SECRET`, and seals the pair into the
  usual `emerge_session` with `origin: 'sso'`.
- **The session records its origin.** An SSO session refreshes through
  `/oauth/token` (`grant_type=refresh_token`); a password session keeps
  `/v1/auth/refresh`. Cookies from before this change read as `password`.
- **Sign-out of an SSO session ends at CAS `/logout`**, which revokes the SSO
  session and every app session under it.
- **No silent `prompt=none` check.** Every page here needs a session, so a
  signed-out visitor is sent to CAS anyway, and CAS answers a live SSO cookie
  with a code and no page. A silent check would add a redirect and buy nothing.
- **A callback error never shows CAS's `error_description`.** It is a URL
  parameter anyone can craft, so the sign-in page shows a fixed message per kind.
- **Step-up is one global dialog.** `apiRequest` meets a 403
  `step_up_required`, asks `services/step-up-gate.ts`, the dialog mounted in
  `Providers` runs CAS start and verify through server actions, the session
  cookie is resealed with the re-minted access token (refresh token unchanged),
  and the request is retried once. The BFF proxy already relays a 403 and its
  `WWW-Authenticate` header untouched. Account-security server actions return
  `step_up_required` and go through the same gate with `withStepUpRetry`.
- **`ApiError.code` reads `code`, then `error`.** emerge-core's error body
  carries `error` and, additively, `code`.
- **The TOTP secret and recovery codes never reach `.fixtures-raw/`**:
  `RECORD_FIXTURES` skips `v1/me/mfa*` as it skips `v1/auth/*`.

## Theme

- **Colour never rotates.** One school, one brand. Only radius, density,
  ornament and motion change across grade bands.
- **The band axis was measured**, not invented, from the portal's own Junior vs
  Senior sets: 36px → 18px radius, 10.5px → 9.5px type, 31 → 17 illustrations.
- **Band resolves server-side** so the first paint is correct. Client-side would
  paint the default and visibly re-skin.

## Deliberately not built

- Client-side entitlement cache, encryption, integrity checks, refetch budgets,
  circuit breakers, epoch polling, all solve problems the BFF removed.
- OpenFeature / a flag vendor, one flag source, no A/B.
- Extra state library, axios, nothing to intercept.
- Committed tests, house rule. `src/lib/` is pure so it can be driven from Node.

## Open

- **`CAS_TRUSTED_PROXIES` unset**, behind a BFF, CAS's per-IP throttle becomes
  tenant-wide. **Blocking for shared deployment.**
- Persona switcher unverified, no seeded user has two designations.
- Widgets can't be disabled independently until `emerge.home.*` keys exist.
- Single instance or sticky sessions, the refresh latch is per-process.
