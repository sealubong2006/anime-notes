# Anime Notes

A personal anime review journal. Search for anime via [AniList](https://anilist.co), add them to your own library, and keep track of your own rating, comments and watch date — kept separate from AniList's own data so it's never overwritten.
[Demo](https://anime-notes.onrender.com) for Site Demo

## Tech stack

- Node.js + Express 5
- EJS templates
- PostgreSQL (via `pg`, no ORM)
- [AniList GraphQL API](https://docs.anilist.co/) for anime metadata (no API key required)
- Bootstrap 5 + custom CSS, with light/dark theme support

## Features

- Search AniList and add anime to your library via a preview/confirm step
- Personal review per anime: rating (1–10), comment, date watched (clearable independently)
- Browse your library with search, genre filtering, minimum-rating filtering, sorting, and pagination
- Home dashboard: library stats, recently added, recently watched, top rated, top genres
- Duplicate protection (an anime already in your library can't be added twice)
- Light/dark mode toggle (remembers your choice)
- Owner-only login — anonymous visitors can browse and read, but adding anime and editing reviews requires authentication

## Prerequisites

- Node.js 18+ (uses the built-in `fetch`)
- A running PostgreSQL server

## Setup

1. **Install dependencies**
   ```
   npm install
   ```

2. **Configure environment variables**

   Copy `.env.example` to `.env` and fill in your own PostgreSQL connection details, plus a session secret and admin password hash:
   ```
   PORT=3000
   DB_USER=your_db_user
   DB_HOST=localhost
   DB_NAME=your_db_name
   DB_PASSWORD=your_db_password
   DB_PORT=5432
   SESSION_SECRET=a_long_random_string
   ADMIN_PASSWORD_HASH=a_bcrypt_hash_of_your_password
   ```
   Generate `SESSION_SECRET` with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.

   Generate `ADMIN_PASSWORD_HASH` with `node -e "console.log(require('bcryptjs').hashSync('your-password', 10))"` — paste only the resulting hash into `.env`; never store the plaintext password anywhere.

   `.env` is gitignored — never commit it. No AniList API key is needed; its public search API is used unauthenticated.

3. **Create the database**

   Create an empty PostgreSQL database matching `DB_NAME`, then apply the migrations in order:
   ```
   psql -U your_db_user -d your_db_name -f db/migrations/001_init.sql
   psql -U your_db_user -d your_db_name -f db/migrations/002_sessions.sql
   ```
   (Or run each file's contents through any PostgreSQL client.) `001_init.sql` creates the four data tables: `anime`, `genres`, `anime_genres`, and `anime_reviews`. `002_sessions.sql` creates the `session` table used to store login sessions (via `connect-pg-simple`).

4. **Start the app**
   ```
   npm start
   ```
   Then visit `http://localhost:3000` (or whichever `PORT` you set).

## Project structure

```
index.js              App entry point: middleware, routes, error handling
routes/                Express route handlers (one file per URL area)
middleware/
  requireAdmin.js      Server-side gate for admin-only routes
  loginRateLimiter.js  In-memory failed-login tracker
db/
  pool.js              Shared PostgreSQL connection pool
  queries/anime.js      All SQL for this app, as named functions
  migrations/          Schema (001_init.sql, 002_sessions.sql)
services/
  anilistService.js    All AniList GraphQL calls, isolated from routes
utils/
  htmlEntities.js      Decodes HTML entities in AniList descriptions safely
views/                 EJS templates (includes login.ejs, error.ejs)
public/                Static CSS/JS served directly
render.yaml            Render deployment blueprint
```

## Authentication

Anime Notes has a single owner/admin account, not a users table — there's only ever one person who should be able to write to it. Log in at `/login` with the password behind `ADMIN_PASSWORD_HASH`. There's no username field and no public "Login" link in the navbar; the page is reachable only by navigating to it directly.

Logged out, you can browse, search, filter, and read every anime page. Logged in, you additionally get an "Add Anime" link, "Edit review" buttons, and a "Logout" link. These are convenience-only — the actual protection is server-side middleware (`middleware/requireAdmin.js`) on every database-changing route, so a direct request (`curl`, a browser typing the URL, etc.) is rejected the same way regardless of whether any button was ever shown.

A basic in-memory rate limiter locks out further login attempts for 15 minutes after 5 failed attempts from the same IP (resets on server restart — acceptable for a single-instance personal deployment).

## Deploying to Render + Supabase

This app runs as a Render **Web Service**, backed by a **Supabase** PostgreSQL database rather than Render's own Postgres — Supabase's free tier persists indefinitely (with pausing after a week of inactivity, resumable), unlike Render's free Postgres, which is deleted after 30 days. Render only hosts the Express app; Supabase only hosts the database. The app itself is unchanged — it still talks to Postgres purely through `pg`/`DATABASE_URL`, never through any Supabase-specific SDK or API.

1. **Create a Supabase project** (free tier). From its dashboard, go to **Project Settings → Database → Connection string** and copy the **connection pooler** string (not the direct connection) — the pooler is IPv4-compatible, which Render's network requires. It looks like:
   ```
   postgresql://postgres.xxxxxxxx:[YOUR-PASSWORD]@aws-0-region.pooler.supabase.com:6543/postgres
   ```
   Fill in the database password you set when creating the project.

2. **Run the migrations once against Supabase**, before the app's first deploy:
   ```
   psql "<Supabase connection string>" -f db/migrations/001_init.sql
   psql "<Supabase connection string>" -f db/migrations/002_sessions.sql
   ```
   (Or paste each file's contents into Supabase's SQL Editor.) These are **not** run automatically on every deploy — they use plain `CREATE TABLE`, which would fail on a second run. Run them once against a fresh database; you never need to run them again for this schema.

3. **Push this repository to GitHub** (not done automatically — you control when that happens).

4. **In Render, create a new Blueprint** and point it at the GitHub repo. Render will read `render.yaml` and provision a Web Service (`anime-notes`) running `npm install` then `npm start`. It does **not** provision a database — `render.yaml` only asks Render to prompt you for `DATABASE_URL` as a secret, same as `SESSION_SECRET` and `ADMIN_PASSWORD_HASH`.

5. **Set the three secrets Render will prompt for** (marked `sync: false` in `render.yaml`, so Render asks you to enter them rather than storing them in the repo):
   - `DATABASE_URL` — the Supabase pooler connection string from step 1
   - `SESSION_SECRET` — a long random string
   - `ADMIN_PASSWORD_HASH` — a bcrypt hash of your admin password (generate it locally as described above; never enter the plaintext password anywhere)

6. **Deploy.** `NODE_ENV=production` is set by `render.yaml`, which enables secure cookies and `trust proxy` automatically. `db/pool.js` already switches to `DATABASE_URL` with SSL whenever it's set, so no code changes are needed for Supabase versus any other hosted Postgres.

Render's free web service tier sleeps after 15 minutes of inactivity and takes about a minute to wake back up on the next request — fine for a personal site, worth upgrading if that cold start becomes annoying.

## Notes

- All database queries use parameterised SQL — no string-built SQL anywhere.
- Only the AniList numeric ID ever crosses from the browser to the server when adding an anime; the server always re-fetches the actual metadata itself, so client-submitted titles/descriptions/genres/covers are never trusted.
- There is no automated test suite; `npm test` is a placeholder.
