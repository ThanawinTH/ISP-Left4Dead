# Project D — Course Support & Activity Dashboard

Team Left4Dead. Node.js + Express + MySQL backend, plain HTML/CSS/JS frontend.
Only the parts that actually work are in here.

## Run

Docker Desktop must show "Engine running". In the `backend` folder:

```
docker compose up --build
```

Then open http://localhost:3000

Stop with Ctrl+C. `docker compose down -v` wipes the database.

## What works

| Page | What it does |
|---|---|
| `index.html` | Sign in. @ku.th only, name = the part before the @ |
| `my-classrooms.html` | Your classrooms, and joining one by code |
| `create-classroom.html` | Create a classroom, Generate Code button |
| `class-schedule.html` | Classroom header + join code (activities not built) |

## API

| Method | Path |
|---|---|
| POST | `/api/auth/login` |
| GET | `/api/auth/me` |
| POST | `/api/auth/logout` |
| GET | `/api/classrooms` |
| GET | `/api/classrooms/preview-code` |
| POST | `/api/classrooms` |
| POST | `/api/classrooms/join` |
| GET | `/api/classrooms/:id` |

## Files

```
backend/
  docker-compose.yml   app + MySQL
  Dockerfile
  package.json         express, express-session, mysql2
  server.js            starts everything
  db/schema.sql        users, classrooms, memberships
  src/
    db.js              MySQL pool, q() and one()
    auth.js            login, password hashing, requireAuth
    classrooms.js      list, create, join, join code
    routes.js          the URL list

frontend/
  index.html  my-classrooms.html  create-classroom.html  class-schedule.html
  css/styles.css
  js/app.js   toast + copy
  js/api.js   fetch wrapper + sidebar user
```

## Notes for later

- Passwords are a stand-in for Google OAuth (SRS-26). The domain check in
  `src/auth.js` stays; the password part is what gets replaced.
- Sessions live in memory, so a server restart signs everyone out.
