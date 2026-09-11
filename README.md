# ISP-Left4Dead — Course Support & Activity Dashboard

**Course:** Individual Software Development Process' 2026 (ISP – SKE26)
**Chosen IRL Challenge:** Project D — Course Support & Activity Dashboard
**Team:** Left4Dead

---

## About the project

Course staff currently coordinate assignment deadlines, lab sessions, consultation slots,
project milestones, and small internal tasks across a mix of spreadsheets, calendar entries,
chat groups, and email threads. No single place shows what is happening when, which work is
at risk, or who owns it — and new TAs have no way to learn the course rhythm.

**G-0: Maintain an accurate and integrated view of course support activities across a semester.**

The system provides one classroom workspace with three roles. A lecturer creates a classroom
and shares a join code; everyone who joins is a **Student** by default, and the lecturer promotes
selected members to **TA**. Inside the classroom, staff manage course activities with automatic
at-risk detection (Overdue / Due Soon / Unassigned), post announcements, coordinate privately in
a staff-only channel, and receive student file submissions against a deadline. Students get a
read-only schedule of class-visible activities and can upload their own work.

Sign-in is delegated to Google OAuth2 and restricted to `@ku.th` accounts, so the system stores
no passwords.

### Scope of this iteration

| In scope | Out of scope |
|---|---|
| Classroom setup, join code, membership and roles | Grading, scores, rubrics, feedback on submissions |
| Course activity management + at-risk detection | Class-wide chat open to students |
| Class announcements | Person-to-person direct messages |
| Staff-only message channel | Multiple named channels |
| File submission against an activity deadline | Real-time push delivery, read receipts, mentions |
| Read-only student schedule view | |

---

## Team members

| Name | Student ID | GitHub |
|---|---|---|
| Kantanut Utamapongchai | 6810545468 | [@kan1243](https://github.com/kan1243) |
| Thanawin Thanapornthawan | 6810545654 | [@ThanawinTH](https://github.com/ThanawinTH) |
| Phutarak Wongpitak | 6810545841 | [@phutharakw-cmyk](https://github.com/phutharakw-cmyk) |
| Pakhin Daonan | 6810545859 | [@pakhind-blip](https://github.com/pakhind-blip) |

---

## Current project status

> **Phase: Design & documentation complete — implementation in progress.**

| Deliverable | Status |
|---|---|
| Software Requirement Specification (SRS-1 … SRS-27) | ✅ Complete |
| KAOS goal refinement (SG-1 … SG-5) | ✅ Complete |
| Use case diagram + use case table | ✅ Complete |
| User stories & User Requirement Specification | ✅ Complete |
| Activity diagrams (AD-1 … AD-8) | ✅ Complete |
| Software Proposal — architecture, data storage, dev environment | ✅ Complete |
| Sequence diagrams (SQD) | ✅ Complete |
| Traceability matrices (Sub-Goal → SRS, SRS → SQD) | ✅ Complete |
| Iteration 1 report | ✅ Complete |
| Project schedule (Gantt / Plane export) | ✅ Complete |
| UI mockups (Figma) | ✅ Complete |
| Application source code | 🟡 In progress |
| Database schema (`users`, `classrooms`, `memberships`) | 🟡 In progress |
| Docker Compose environment | ✅ Complete |
| Test suite | ⬜ Not started |

The application now runs. `source/` holds a working Express + MySQL backend and the front-end
pages built from the Figma mockups; all design and documentation artefacts stay under `docs/`.

### What works so far

| Area | State |
|---|---|
| Sign in, restricted to `@ku.th` (SRS-27) | ✅ Working |
| Create a classroom + unique join code (SRS-1, SRS-2) | ✅ Working |
| Join a classroom by code, as Student (SRS-4, SRS-5, SRS-6) | ✅ Working |
| Classroom list and classroom header | ✅ Working |
| Activities, at-risk detection, schedule (SRS-8 … SRS-14) | ⬜ Not built |
| Announcements and staff channel (SRS-15 … SRS-20) | ⬜ Not built |
| File submissions (SRS-21 … SRS-25) | ⬜ Not built |

Two deliberate gaps against the SRS, both to be closed before the final iteration:

- **Sign-in uses email + password as a stand-in for Google OAuth2.** Passwords are hashed with
  scrypt and never stored in plain text, and the `@ku.th` domain check (SRS-27) is already
  enforced — but SRS-26 requires no passwords at all, so this part gets replaced.
- **Only two roles exist** (`lecturer`, `student`). The **TA** role from the SRS is not in the
  schema yet.

---

## Where to find documents and diagrams

```
ISP-Left4Dead/
├── docs/                                  ← all documentation and design artefacts
│   ├── SRS_Left4Dead.pdf                  Software Requirement Specification
│   ├── SoftwareProposal_Left4Dead.pdf     Architecture, data storage, dev environment, sequence diagrams
│   ├── Left4Dead_Iteration1_Report.pdf    Iteration 1 progress report
│   ├── SRS_ActivityDiagrams_drawio/       Activity diagrams AD-1 … AD-8
│   │   ├── AD-n.drawio                    editable draw.io source
│   │   └── AD-n.json                      structured export (nodes + edges, diff-friendly)
│   └── Gannt Chart/
│       └── first_po-*.json                project schedule exported from Plane
└── source/                                ← the application
    ├── README.md                          how to run it, API list, what works
    ├── backend/
    │   ├── docker-compose.yml             app + MySQL containers
    │   ├── Dockerfile                     node:20-alpine
    │   ├── package.json                   express, express-session, mysql2
    │   ├── server.js                      app entry point, session + static files
    │   ├── db/schema.sql                  users, classrooms, memberships
    │   └── src/
    │       ├── db.js                      MySQL pool, q() and one() helpers
    │       ├── auth.js                    sign-in, scrypt hashing, @ku.th check, requireAuth
    │       ├── classrooms.js              list, create, join, join-code generation
    │       └── routes.js                  API route table
    └── frontend/
        ├── index.html                     sign in
        ├── my-classrooms.html             classroom list + join by code
        ├── create-classroom.html          create a classroom
        ├── class-schedule.html            classroom header + join code
        ├── css/styles.css
        └── js/
            ├── app.js                     toast + clipboard helpers
            └── api.js                     fetch wrapper, sidebar user, sign-out
```

| Looking for… | Go to |
|---|---|
| Requirements, use cases, user stories, URS/SRS | `docs/SRS_Left4Dead.pdf` |
| Architecture, data storage and environment decisions | `docs/SoftwareProposal_Left4Dead.pdf` |
| Sequence diagrams (SQD) and traceability matrices | `docs/SoftwareProposal_Left4Dead.pdf` |
| Activity diagrams (AD-1 … AD-8) | `docs/SRS_ActivityDiagrams_drawio/` |
| Project schedule and task breakdown | `docs/Gannt Chart/` |
| Progress narrative for the iteration | `docs/Left4Dead_Iteration1_Report.pdf` |
| How to run the app, API endpoints, what works | `source/README.md` |
| Backend code and database schema | `source/backend/` |
| Front-end pages built from the Figma mockups | `source/frontend/` |

### Activity diagrams

Each diagram is stored twice, on purpose:

- **`AD-n.drawio`** — the editable source. Open at [app.diagrams.net](https://app.diagrams.net)
  → **File → Open From → Device**.
- **`AD-n.json`** — a structured export listing every node (`start`, `action`, `decision`,
  `error`, `end`) and every edge with its `[Yes]` / `[No]` label. Readable in any editor and
  reviewable in a pull request diff, unlike the XML.

> Note: `AD-7` is saved as `AD-7.drawio.txt`. draw.io still opens it, but renaming it to
> `AD-7.drawio` would keep the set consistent.

### Project schedule

The Gantt data is a JSON export from [Plane](https://plane.so). To regenerate it:
**Workspace Settings → Exports →** select the project **→ JSON → Export**, then download from
*Previous exports* (links expire after 7 days).

---

## Planned technology stack

Decided in the Software Proposal. Everything below is now in place except authentication, which
still uses an email + password stand-in.

| Layer | Technology | Why |
|---|---|---|
| Architecture | Modular Monolith (MVC) | Keeps one deployment while isolating the role/permission checks that most requirements depend on |
| Backend | Node.js + Express | Single language across the team; serves the views and the API |
| Frontend | HTML, CSS, client-side JavaScript | Server-rendered views, no build step to maintain |
| Database | MySQL | Relational data with one authoritative role row per member per classroom |
| File storage | Named Docker volume | Keeps uploaded submissions out of the database and out of the image |
| Authentication | Google OAuth2, restricted to `@ku.th` | No passwords stored (SRS-26); non-university identities rejected (SRS-27). **Currently email + password with scrypt hashing; the `@ku.th` check is already live, OAuth2 is not** |
| Environment | Docker + Docker Compose | Same runtime, MySQL version and time zone on all four laptops and the demo machine |

---

## Getting started

**Prerequisites:** Docker Desktop installed and showing *Engine running* (WSL 2 backend on
Windows). Nothing else — Node and MySQL both run inside containers, so there is no local install
and no `.env` to fill in.

```bash
git clone https://github.com/ThanawinTH/ISP-Left4Dead.git
cd ISP-Left4Dead/source/backend

docker compose up --build     # starts the Express app and the MySQL container
```

Open **http://localhost:3000**. Sign in with any `@ku.th` email and a password of at least six
characters — the first sign-in for an address creates the account, and after that the password
has to match.

Stop with `Ctrl+C`. `docker compose down -v` also deletes the database volume, so the next start
is a clean database.

> **Note the working directory:** `docker-compose.yml` lives in `source/backend/`, not at the
> repository root. Running `docker compose` anywhere else will not find it.

`docker compose` — two words — is Compose v2 and ships with Docker Desktop. The older
hyphenated `docker-compose` script is retired.

### Before this is deployed anywhere

The database password and session secret are currently written into `docker-compose.yml` as
development defaults (`password`, `dev-secret`). That is fine on a laptop, but they must move to
a git-ignored `.env` before the app runs anywhere real — along with the Google OAuth2 client ID
and secret once SRS-26 is implemented.

> `.env` is git-ignored on purpose — **never commit OAuth2 credentials or database passwords.**
> Add a placeholder `.env.example` instead, listing the variable names with empty values.

---

## Contributing (team workflow)

1. Branch from `main` — `feature/<short-description>` or `fix/<short-description>`
2. Commit in small, described steps
3. Open a pull request into `main` and have another member review it
4. Keep documents and diagrams in step: if a requirement changes, update the SRS **and** the
   affected `.drawio` file **and** re-export its `.json`

---

## Course context

This repository is coursework for **Individual Software Development Process' 2026** at Kasetsart
University. The system is built for the department's own lecturers and TAs — the stakeholder for
this challenge is the course staff themselves.
