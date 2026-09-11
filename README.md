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
| Database schema / migrations | ⬜ Not started |
| Docker Compose environment | ⬜ Not started |
| Test suite | ⬜ Not started |

The UI is designed in Figma and the front-end pages are being built from those mockups; `source/`
is reserved for the application and is still empty until the first code lands. All design and
documentation artefacts live under `docs/`.

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
└── source/                                ← application code (not started yet)
```

| Looking for… | Go to |
|---|---|
| Requirements, use cases, user stories, URS/SRS | `docs/SRS_Left4Dead.pdf` |
| Architecture, data storage and environment decisions | `docs/SoftwareProposal_Left4Dead.pdf` |
| Sequence diagrams (SQD) and traceability matrices | `docs/SoftwareProposal_Left4Dead.pdf` |
| Activity diagrams (AD-1 … AD-8) | `docs/SRS_ActivityDiagrams_drawio/` |
| Project schedule and task breakdown | `docs/Gannt Chart/` |
| Progress narrative for the iteration | `docs/Left4Dead_Iteration1_Report.pdf` |

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

Decided in the Software Proposal and not yet implemented.

| Layer | Technology | Why |
|---|---|---|
| Architecture | Modular Monolith (MVC) | Keeps one deployment while isolating the role/permission checks that most requirements depend on |
| Backend | Node.js + Express | Single language across the team; serves the views and the API |
| Frontend | HTML, CSS, client-side JavaScript | Server-rendered views, no build step to maintain |
| Database | MySQL | Relational data with one authoritative role row per member per classroom |
| File storage | Named Docker volume | Keeps uploaded submissions out of the database and out of the image |
| Authentication | Google OAuth2, restricted to `@ku.th` | No passwords stored (SRS-26); non-university identities rejected (SRS-27) |
| Environment | Docker + Docker Compose | Same runtime, MySQL version and time zone on all four laptops and the demo machine |

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
4. Keep documents and diagrams in step: if a requirement changes, update the SRS **and** the
   affected `.drawio` file **and** re-export its `.json`

---

## Course context

This repository is coursework for **Individual Software Development Process' 2026** at Kasetsart
University. The system is built for the department's own lecturers and TAs — the stakeholder for
this challenge is the course staff themselves.
