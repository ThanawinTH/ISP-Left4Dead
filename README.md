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
assignments with deadlines and assigned TAs, post announcements with files attached, coordinate
privately in a staff-only channel, track internal work on a task board, keep one schedule of
labs, consultations and milestones, and receive and grade student submissions. Every member
also gets one To-do page covering every class they belong to.

Sign-in is delegated to Google OAuth2 and restricted to `@ku.th` accounts, so the system stores
no passwords — there is no password column in the schema.

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

> **Phase: Iteration 5 complete — the system covers five of the seven Project D required features.**

| Deliverable | Status |
|---|---|
| Software Requirement Specification (SRS-1 … SRS-27) | ✅ Complete |
| KAOS goal refinement (SG-1 … SG-5) | ✅ Complete |
| Use case diagram + use case table | ✅ Complete |
| User stories & User Requirement Specification | 🟡 US-17, US-18, US-19 built but not in the SRS — addendum due in Iteration 6 |
| Activity diagrams (AD-1 … AD-9) | ✅ Complete |
| Software Proposal — architecture, data storage, dev environment | ✅ Complete |
| Sequence diagrams (SQD-1 … SQD-6) | ✅ Complete |
| Traceability matrix (Sub-Goal → SRS → SQD) | ✅ Complete |
| Iteration 1–5 reports | ✅ Complete |
| Project schedule (Gantt / Plane export) | ✅ Complete |
| UI mockups (Figma) | ✅ Complete |
| Application source code | ✅ All 19 stories implemented |
| Database schema (12 tables) | ✅ Complete |
| Docker Compose environment | ✅ Complete |
| Test suite | 🟡 Manual only — automation is the first Iteration 6 task |

### What works

| Area | Stories | SRS | State |
|---|---|---|---|
| Google sign-in, restricted to `@ku.th`, no passwords stored | US-16 | SRS-26, 27 | ✅ |
| Create a classroom, unique join code, reset the code | US-1, US-2 | SRS-1, 2 | ✅ |
| Join by code, always as Student | US-3 | SRS-4, 5 | ✅ |
| Members and roles, remove a member | US-4 | SRS-6, 7 | ✅ |
| Create and edit assignments, topics, draft vs posted, assign TAs | US-5, US-6 | SRS-8, 10, 13, 14 | ✅ |
| Classroom dashboard and at-risk highlighting | US-7, US-8 | SRS-12, 13 | ✅ |
| Student class schedule | US-9 | SRS-14 | ✅ |
| Announcements, with files and links attached | US-10, US-11 | SRS-15 … 17 | ✅ |
| Class chat, and a staff-only channel students cannot reach | US-12, US-13 | SRS-18 … 20 | ✅ |
| Student file and link submission, late marking | US-14 | SRS-21 … 24 | ✅ |
| Submission list and grading, read-only for roles that may not grade | US-15 | SRS-25 | ✅ |
| Class schedule — labs, consultations, milestones and due dates in one view | US-17 | — | ✅ |
| Internal staff task board — Open, In progress, Done | US-18 | — | ✅ |
| To-do across every class, split by the role held in each | US-19 | — | ✅ |

### Known gaps

Three honest ones, all carried into Iteration 6:

- **No automated tests.** Every check is run by hand before a demo. This was an action item in
  the Iteration 3, 4 and 5 reports and is risk **R-05**.
- **Search is client-side.** The To-do and schedule search boxes filter rows the page has
  already downloaded. The Project D requirement asks for a server-side query across activities,
  tasks and announcements. No `/api/search` endpoint exists yet.
- **No `admin` role.** `memberships.role` is `ENUM('lecturer','ta','staff','student')`. The
  Admin role named in the requirement list has no value in the enum, so it does not exist.

And one documentation gap: **US-17, US-18 and US-19 are built but have no SRS requirement
behind them** (risk **R-04**). The Project D requirement list reached the team after the SRS was
submitted. An addendum with their SRS numbers and traceability rows is the first writing task
of Iteration 6.

**Roles.** A member's role is read from the database on every request, never cached in the
session, so a promotion takes effect immediately without signing out and back in.

---

## Repository layout

```
ISP-Left4Dead/
├── docs/                                  ← all documentation and design artefacts
│   ├── SRS_Left4Dead.pdf                  Software Requirement Specification
│   ├── SoftwareProposal_Left4Dead.pdf     Architecture, data storage, sequence diagrams
│   ├── Left4Dead_Iteration1-5_Report.pdf  iteration progress reports
│   ├── SRS_ActivityDiagrams_drawio/       AD-1.json … AD-9.json
│   └── Gannt Chart/                       project schedule exported from Plane
└── source/                                ← the application
    ├── README.md                          how to run it, API list, what works
    ├── backend/
    │   ├── docker-compose.yml             app + MySQL containers
    │   ├── Dockerfile                     node:20-alpine
    │   ├── package.json                   express, express-session, mysql2
    │   ├── server.js                      app entry point, session + static files
    │   ├── db/schema.sql                  12 tables
    │   └── src/
    │       ├── db.js                      MySQL pool, q() and one() helpers
    │       ├── auth.js                    Google OAuth2, @ku.th check, requireAuth,
    │       │                              loadMembership, requireOwner, requireStaff
    │       ├── classrooms.js              list, create, join, join-code generation and reset
    │       ├── members.js                 member list, role changes, removal (US-4)
    │       ├── assignments.js             list, create, update, status, delete (US-5 … US-9)
    │       ├── topics.js                  assignment topics
    │       ├── announcements.js           class announcements (US-10, US-11)
    │       ├── attachments.js             files and links on assignments and announcements
    │       ├── files.js                   shared upload rules — size, type, link checks
    │       ├── submissions.js             student submissions and grading (US-14, US-15)
    │       ├── chat.js                    class channel and staff channel (US-12, US-13)
    │       ├── tasks.js                   internal staff tasks (US-18)
    │       ├── timeline.js                class schedule events (US-17)
    │       ├── todo.js                    what is due across every class (US-19)
    │       └── routes.js                  API route table
    └── frontend/
        ├── index.html                     sign in with Google
        ├── my-classrooms.html             classroom list + join by code
        ├── create-classroom.html          create a classroom
        ├── class-schedule.html            assignments, details panel, submission and grading
        ├── members.html                   members and roles (US-4)
        ├── create-assignment.html         create / update an assignment (US-5, US-6)
        ├── announcements.html             announcements with attachments (US-10, US-11)
        ├── create-announcement.html       post an announcement
        ├── chat.html                      class chat (US-12, US-13)
        ├── admin.html                     staff chat and the task board (US-13, US-18)
        ├── create-task.html               new internal task (US-18)
        ├── timeline.html                  class schedule, list and month views (US-17)
        ├── create-event.html              add a lab, consultation or milestone (US-17)
        ├── todo.html                      to-do across all classes (US-19)
        ├── css/styles.css
        └── js/                            one file per page, plus app.js and api.js
```

| Looking for… | Go to |
|---|---|
| Requirements, use cases, user stories, URS/SRS | `docs/SRS_Left4Dead.pdf` |
| Architecture, data storage and environment decisions | `docs/SoftwareProposal_Left4Dead.pdf` |
| Sequence diagrams (SQD) and the traceability matrix | `docs/SoftwareProposal_Left4Dead.pdf` |
| Activity diagrams (AD-1 … AD-9) | `docs/SRS_ActivityDiagrams_drawio/` |
| Project schedule and task breakdown | `docs/Gannt Chart/` |
| Progress narrative for each iteration | `docs/Left4Dead_Iteration*_Report.pdf` |
| How to run the app, API endpoints, what works | `source/README.md` |
| Backend code and database schema | `source/backend/` |
| Front-end pages built from the Figma mockups | `source/frontend/` |

### Activity diagrams

Each diagram is committed as **`AD-n.json`** — a structured export listing every node (`start`,
`action`, `decision`, `error`, `end`) and every edge with its `[Yes]` / `[No]` label. JSON is
readable in any editor and reviewable in a pull request diff, unlike draw.io's XML.

The editable `.drawio` sources are kept by their authors and are not committed. To view a diagram
visually, import its JSON at [app.diagrams.net](https://app.diagrams.net) or read it directly.

### Project schedule

The Gantt data is a JSON export from [Plane](https://plane.so). To regenerate it:
**Workspace Settings → Exports →** select the project **→ JSON → Export**, then download from
*Previous exports* (links expire after 7 days).

---

## Technology stack

Decided in the Software Proposal, and now fully in place.

| Layer | Technology | Why |
|---|---|---|
| Architecture | Modular Monolith (MVC) | Keeps one deployment while isolating the role checks that most requirements depend on |
| Backend | Node.js + Express | Single language across the team; serves the views and the API |
| Frontend | HTML, CSS, client-side JavaScript | No build step to maintain |
| Database | MySQL 8.0 (InnoDB) | Relational data with one authoritative role row per member per classroom |
| File storage | Stored in the row as `LONGBLOB` | Files are deleted with their parent and need no separate volume to keep in step |
| Authentication | Google OAuth2, restricted to `@ku.th` | No passwords stored (SRS-26); non-university identities rejected (SRS-27) |
| Environment | Docker + Docker Compose | Same runtime, MySQL version and time zone on all four laptops and the demo machine |

### Database schema — 12 tables

| Table | Holds |
|---|---|
| `users` | one row per person — email and display name. **No password column** |
| `classrooms` | name, semester, subject code, unique join code, owner |
| `memberships` | one role per person per classroom — `lecturer` / `ta` / `staff` / `student` |
| `assignments` | title, topic, description, points, due date, visibility, staff deadline, late flag |
| `assignment_staff` | which TAs are responsible for which assignment (many-to-many) |
| `announcements` | class notices, newest first |
| `attachments` | files and links staff attach to an assignment **or** an announcement |
| `submissions` | what a student hands in — files and links sharing one batch id |
| `grades` | one grade per student per assignment, kept apart from the submission |
| `chat_messages` | both channels — `class` and `staff` — in one table |
| `staff_tasks` | internal work: title, assignee, status, due date, closed time |
| `timeline_events` | labs, consultations and milestones on the class schedule |

Two shapes worth explaining:

- **`assignment_staff` is a separate table**, not a column on `assignments`, because an
  assignment can be given to more than one TA.
- **`grades` is separate from `submissions`**, so handing work in again does not wipe a grade,
  and a student who handed in nothing can still be given 0.

---

## Getting started

**Prerequisites:** Docker Desktop installed and showing *Engine running* (WSL 2 backend on
Windows), plus a Google OAuth2 client — see below.

```bash
git clone https://github.com/ThanawinTH/ISP-Left4Dead.git
cd ISP-Left4Dead/source/backend

cp .env.example .env          # then fill in the two Google values
docker compose up --build     # starts the Express app and the MySQL container
```

Open **http://localhost:3000** and sign in with a `@ku.th` Google account.

### Google sign-in

`.env` is git-ignored and is **not** in the repository. Ask a team member for the values, or
create your own client: Google Cloud Console → APIs & Services → Credentials → OAuth client ID
→ Web application, with this under **Authorised redirect URIs** (not JavaScript origins):

```
http://localhost:3000/api/auth/google/callback
```

`TEST_LOGIN=1` enables a sign-in route that skips Google, for automated tests. **Leave it at
`0`** for anything else, including the demo.

> **Note the working directory:** `docker-compose.yml` lives in `source/backend/`, not at the
> repository root. Running `docker compose` anywhere else will not find it.

### If you pulled a schema change, you must reset the database

MySQL runs `db/schema.sql` **only once** — the first time the `dbdata` volume is created. After
that it is ignored. So when someone changes `schema.sql`, pulling their commit is not enough:
your database still has the old tables, the app starts normally, and then every page that uses
the new tables fails with *Server error*.

```bash
docker compose down -v        # deletes the dbdata volume
docker compose up --build     # recreates it, so schema.sql runs again
```

This **wipes every account, classroom and assignment** on your machine. There is no way to keep
the old data and get the new tables — the old data is what blocks them.

This is defect **D-01** in the Iteration 5 report, and it cost the team real time twice. In
Iteration 5 the tables `submissions`, `grades`, `chat_messages`, `staff_tasks` and
`timeline_events` were all added by later pushes, so anyone who skipped the reset saw pages
fail for no visible reason.

Check it worked:

```bash
docker compose ps             # PORTS must read 0.0.0.0:3000->3000/tcp
docker compose exec db mysql -uroot -ppassword ku_classroom -e "SHOW TABLES;"
```

`SHOW TABLES` must list **twelve** tables. If `timeline_events` or `staff_tasks` is missing, the
reset did not happen.

> **Running two copies at once?** Docker Compose names the project after the folder, and both a
> clone and a working copy sit in a folder called `backend` — so they share the volume
> `backend_dbdata` and a `down -v` in one wipes the other. Pass `-p <name>` to keep them apart.

### Before this is deployed anywhere

The database password and session secret are development defaults (`password`, `dev-secret`) in
`docker-compose.yml`. That is fine on a laptop, but they must move to the git-ignored `.env`
before the app runs anywhere real.

> **Never commit `.env`.** It holds the Google OAuth2 client secret. `.env.example` lists the
> variable names with empty values and is the only one that belongs in the repository.

---

## Contributing (team workflow)

1. Branch from `main` — `feature/<short-description>` or `fix/<short-description>`
2. Commit in small, described steps — one commit per task, not one per story
3. Back end first, front end second. Each back-end push carries a README stating its endpoints
   and response shape, so the front end is written against an agreed contract
4. Open a pull request into `main` and have another member review it
5. Keep documents and diagrams in step: if a requirement changes, update the SRS **and** the
   affected activity diagram JSON
6. If your change touches `db/schema.sql`, **say so in the commit message** — everyone else has
   to run `docker compose down -v` before your commit will work on their machine

---

## Course context

This repository is coursework for **Individual Software Development Process' 2026** at Kasetsart
University. The system is built for the department's own lecturers and TAs — the stakeholder for
this challenge is the course staff themselves.
