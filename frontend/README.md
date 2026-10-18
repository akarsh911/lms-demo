# Emerge — front end

Entitlement-driven LMS. Every route, section and panel is gated by a CAS feature
key. No roles anywhere...

---

## Run

```sh
export PATH="/opt/homebrew/bin:$PATH"

# CAS must be up first — every page needs it
cd ../CAS && (set -a; . ./.env; set +a; go run ./cmd/casd)   # :8080

cp .env.example .env.local     # set SESSION_SECRET
npm install
npm run dev                    # :3005
```

- `SESSION_SECRET` → `openssl rand -base64 32`. Seals the session cookie; **never reaches the browser**.

---

## Sign in

Passwordless. Enter the email, press *Send code* — in dev the code shows in the form.

| Account | Band | Why it's interesting |
|---|---|---|
| `emerge.teacher@mentis.local` | Senior | Class 10 |
| `emerge.student@mentis.local` | Senior | fewest features |
| `emerge.parent@mentis.local` | Middle | **scoped** attendance grant |
| `emerge.principal@mentis.local` | Middle | **kill-switched** feature |
| `superadmin@mentis.local` | Middle | **zero** feature keys |

---

## Scripts

| | |
|---|---|
| `npm run dev` | :3005 |
| `npm run build` | runs `check:routes` first |
| `npm run lint` | `eslint .` — `next lint` was removed in Next 16 |
| `npm run typecheck` | `tsc --noEmit`, strict |
| `npm run check:routes` | registry integrity |

No test files (house rule). Verify in real Chrome, or a throwaway Node harness.

---

## Docs

| | |
|---|---|
| `docs/ONBOARDING.md` | **start here** — how to build anything |
| `docs/STRUCTURE.md` | what every folder is for |
| `docs/THEMING.md` | tokens, grade bands, logo |
| `docs/DECISIONS.md` | why it's built this way |
| `/design` | living reference — every primitive, band-switchable |

---

## Blocking for shared deployment

- **`CAS_TRUSTED_PROXIES` is unset.** Behind this BFF every CAS call shares one
  IP, so the per-IP throttle becomes tenant-wide — and a throttled refresh signs
  everyone out at the next 15-minute boundary.
