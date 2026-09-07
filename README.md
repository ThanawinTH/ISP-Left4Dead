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

> **Phase: Design & documentation complete — implementation not yet started.**

| Deliverable | Status |
|---|---|
| Software Requirement Specification (SRS-1 … SRS-27) | ✅ Complete |
| KAOS goal refinement (SG-1 … SG-5) | ✅ Complete |
| Use case diagram + 17 use cases | ✅ Complete |
| User stories & User Requirement Specification | ✅ Complete |
| Activity diagrams (AD-1 … AD-8) | ✅ Complete |
| Software Proposal — architecture, data storage, dev environment | ✅ Complete |
| Sequence diagrams for all SRS | ✅ Complete |
| Traceability matrices (Sub-Goal → SRS, SRS → SQD) | ✅ Complete |
| Iteration report | ✅ Complete |
| Application source code | ⬜ Not started |
| Database schema / migrations | ⬜ Not started |
| Docker Compose environment | ⬜ Not started |
| Test suite | ⬜ Not started |

The `source/` folder currently holds **design artefacts only** (diagram exports and the project
plan). Application code will be added under `source/` as implementation begins.

---

## Where to find documents and diagrams

```
ISP-Left4Dead/
├── docs/                            ← all written deliverables (PDF)
│   └── Left4Dead_Iteration_Report.pdf
└── source/                          ← design artefacts, and application code once it exists
    ├── draw_io diagram/             ← activity diagrams, exported as JSON
    │   ├── AD-1 (1).json            Lecturer creates a classroom
    │   ├── AD-2 (1).json            User joins a classroom
    │   ├── AD-3 (1).json            Lecturer assigns a member role
    │   ├── AD-4 (1).json            Staff creates or edits an activity
    │   ├── AD-5 (1).json            System evaluates at-risk activities
    │   ├── AD-6 (1).json            Staff posts a class announcement
    │   ├── AD-7 (1).json            Staff exchange messages in the staff channel
    │   └── AD-8 (1).json            Student submits a file
    └── Gantt chart/                 ← project plan exported from Plane
        └── first_po-*.json
```

| Looking for… | Go to |
|---|---|
| Requirements, use cases, traceability matrices | `docs/` — the SRS / Software Proposal PDF |
| Architecture, data storage and environment decisions | `docs/` — Software Proposal, Sections 10–12 |
| Sequence diagrams (SQD) | `docs/` — Software Proposal, Section 13 |
| Activity diagrams (AD-1 … AD-8) | `source/draw_io diagram/` |
| Project schedule and task breakdown | `source/Gantt chart/` |
| Progress narrative for the iteration | `docs/Left4Dead_Iteration_Report.pdf` |

### Opening the diagrams

The files in `source/draw_io diagram/` are **structured JSON exports** — each one lists the
diagram's nodes (with type: `start`, `action`, `decision`, `error`, `end`) and its edges with
`[Yes]` / `[No]` labels. They are readable in any text editor and easy to diff in a pull request,
but they are **not** the editable draw.io format.

> **Note for the team:** please also commit the original `.drawio` files next to the JSON, so the
> diagrams remain editable. To edit: open [app.diagrams.net](https://app.diagrams.net) →
> **File → Open From → Device** → select the `.drawio` file.

The Gantt chart JSON is an export from [Plane](https://plane.so). To regenerate it:
**Workspace Settings → Exports →** choose the project **→** format **JSON → Export**, then
download from *Previous exports*.

---

## Planned technology stack

Decided in the Software Proposal (Sections 10–12) and not yet implemented.

| Layer | Technology | Why |
|---|---|---|
| Architecture | Modular Monolith (MVC) | Keeps one deployment while isolating the role/permission checks that most requirements depend on |
| Backend | Node.js + Express | Single language across the team; serves the views and the API |
| Frontend | HTML, CSS, client-side JavaScript | Server-rendered views, no build step to maintain |
| Database | MySQL | Relational data with one authoritative role row per member per classroom |
| File storage | Named Docker volume | Keeps uploaded submissions out of the database and out of the image |
| Authentication | Google OAuth2, restricted to `@ku.th` | No passwords stored (SRS-26); non-university identities rejected (SRS-27) |
| Environment | Docker + Docker Compose | Same runtime, database version and time zone on all four laptops and the demo machine |

---

## Getting started

Application code has not been committed yet. Once the Docker Compose environment lands, the
intended workflow is:

```bash
git clone https://github.com/ThanawinTH/ISP-Left4Dead.git
cd ISP-Left4Dead

cp .env.example .env          # then fill in the Google OAuth2 client ID and secret

docker compose up --build     # starts the Express app and the MySQL container
```

The application will be available at `http://localhost:3000`.

> `.env` is git-ignored on purpose — **never commit OAuth2 credentials or database passwords.**
> Add a placeholder `.env.example` instead, listing the variable names with empty values.

---

## Contributing (team workflow)

1. Branch from `main` — `feature/<short-description>` or `fix/<short-description>`
2. Commit in small, described steps
3. Open a pull request into `main` and have another member review it
4. Keep `docs/` and `source/` in step: if a requirement changes, update the SRS **and** the affected diagram

---

## Course context

This repository is coursework for **Individual Software Development Process' 2026** at Kasetsart
University. The system is built for the department's own lecturers and TAs — the stakeholder for
this challenge is the course staff themselves.
