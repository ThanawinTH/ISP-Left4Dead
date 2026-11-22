# KU Classroom — developer guide

Project D — Course Support & Activity Dashboard, team Left4Dead.
Node.js + Express + MySQL backend, plain HTML/CSS/JavaScript frontend, run with Docker Compose.

This file is for people working on the code. **How to build and run the app for the first time
is in the [repository README](../README.md#build-and-run).**

## Run

Docker Desktop must show *Engine running*. In `source/backend/`:

```bash
cp .env.example .env          # first time only (Windows: copy .env.example .env), fill in the Google keys
docker compose up --build
```

Open http://localhost:3000. Stop with `Ctrl + C`.

| After you… | Do this |
|---|---|
| change a file in `frontend/` | hard refresh the browser (**Ctrl + Shift + R**) |
| change a file in `backend/src/` | `docker compose restart app` |
| change `package.json` | `docker compose up --build` |
| pull a change to `db/schema.sql` | `docker compose down -v`, then `docker compose up --build` (wipes local data) |

Check the database has all 12 tables:

```bash
docker compose exec db mysql -uroot -ppassword ku_classroom -e "SHOW TABLES;"
```

## Environment variables (`backend/.env`)

| Variable | Meaning |
|---|---|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth2 client. Redirect URI: `http://localhost:3000/api/auth/google/callback` |
| `TEST_LOGIN` | `1` adds `POST /api/auth/test-login` and a *Test login* box on the sign-in page, for the automated tests. Keep `0` otherwise |

`.env` is git-ignored. Never commit it.

## Tests

With the app running with `TEST_LOGIN=1`:

```bash
docker compose exec app npm test
```

112 tests, all through the real HTTP API as real signed-in users — nothing is mocked. They use
only `node:test`, so there is nothing extra to install, and each run creates new users and
classes, so they can run again on the same database.

| File | Tests | Covers |
|---|---|---|
| `test/api.test.js` | 56 | acceptance tests for US-1 to US-19; about half are refusals (401, 403, 400) |
| `test/boundary.test.js` | 30 | B-01 to B-30: the last allowed and first refused value of every limit |
| `test/iteration6.test.js` | 26 | I-01 to I-26: D-02 on edit, Unsubmit, Ungrade, delete announcement, delete classroom, To-do search |

Set `TEST_BASE` if the API is not at `http://127.0.0.1:3000/api`.

## Roles

`memberships.role` is one of `lecturer`, `ta`, `staff`, `student`.

- The **lecturer** owns the classroom: creates, edits and deletes assignments, changes roles,
  removes members, resets the join code, deletes announcements and deletes the classroom.
- A **TA** works on the assignments they are put on (status and grading), posts announcements,
  and uses the staff chat, the task board and the schedule.
- **University staff** see staff-only work and use the staff tools, but do not grade.
- A **student** sees only work posted to the class, hands work in, and uses the class chat.

A member's role is read from the database on every request, so a promotion applies immediately.
Every rule is checked on the server — a hidden button is never the only protection.

## API

All paths start with `/api`. "Member" means any member of that classroom; "staff" means
lecturer, TA or University staff.

| Method | Path | Who |
|---|---|---|
| GET | `/auth/google`, `/auth/google/callback` | anyone — Google sign-in, `@ku.th` only |
| POST | `/auth/test-login` | only exists when `TEST_LOGIN=1` |
| GET | `/auth/me` | signed in |
| POST | `/auth/logout` | signed in |
| GET | `/classrooms` | signed in — my classrooms |
| GET | `/todo` (`?q=` to search) | signed in — what is due across all my classes |
| GET | `/classrooms/preview-code` | signed in |
| POST | `/classrooms` | signed in — create |
| POST | `/classrooms/join` | signed in — join by code, as Student |
| GET | `/classrooms/:id` | member |
| POST | `/classrooms/:id/join-code` | owner — reset the code |
| DELETE | `/classrooms/:id` | owner — deletes the class and everything in it |
| GET | `/classrooms/:id/members` | member |
| PATCH / DELETE | `/classrooms/:id/members/:userId` | owner — change role / remove |
| GET | `/classrooms/:id/assignments` | member (students get class-visible only) |
| POST | `/classrooms/:id/assignments` | owner |
| PATCH / DELETE | `/classrooms/:id/assignments/:assignmentId` | owner |
| PATCH | `/classrooms/:id/assignments/:assignmentId/status` | owner, or a TA on the assignment |
| POST | `/classrooms/:id/assignments/:assignmentId/attachments` | owner |
| DELETE | `/classrooms/:id/assignments/:assignmentId/attachments/:attachmentId` | owner |
| GET | `/classrooms/:id/announcements` | member |
| POST | `/classrooms/:id/announcements` | staff |
| DELETE | `/classrooms/:id/announcements/:announcementId` | owner |
| POST | `/classrooms/:id/announcements/:announcementId/attachments` | staff |
| DELETE | `/classrooms/:id/announcements/:announcementId/attachments/:attachmentId` | staff |
| GET | `/classrooms/:id/attachments/:attachmentId` | member who can see it |
| GET / POST | `/classrooms/:id/chat` | member |
| DELETE | `/classrooms/:id/chat/:messageId` | the author, or the owner |
| GET / POST | `/classrooms/:id/staff-chat` | staff |
| DELETE | `/classrooms/:id/staff-chat/:messageId` | staff — the author, or the owner |
| GET / POST | `/classrooms/:id/tasks` | staff |
| PATCH / DELETE | `/classrooms/:id/tasks/:taskId` | staff |
| GET | `/classrooms/:id/timeline` | member |
| POST | `/classrooms/:id/timeline` | staff |
| PUT / DELETE | `/classrooms/:id/timeline/:eventId` | staff |
| PUT | `/classrooms/:id/assignments/:assignmentId/submission` | student — submit files and links |
| GET | `/classrooms/:id/assignments/:assignmentId/submission` | member — my submission and grade |
| DELETE | `/classrooms/:id/assignments/:assignmentId/submission` | student — unsubmit, while the assignment is open |
| GET | `/classrooms/:id/assignments/:assignmentId/submission/files/:fileId` | the student who submitted it |
| GET | `/classrooms/:id/assignments/:assignmentId/submissions` | staff — who has submitted |
| GET | `/classrooms/:id/assignments/:assignmentId/submissions/files/:fileId` | staff |
| PUT | `/classrooms/:id/assignments/:assignmentId/grades/:studentId` | owner, or a TA on the assignment |
| DELETE | `/classrooms/:id/assignments/:assignmentId/grades/:studentId` | owner, or a TA on the assignment — ungrade |

The full route table, with the middleware for each route, is `backend/src/routes.js`.

## Files

```
backend/
  docker-compose.yml   app + MySQL 8
  Dockerfile           node:20-alpine
  package.json         express, express-session, mysql2; "npm test"
  .env.example         copy to .env
  server.js            starts the app: JSON, session, /api routes, static frontend
  db/schema.sql        the 12 tables
  test/                api.test.js, boundary.test.js, iteration6.test.js
  src/
    routes.js          the URL list and who may call each one
    db.js              MySQL pool, q() and one()
    auth.js            Google OAuth2, @ku.th check, test login,
                       requireAuth / loadMembership / requireOwner / requireStaff
    classrooms.js      list, create, join, join code, delete
    members.js         member list, role changes, removal
    assignments.js     list, create, update, status, delete
    topics.js          assignment topics
    attachments.js     files and links on assignments and announcements
    files.js           upload rules: size, type and link checks
    announcements.js   list, post, delete
    submissions.js     submit, unsubmit, staff list, grade, ungrade
    chat.js            class chat and staff chat
    tasks.js           internal staff tasks
    timeline.js        labs, consultations and milestones
    todo.js            what is due across all classes, server-side search

frontend/
  index.html                sign in
  my-classrooms.html        classroom list, join by code
  create-classroom.html     create a classroom
  class-schedule.html       assignments, hand-in, grading
  create-assignment.html    create / edit an assignment (?edit=<id>)
  members.html              members, roles, delete the classroom
  announcements.html        announcements
  create-announcement.html  post an announcement
  chat.html                 class chat
  admin.html                staff chat and the task board
  create-task.html          new staff task
  timeline.html             schedule: list and month view
  create-event.html         add a lab, consultation or milestone
  todo.html                 to-do across all classes, with search
  css/styles.css
  js/                       one script per page, plus app.js, api.js and charcount.js
```

## Known gaps

- **US-17, US-18 and US-19 are not in the SRS** (risk R-04). The code and tests cover them.
- **Development defaults in `docker-compose.yml`:** the database password and session secret
  must move to `.env` before the app runs anywhere real.
