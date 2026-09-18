# Project D — Course Support & Activity Dashboard

Team Left4Dead. Node.js + Express + MySQL backend, plain HTML/CSS/JS frontend.
Only the parts that actually work are in here.

## Run

Docker Desktop must show "Engine running". In the `backend` folder:

```
docker compose up --build
```

Then open http://localhost:3000

Stop with Ctrl+C.

### After a schema change, reset the database

MySQL runs `db/schema.sql` only once — when the `dbdata` volume is first created. If you pull a
commit that changes the schema, your database keeps the old tables and the new pages fail.

```
docker compose down -v
docker compose up --build
```

That wipes all local data. Check it worked:

```
docker compose ps
docker compose exec db mysql -uroot -ppassword ku_classroom -e "SHOW TABLES;"
```

`PORTS` must read `0.0.0.0:3000->3000/tcp`, and `SHOW TABLES` must list five tables:
`assignment_staff`, `assignments`, `classrooms`, `memberships`, `users`.

## What works

| Page | What it does |
|---|---|
| `index.html` | Sign in. @ku.th only, name = the part before the @ |
| `my-classrooms.html` | Your classrooms, and joining one by code |
| `create-classroom.html` | Create a classroom, Generate Code button |
| `class-schedule.html` | Assignments grouped by TODAY / THIS WEEK / NEXT WEEK, with a details panel |
| `members.html` | Members and roles; the owner can change a member's role inline |
| `create-assignment.html` | Create an assignment, or update one via `?edit=<id>` |

### Roles

`memberships.role` is one of `lecturer`, `ta`, `staff`, `student`.

- The **lecturer** owns the classroom. Only the owner creates or updates assignments, and only
  the owner changes roles. The owner's own role can never be changed.
- A **TA** works on the assignments they are put on, and sees staff-only drafts.
- **University staff** see staff-only drafts but do not act.
- A **student** sees only assignments posted to the class.

A member's role is read from the database on every request, so a promotion applies immediately —
the member does not sign out and back in.

## API

| Method | Path | Who |
|---|---|---|
| POST | `/api/auth/login` | anyone |
| GET | `/api/auth/me` | signed in |
| POST | `/api/auth/logout` | signed in |
| GET | `/api/classrooms` | signed in |
| GET | `/api/classrooms/preview-code` | signed in |
| POST | `/api/classrooms` | signed in |
| POST | `/api/classrooms/join` | signed in |
| GET | `/api/classrooms/:id` | signed in |
| GET | `/api/classrooms/:id/members` | any member |
| PATCH | `/api/classrooms/:id/members/:userId` | owner only |
| GET | `/api/classrooms/:id/assignments` | any member |
| POST | `/api/classrooms/:id/assignments` | owner only |
| PATCH | `/api/classrooms/:id/assignments/:assignmentId` | owner only |

Students receive only assignments with `visibility = 'class'`. The filter is applied in the SQL
query, not in the browser, so a draft never reaches a student's page at all.

## Files

```
backend/
  docker-compose.yml   app + MySQL
  Dockerfile
  package.json         express, express-session, mysql2
  server.js            starts everything
  db/schema.sql        users, classrooms, memberships, assignments, assignment_staff
  src/
    db.js              MySQL pool, q() and one()
    auth.js            login, password hashing, requireAuth,
                       loadMembership / requireOwner / requireStaff
    classrooms.js      list, create, join, join code
    members.js         member list, role changes
    assignments.js     list, create, update
    routes.js          the URL list

frontend/
  index.html  my-classrooms.html  create-classroom.html
  class-schedule.html  members.html  create-assignment.html
  css/styles.css
  js/app.js                 toast + copy
  js/api.js                 fetch wrapper + sidebar user
  js/members.js             member table + inline role editing
  js/schedule.js            assignment grouping, list, details panel
  js/create-assignment.js   the form, in create and update mode
```

## Known gaps

- **Reset Code** on the Members page shows "not built yet". SRS-2 allows the lecturer to
  regenerate the join code, but there is no endpoint for it.
- **Assignments cannot be deleted.** Create, read and update only — deliberately, so the record
  of an assignment is never lost.
- **Sign-in is email + password**, standing in for Google OAuth2 (SRS-26). The `@ku.th` check
  (SRS-27) is already enforced.
- **The database password and session secret are in `docker-compose.yml`** as development
  defaults. They belong in a git-ignored `.env` before this runs anywhere real.
