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
| Pakhin Daonan | 6810545859 | [@pakhindaonan-netizen](https://github.com/pakhindaonan-netizen), also [@pakhind-blip](https://github.com/pakhind-blip) ¹ |

¹ Both GitHub accounts belong to Pakhin Daonan. Most of his commits are under `pakhindaonan-netizen`; the merge of pull request #4 (`dd15081`, 22 Nov 2026) was made by mistake while signed in as `pakhind-blip`.

---

## Quick start

You need Git and Docker Desktop (showing *Engine running*). Then:

```bash
git clone https://github.com/ThanawinTH/ISP-Left4Dead.git
cd ISP-Left4Dead/source/backend
cp .env.example .env          # Windows: copy .env.example .env  — then fill in the Google keys
docker compose up --build
```

Open **http://localhost:3000** and sign in with a `@ku.th` Google account. Full step-by-step
instructions, the test command and troubleshooting are in **[Build and run](#build-and-run)**.

---

## Current project status

> **Phase: Iteration 6 complete — final release.** All 16 user stories in the SRS, plus US-17,
> US-18 and US-19, are implemented, and 112 automated API tests run with `npm test`.

| Deliverable | Status |
|---|---|
| Software Requirement Specification (SRS-1 … SRS-27) | ✅ Complete |
| KAOS goal refinement (SG-1 … SG-5) | ✅ Complete |
| Use case diagram + use case table | ✅ Complete |
| User stories & User Requirement Specification | 🟡 US-17, US-18, US-19 built but not described in the SRS (risk R-04, accepted) |
| Activity diagrams (AD-1 … AD-8) | ✅ Complete |
| Software Proposal — architecture, data storage, dev environment | ✅ Complete |
| Sequence diagrams (SQD-1 … SQD-5) | ✅ Complete |
| Traceability matrix (Sub-Goal → SRS → SQD) | ✅ Complete |
| Iteration reports | 🟡 Iterations 1–5 in `docs/` — Iteration 6 report still to be added |
| Final Project Development Report | ✅ Complete |
| Project schedule (Gantt / Plane export) | ✅ Complete |
| UI mockups (Figma) | ✅ Complete |
| Application source code | ✅ All 19 stories implemented |
| Database schema (12 tables) | ✅ Complete |
| Docker Compose environment | ✅ Complete |
| Automated tests | ✅ 112 API tests in `source/backend/test`, run with `npm test` |

### What works

| Area | Stories | SRS | State |
|---|---|---|---|
| Google sign-in, restricted to `@ku.th`, no passwords stored | US-16 | SRS-26, 27 | ✅ |
| Create a classroom, unique join code, reset the code, delete the classroom | US-1, US-2 | SRS-1, 2 | ✅ |
| Join by code, always as Student | US-3 | SRS-4, 5 | ✅ |
| Members and roles, remove a member | US-4 | SRS-6, 7 | ✅ |
| Create and edit assignments, topics, draft vs posted, assign TAs, 190-character title limit with a live counter | US-5, US-6 | SRS-8, 10, 13, 14 | ✅ |
| Classroom dashboard and at-risk highlighting | US-7, US-8 | SRS-12, 13 | ✅ |
| Student class schedule | US-9 | SRS-14 | ✅ |
| Announcements with files and links, a character counter, and delete for the lecturer | US-10, US-11 | SRS-15 … 17 | ✅ |
| Class chat, and a staff-only channel students cannot reach | US-12, US-13 | SRS-18 … 20 | ✅ |
| Submit files and links, late marking, **Unsubmit** to change and submit again | US-14 | SRS-21 … 24 | ✅ |
| Submission list, **Grade and Ungrade**, read-only for roles that may not grade | US-15 | SRS-25 | ✅ |
| Class schedule — labs, consultations, milestones and due dates in one view | US-17 | — | ✅ |
| Internal staff task board — Open, In progress, Done | US-18 | — | ✅ |
| To-do across every class, split by role, with a **server-side search** (`?q=`) | US-19 | — | ✅ |

### What changed in Iteration 6

- **D-02 fixed:** an assignment title over 190 characters is refused with 400 instead of a 500
  server error, on create and on edit.
- **Hand-in and grading reworked** to work like Google Classroom: Submit / Unsubmit and Grade /
  Ungrade.
- **Delete controls for the lecturer:** delete an announcement, delete a classroom (type its name
  to confirm).
- **To-do search runs on the server**, so it also finds older finished work.
- **112 automated API tests** in the repository (closes risk R-05).
- **Branch → pull request → review → merge** workflow (PR #1 – #4).

### Known gaps

- **US-17, US-18 and US-19 have no SRS requirement behind them** (risk **R-04**, accepted). The
  Project D requirement list reached the team after the SRS was submitted, and the addendum was
  dropped in favour of tests and features in the final iteration.
- **No separate `admin` role.** `memberships.role` is `ENUM('lecturer','ta','staff','student')`;
  the lecturer holds every administrative action inside a class.
- **Development secrets.** The database password and session secret in `docker-compose.yml` are
  development defaults — see *Before this is deployed anywhere* below.

**Roles.** A member's role is read from the database on every request, never cached in the
session, so a promotion takes effect immediately without signing out and back in.

---

## Repository layout

```
ISP-Left4Dead/
├── docs/                                  ← all documentation and design artefacts
│   ├── SRS_Left4Dead.pdf                  Software Requirement Specification
│   ├── SoftwareProposal_Left4Dead.pdf     Architecture, data storage, sequence diagrams
│   ├── Left4Dead_Iteration*_Report.pdf    iteration progress reports
│   ├── Final Project Development Report - Left4Dead.pdf   what the software does, progress, blockers
│   ├── SRS_ActivityDiagrams_drawio/       AD-1.json … AD-8.json
│   └── Gannt Chart/                       project schedule exported from Plane
└── source/                                ← the application
    ├── README.md                          developer guide: API list, roles, tests
    ├── backend/
    │   ├── docker-compose.yml             app + MySQL containers
    │   ├── Dockerfile                     node:20-alpine
    │   ├── package.json                   express, express-session, mysql2; npm test
    │   ├── .env.example                   copy to .env: Google keys, TEST_LOGIN
    │   ├── server.js                      app entry point, session + static files
    │   ├── db/schema.sql                  12 tables
    │   ├── test/                          112 automated API tests (npm test)
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
        └── js/                            one file per page, plus app.js, api.js and charcount.js
```

| Looking for… | Go to |
|---|---|
| Requirements, use cases, user stories, URS/SRS | `docs/SRS_Left4Dead.pdf` |
| Architecture, data storage and environment decisions | `docs/SoftwareProposal_Left4Dead.pdf` |
| Sequence diagrams (SQD) and the traceability matrix | `docs/SoftwareProposal_Left4Dead.pdf` |
| Activity diagrams (AD-1 … AD-8) | `docs/SRS_ActivityDiagrams_drawio/` |
| Project schedule and task breakdown | `docs/Gannt Chart/` |
| Progress narrative for each iteration | `docs/Left4Dead_Iteration*_Report.pdf` |
| How the whole project went — proposal vs final, To Do / Doing / Done, blockers | `docs/Final Project Development Report - Left4Dead.pdf` |
| How to build and run the app | **Build and run**, below |
| API endpoints, roles, developer notes | `source/README.md` |
| Automated tests | `source/backend/test/` |
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

Decided in the Software Proposal. The one change during development is file storage: files are
kept in MySQL instead of a separate Docker volume.

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

## Build and run

The whole application — the Node.js/Express server and the MySQL database — runs in Docker, so
you do not install Node.js or MySQL yourself. It works the same on Windows, macOS and Linux.

### 1. Prerequisites

| You need | Check it with |
|---|---|
| [Git](https://git-scm.com/downloads) | `git --version` |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) (on Windows with the WSL 2 backend) | Docker Desktop shows **Engine running**, and `docker compose version` prints a version |
| A Google account ending in `@ku.th` | — |
| Port **3000** free on your computer | nothing else is running on http://localhost:3000 |

### 2. Get the code

```bash
git clone https://github.com/ThanawinTH/ISP-Left4Dead.git
cd ISP-Left4Dead/source/backend
```

> **Every `docker compose` command below runs in `source/backend/`.** That is where
> `docker-compose.yml` lives — not the repository root.

### 3. Create the `.env` file

The Google sign-in keys are not in the repository. Make your own `.env` from the example:

```bash
cp .env.example .env          # macOS / Linux
copy .env.example .env        # Windows (PowerShell or Command Prompt)
```

Open `.env` and fill in the two Google values:

```
GOOGLE_CLIENT_ID=<your client ID>
GOOGLE_CLIENT_SECRET=<your client secret>
TEST_LOGIN=0
```

Ask a team member for the values, or get your own keys by following the steps below.

#### Get your own Google sign-in keys (about 10 minutes, free)

You only do this once. Any Google account can create the keys; the people who sign in to the app
still need `@ku.th` accounts.

1. **Open Google Cloud Console.** Go to <https://console.cloud.google.com> and sign in with your
   Google account. Accept the terms if this is your first visit.
2. **Create a project.** Click the project picker at the top of the page → **New project** →
   name it `KU Classroom` → **Create**. When it is ready, make sure `KU Classroom` is the project
   selected at the top.
3. **Open Google Auth Platform.** Type `Google Auth Platform` in the search bar at the top and
   open it (older consoles call this **APIs & Services → OAuth consent screen**). Click
   **Get started**.
4. **Fill in the app details:**
   - **App information:** App name `KU Classroom`; User support email: your email → **Next**.
   - **Audience:** choose **External** → **Next**.
   - **Contact information:** your email → **Next**.
   - **Finish:** tick the agreement → **Continue** → **Create**.
5. **Add the people who will sign in.** The app starts in **Testing** mode, where only listed
   accounts can sign in. In the left menu open **Audience** → under **Test users** click
   **+ Add users** → enter every `@ku.th` account that will use the app (for example the lecturer
   and the TAs) → **Save**.
6. **Create the client.** In the left menu open **Clients** → **+ Create client**:
   - **Application type:** `Web application`
   - **Name:** `KU Classroom local`
   - **Authorised JavaScript origins:** **+ Add URI** → `http://localhost:3000`
   - **Authorised redirect URIs:** **+ Add URI** → exactly
     `http://localhost:3000/api/auth/google/callback` (no slash at the end)
   - Click **Create**.
7. **Copy the two keys.** A window shows the **Client ID** and the **Client secret**. Copy both
   now — newer consoles show the secret only once (you can also click **Download JSON**). Put
   them in `.env`:

   ```
   GOOGLE_CLIENT_ID=1234567890-abc123.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxx
   TEST_LOGIN=0
   ```

8. **Wait a few minutes.** New settings can take from a few minutes up to an hour to work.

The app only asks Google for the basic `openid`, `email` and `profile` scopes, so nothing has to be
added under **Data access**, and no Google verification is needed while the app is in Testing mode.

| Google shows | What it means |
|---|---|
| `Error 400: redirect_uri_mismatch` | The redirect URI in step 6 is not exactly `http://localhost:3000/api/auth/google/callback`. |
| `Error 403: access_denied` — the app has not completed verification | That account is not in **Test users** (step 5). Add it and try again. |
| The app is blocked by your organisation's administrator | KU's Google Workspace does not allow this app for that account. Use the *Test login* below to try the system instead. |

**Never commit `.env` or share the client secret.** If it leaks, open **Clients** → your client →
**Reset secret**, and put the new one in `.env`.

> **Just want to try it without Google?** Set `TEST_LOGIN=1` instead. The sign-in page then shows
> a *Test login* box that accepts any `@ku.th` address with no password. It is for local testing
> only — set it back to `0` for the demo or anything shared.

### 4. Build and start

```bash
docker compose up --build
```

The first run downloads the Node.js and MySQL images and builds the app, which takes a few
minutes. It is ready when the log shows:

```
KU Classroom API on http://localhost:3000
```

On the first start MySQL creates the database from `db/schema.sql` (12 tables).

### 5. Open the app

Go to **http://localhost:3000** and sign in with your `@ku.th` Google account.

A quick tour:

1. **Create classroom** — you become its lecturer and get a join code.
2. Open a second browser (or an Incognito window), sign in as another `@ku.th` account and
   **Join** with the code — that person joins as a Student.
3. On **Members**, promote someone to TA or University staff.
4. Post an **assignment**, hand it in as the student, then grade it as the lecturer.

### 6. Stop and start again

| To… | Run |
|---|---|
| Stop (keep all data) | `Ctrl + C`, or `docker compose down` |
| Start again | `docker compose up` (add `--build` after pulling code changes) |
| Run in the background | `docker compose up -d --build`, then `docker compose logs -f app` to watch |
| Wipe all data and start fresh | `docker compose down -v`, then `docker compose up --build` |

Back-end changes need a restart (`docker compose restart app`). Front-end changes only need a hard
refresh in the browser (**Ctrl + Shift + R**).

### 7. Run the automated tests

The tests drive the real API as real signed-in users, so the app must be running with the test
sign-in switched on:

1. Set `TEST_LOGIN=1` in `.env`, then `docker compose up --build`.
2. In a second terminal, also in `source/backend`:

   ```bash
   docker compose exec app npm test
   ```

3. Expected result: **112 tests, 112 pass**.

| File | Tests | What it checks |
|---|---|---|
| `test/api.test.js` | 56 | acceptance tests, one block per user story (US-1 to US-19) |
| `test/boundary.test.js` | 30 | boundary values — the last allowed value and the first refused one |
| `test/iteration6.test.js` | 26 | D-02 on edit, Unsubmit, Ungrade, delete announcement, delete classroom, To-do search |

Each run signs in new users and creates new classes, so the tests can run again and again on the
same database. Set `TEST_LOGIN` back to `0` afterwards.

### 8. If something goes wrong

| Problem | Fix |
|---|---|
| `no configuration file provided` | You are in the wrong folder. `cd source/backend` first. |
| `Cannot connect to the Docker daemon` | Start Docker Desktop and wait for **Engine running**. |
| `port is already allocated` / `Bind for 0.0.0.0:3000 failed` | Something else uses port 3000. Stop it, or stop the other container (`docker ps`, then `docker stop <id>`). |
| Google says `redirect_uri_mismatch` | The redirect URI in Google Cloud must be exactly `http://localhost:3000/api/auth/google/callback`. |
| Google says `access_denied` / app not verified | Add that `@ku.th` account under **Google Auth Platform → Audience → Test users**. |
| Sign-in page says Google sign-in is not set up | `.env` is missing or the two Google values are empty. Fill them in, then `docker compose up --build`. |
| A page shows *Server error* after you pulled new code | The database schema changed — see the next section. |
| Tests fail with `test sign-in failed` | The app is not running with `TEST_LOGIN=1`. |

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

This is defect **D-01** in the Iteration 5 report, and it cost the team real time twice.

Check it worked:

```bash
docker compose ps             # PORTS must read 0.0.0.0:3000->3000/tcp
docker compose exec db mysql -uroot -ppassword ku_classroom -e "SHOW TABLES;"
```

`SHOW TABLES` must list **twelve** tables. If `timeline_events` or `staff_tasks` is missing, the
reset did not happen.

> **Running two copies at once?** Docker Compose names the project after the folder, and both a
> clone and a working copy sit in a folder called `backend` — so they share the volume
> `backend_dbdata` and a `down -v` in one wipes the other. Pass `-p <name>` to keep them apart,
> for example `docker compose -p demo up --build`.

### Before this is deployed anywhere

The database password and session secret are development defaults (`password`, `dev-secret`) in
`docker-compose.yml`. That is fine on a laptop, but they must move to the git-ignored `.env`
before the app runs anywhere real, and `TEST_LOGIN` must be `0`.

> **Never commit `.env`.** It holds the Google OAuth2 client secret. `.env.example` lists the
> variable names with empty values and is the only one that belongs in the repository.

---

## Contributing (team workflow)

From Iteration 6 every change reaches `main` through a reviewed pull request.

1. Start from the newest main: `git checkout main`, `git pull origin main`
2. Make a branch — `feature/<short-description>` or `fix/<short-description>`
3. Commit in small, described steps — one commit per task, not one per story
4. Back end first, front end second. Each back-end change states its endpoints and response
   shape, so the front end is written against an agreed contract
5. Run `docker compose exec app npm test` before opening the pull request
6. Push the branch, open a pull request into `main`, and have another member review it
7. Merge only after approval, then everyone pulls `main`
8. **Never force-push `main`.** If a push is rejected, pull first, then push
9. If your change touches `db/schema.sql`, **say so in the commit message** — everyone else has
   to run `docker compose down -v` before your commit will work on their machine
10. Keep documents in step: if a requirement changes, update the SRS **and** the affected
    activity diagram JSON

---

## Course context

This repository is coursework for **Individual Software Development Process' 2026** at Kasetsart
University. The system is built for the department's own lecturers and TAs — the stakeholder for
this challenge is the course staff themselves.
