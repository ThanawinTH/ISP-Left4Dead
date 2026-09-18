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

The system provides one classroom workspace with four roles. A lecturer creates a classroom
and shares a join code; everyone who joins is a **Student** by default, and the lecturer promotes
selected members to **TA** or **University Staff**. Inside the classroom, staff create and manage
assignments with deadlines and assigned TAs, post announcements, coordinate privately in a
staff-only channel, and receive student file submissions against a deadline. Students get a
read-only schedule of class-visible assignments and can upload their own work.

Sign-in is delegated to Google OAuth2 and restricted to `@ku.th` accounts, so the system stores
no passwords.

### Scope of this iteration

| In scope | Out of scope |
|---|---|
| Classroom setup, join code, membership and roles | Grading, scores, rubrics, feedback on submissions |
| Assignment management + at-risk detection | Class-wide chat open to students |
| Class announcements | Person-to-person direct messages |
| Staff-only message channel | Multiple named channels |
| File submission against an assignment deadline | Real-time push delivery, read receipts, mentions |
| Read-only student schedule view | |

---

## Team members

| Name | Student ID | GitHub |
|---|---|---|
| Kantanut Utamapongchai | 6810545468 | [@kan1243](https://github.com/kan1243) |
| Thanawin Thanapornthawan | 6810545654 | [@ThanawinTH](https://github.com/ThanawinTH) |
| Phutarak Wongpitak | 6810545841 | [@phutharakw-cmyk](https://github.com/phutharakw-cmyk) |
| Pakhin Daonan | 6810545859 | [@pakhindaonan-netizen](https://github.com/pakhindaonan-netizen) |

---

## Current project status

> **Phase: Iteration 2 complete — roles and assignments working end to end.**

| Deliverable | Status |
|---|---|
| Software Requirement Specification (SRS-1 … SRS-27) | ✅ Complete |
| KAOS goal refinement (SG-1 … SG-5) | ✅ Complete |
| Use case diagram + use case table | ✅ Complete |
| User stories & User Requirement Specification | ✅ Complete |
| Activity diagrams (AD-1 … AD-8) | ✅ Complete |
| Software Proposal — architecture, data storage, dev environment | ✅ Complete |
| Sequence diagrams (SQD) | ✅ Complete |
| Traceability matrix (Sub-Goal → SRS → SQD) | ✅ Complete |
| Iteration 1 report | ✅ Complete |
| Iteration 2 report | 🟡 Written, not yet in `docs/` |
| Project schedule (Gantt / Plane export) | ✅ Complete |
| UI mockups (Figma) | ✅ Complete |
| Application source code | 🟡 In progress |
| Database schema (5 tables) | 🟡 In progress |
| Docker Compose environment | ✅ Complete |
| Test suite | 🟡 Manual only — 25 documented test cases, no automation |

The application runs. `source/` holds a working Express + MySQL backend and the front-end
pages built from the Figma mockups; all design and documentation artefacts stay under `docs/`.

### What works so far

| Area | Stories | State |
|---|---|---|
| Sign in, restricted to `@ku.th` (SRS-27) | — | ✅ Working |
| Create a classroom + unique join code (SRS-1, SRS-2) | US-1, US-2 | ✅ Working |
| Join a classroom by code, as Student (SRS-4, SRS-5) | US-3 | ✅ Working |
| Member list and role management (SRS-6, SRS-7) | US-4 | ✅ Working |
| Create an assignment, assign TAs, draft vs posted (SRS-8, SRS-10, SRS-13, SRS-14) | US-5 | ✅ Working |
| Update an assignment from the details panel (SRS-13) | US-6 | ✅ Working |
| Google OAuth2 sign-in (SRS-26) | US-16 | ⬜ Deferred to Iteration 3 |
| Announcements and staff channel (SRS-15 … SRS-20) | — | ⬜ Not built |
| File submissions (SRS-21 … SRS-25) | — | ⬜ Not built |

**Roles.** All four SRS roles now exist in the schema —
`memberships.role ENUM('lecturer','ta','staff','student')`. A member's role is read from the
database on every request, not cached in the session, so a promotion takes effect immediately
without the member signing out and back in.

One deliberate gap remains against the SRS:

- **Sign-in uses email + password as a stand-in for Google OAuth2.** Passwords are hashed with
  scrypt and never stored in plain text, and the `@ku.th` domain check (SRS-27) is already
  enforced — but SRS-26 requires no passwords at all, so this part gets replaced in Iteration 3.

Two smaller known gaps:

- **Reset Code** on the Members page shows *"not built yet"*. SRS-2 allows the lecturer to
  regenerate a join code, but no endpoint exists for it.
- **Assignments cannot be deleted.** Create, read and update are implemented; delete was left out
  deliberately rather than lose the record of an assignment.

---

## Where to find documents and diagrams

```
ISP-Left4Dead/
├── docs/                                  ← all documentation and design artefacts
│   ├── SRS_Left4Dead.pdf                  Software Requirement Specification
│   ├── SoftwareProposal_Left4Dead.pdf     Architecture, data storage, dev environment, sequence diagrams
│   ├── Left4Dead_Iteration1_Report.pdf    Iteration 1 progress report
│   ├── SRS_ActivityDiagrams_drawio/
│   │   └── AD-1.json … AD-8.json          activity diagrams as structured JSON exports
│   └── Gannt Chart/
│       └── first_po-*.json                project schedule exported from Plane
└── source/                                ← the application
    ├── README.md                          how to run it, API list, what works
    ├── backend/
    │   ├── docker-compose.yml             app + MySQL containers
    │   ├── Dockerfile                     node:20-alpine
    │   ├── package.json                   express, express-session, mysql2
    │   ├── server.js                      app entry point, session + static files
    │   ├── db/schema.sql                  users, classrooms, memberships, assignments, assignment_staff
    │   └── src/
    │       ├── db.js                      MySQL pool, q() and one() helpers
    │       ├── auth.js                    sign-in, scrypt hashing, @ku.th check, requireAuth,
    │       │                              loadMembership, requireOwner, requireStaff
    │       ├── classrooms.js              list, create, join, join-code generation
    │       ├── members.js                 member list, role changes (US-4)
    │       ├── assignments.js             list, create, update assignments (US-5, US-6)
    │       └── routes.js                  API route table
    └── frontend/
        ├── index.html                     sign in
        ├── my-classrooms.html             classroom list + join by code
        ├── create-classroom.html          create a classroom
        ├── class-schedule.html            assignment list grouped by due date + details panel
        ├── members.html                   members and roles (US-4)
        ├── create-assignment.html         create / update an assignment (US-5, US-6)
        ├── css/styles.css
        └── js/
            ├── app.js                     toast + clipboard helpers
            ├── api.js                     fetch wrapper, sidebar user, sign-out
            ├── members.js                 member table, inline role editing
            ├── schedule.js                assignment grouping, list and details panel
            └── create-assignment.js       the assignment form, in create and update mode
```

| Looking for… | Go to |
|---|---|
| Requirements, use cases, user stories, URS/SRS | `docs/SRS_Left4Dead.pdf` |
| Architecture, data storage and environment decisions | `docs/SoftwareProposal_Left4Dead.pdf` |
| Sequence diagrams (SQD) and the traceability matrix | `docs/SoftwareProposal_Left4Dead.pdf` |
| Activity diagrams (AD-1 … AD-8) | `docs/SRS_ActivityDiagrams_drawio/` |
| Project schedule and task breakdown | `docs/Gannt Chart/` |
| Progress narrative for the iteration | `docs/Left4Dead_Iteration1_Report.pdf` |
| How to run the app, API endpoints, what works | `source/README.md` |
| Backend code and database schema | `source/backend/` |
| Front-end pages built from the Figma mockups | `source/frontend/` |

### Activity diagrams

Each diagram is committed as **`AD-n.json`** — a structured export listing every node (`start`,
`action`, `decision`, `error`, `end`) and every edge with its `[Yes]` / `[No]` label. JSON is
readable in any editor and reviewable in a pull request diff, unlike draw.io's XML.

The editable `.drawio` sources are kept by their authors and are not committed. To view a diagram
visually, import its JSON at [app.diagrams.net](https://app.diagrams.net) or read it directly —
the node and edge lists are plain text.

### Project schedule

The Gantt data is a JSON export from [Plane](https://plane.so). To regenerate it:
**Workspace Settings → Exports →** select the project **→ JSON → Export**, then download from
*Previous exports* (links expire after 7 days).

---

## Technology stack

Decided in the Software Proposal. Everything below is in place except authentication, which
still uses an email + password stand-in.

| Layer | Technology | Why |
|---|---|---|
| Architecture | Modular Monolith (MVC) | Keeps one deployment while isolating the role/permission checks that most requirements depend on |
| Backend | Node.js + Express | Single language across the team; serves the views and the API |
| Frontend | HTML, CSS, client-side JavaScript | No build step to maintain |
| Database | MySQL 8.0 | Relational data with one authoritative role row per member per classroom |
| File storage | Named Docker volume | Keeps uploaded submissions out of the database and out of the image |
| Authentication | Google OAuth2, restricted to `@ku.th` | No passwords stored (SRS-26); non-university identities rejected (SRS-27). **Currently email + password with scrypt hashing; the `@ku.th` check is live, OAuth2 is not** |
| Environment | Docker + Docker Compose | Same runtime, MySQL version and time zone on all four laptops and the demo machine |

### Database schema

| Table | Holds |
|---|---|
| `users` | one row per person — email, display name, scrypt password hash |
| `classrooms` | name, semester, subject code, unique join code, owner |
| `memberships` | one role per person per classroom — `lecturer` / `ta` / `staff` / `student` |
| `assignments` | title, description, points, due date, visibility, staff deadline, staff note |
| `assignment_staff` | which TAs are responsible for which assignment (many-to-many) |

`assignment_staff` is a separate table rather than a column on `assignments`, because an
assignment can be given to more than one TA.

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

Stop with `Ctrl+C`.

> **Note the working directory:** `docker-compose.yml` lives in `source/backend/`, not at the
> repository root. Running `docker compose` anywhere else will not find it.

`docker compose` — two words — is Compose v2 and ships with Docker Desktop. The older
hyphenated `docker-compose` script is retired.

### If you pulled a schema change, you must reset the database

MySQL runs `db/schema.sql` **only once** — the first time the `dbdata` volume is created. After
that it is ignored. So when someone changes `schema.sql`, pulling their commit is not enough:
your database still has the old tables, the app starts normally, and then every page that uses
the new tables fails.

```bash
docker compose down -v        # deletes the dbdata volume
docker compose up --build     # recreates it, so schema.sql runs again
```

This **wipes every account, classroom and assignment** on your machine. There is no way to keep
the old data and get the new tables — the old data is what blocks them.

Check it worked:

```bash
docker compose ps             # PORTS must read 0.0.0.0:3000->3000/tcp
docker compose exec db mysql -uroot -ppassword ku_classroom -e "SHOW TABLES;"
```

`SHOW TABLES` must list five tables: `assignment_staff`, `assignments`, `classrooms`,
`memberships`, `users`. If `assignments` is missing, the reset did not happen.

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
2. Commit in small, described steps — one commit per task, not one per story
3. Open a pull request into `main` and have another member review it
4. Keep documents and diagrams in step: if a requirement changes, update the SRS **and** the
   affected activity diagram JSON
5. If your change touches `db/schema.sql`, say so in the commit message — everyone else has to
   run `docker compose down -v` before your commit will work on their machine

---

## Course context

This repository is coursework for **Individual Software Development Process' 2026** at Kasetsart
University. The system is built for the department's own lecturers and TAs — the stakeholder for
this challenge is the course staff themselves.
