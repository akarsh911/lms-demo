# LMS Demo by Emerge (Harbour AI)

An AI-native learning management system built for the Emerge by Harbour AI hackathon. It is one product for every person in a school: students, teachers, principals, administrators and parents. Each person sees only what their role allows, and AI tools are built into the daily work rather than bolted on.

Live demo: https://lms-demo.tryemerge.in

## What it does

- **Persona dashboards:** separate home screens for student, teacher, principal, administrator and parent, driven by entitlements instead of hard-coded roles.
- **School operations:** people, classes, attendance, timetable, homework, grades, fees, leave, notices and the school calendar.
- **AI teaching tools:** lesson planner, paper setter, answer checker, gap analyzer, GRASP assessments, flashcards and mind maps, grounded in the class's own books.
- **Debate room:** students debate an AI opponent by voice in a chamber-style room with a moderator clock and turn-by-turn speech. They then receive an adjudication report with scores, strengths, weaknesses and fallacies spotted.
- **Jerry:** a study companion that answers from course material with citations.

## Repository layout

| Folder | What it is | Stack |
|---|---|---|
| `frontend/` | The web app: every persona, screen and AI tool | Next.js, React, TypeScript, MUI |
| `core/` | The backend: schools, people, classes and curriculum, with one database per school and a control plane | Go, Ent, chi, PostgreSQL, gRPC |

Each folder has its own README with the full detail.

## Running locally

Backend (port 8081):

```bash
cd core
cp .env.example .env
./scripts/genkey.sh        # put the output in SECRETS_MASTER_KEY
./scripts/dev.sh           # starts the databases, migrates and runs the server
```

Frontend (port 3005):

```bash
cd frontend
cp .env.example .env.local # set SESSION_SECRET to the output of: openssl rand -base64 32
npm install
npm run dev
```

Then open http://localhost:3005.

## How it fits together

- **Identity and access:** sign-in and permissions come from CAS, Emerge's identity service. The frontend never trusts a role name; every route, section and panel is gated by a feature key.
- **One database per school:** schools are isolated. The control plane picks the school's database for each request.
- **AI tools:** these run as separate engines behind the Emerge plugin marketplace and are reached through the frontend's server-side relay, so tokens stay in an HttpOnly session cookie and never reach the browser.

## Team

Built by the Emerge team at Harbour AI.
