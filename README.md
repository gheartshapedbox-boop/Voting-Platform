# Strategy voting (MVP)

Kahoot-style joining, Benefit/Effort scoring on a 1–5 scale, and a 2×2 dashboard
the room can watch fill in. Built to be **changed** after management tries it —
one Express process, one Postgres schema, no build ceremony beyond Vite.

---

## Run it locally

```bash
npm install

# dev: API on :3001, client with hot reload on :5173
npm run dev                       # -> http://localhost:5173

# production-ish: one process serves API + client on :3001
npm run build
ADMIN_PASSCODE="pick-something" DB_DIR=./data/pgdata npm start
```

```bash
npm test        # 31 tests, no database or server setup needed
```

### Configuration

| Variable | Default | Notes |
|---|---|---|
| `ADMIN_PASSCODE` | `let-me-in` | **Set this.** The server warns while the default is in use. |
| `DATABASE_URL` | — | Hosted Postgres (`POSTGRES_URL` is also accepted). **Required when deployed**; without it the app runs on an embedded database. |
| `DB_DIR` | — | Local PGlite data directory. Unset = in-memory (data lost on restart). |
| `PORT` | `3001` | |

### First five minutes

1. Open `/#/admin`, sign in with the passcode, add a few strategies.
2. Open `/` in another browser or a private window, join with a name, score them.
3. Open `/#/dashboard` for the shared screen. It refreshes every 5 seconds.

---

## Deploying

The app is one Express handler (`api/index.js`) plus a static Vite bundle, so it
runs on Vercel as-is. The only required step is a database: PGlite is per-process,
so a serverless deployment **must** have `DATABASE_URL` pointing at a hosted
Postgres. The app refuses to boot on Vercel without one rather than silently
giving every lambda its own empty database.

1. Import the repo into Vercel.
2. Storage → create a Postgres database → it sets `DATABASE_URL`.
3. Settings → Environment Variables → add `ADMIN_PASSCODE`.
4. Redeploy.

---

## How it fits together

```
server/
  db/schema.sql       every important invariant, as a database constraint
  db/index.js         pg when DATABASE_URL is set, embedded PGlite otherwise
  store.js            all SQL, one function per operation
  service.js          business rules (locking, validation, archiving)
  auth.js             passcode -> bearer token, and the guard middleware
  domain/
    identity.js       name rules, recovery codes        (pure, no DB)
    results.js        averages, quadrants, progress     (pure, no DB)
  routes/
    public.js         join / resume / vote / results
    admin.js          everything behind requireAdmin
client/src/
  screens/            Join, Vote, Dashboard, Admin
  components/
    QuadrantChart.jsx pixels only — every number is computed server-side
```

The split that matters: **`server/domain/` knows the rules, `QuadrantChart.jsx`
knows how to draw.** Moving the quadrant midpoint, or changing what counts toward
"Rated", is a one-file edit in `results.js` that the chart picks up for free.

One SQL dialect everywhere. PGlite and hosted Postgres run the same
`schema.sql` with the same `$1` placeholders, so there is no dialect fork and
tests exercise the real constraints.

---

## Response model

A participant has **at most one current response per strategy**, and it is one of:

| Kind | Benefit | Effort | Counts toward |
|---|---|---|---|
| `RATED` | 1–5 | 1–5 | Responded **and** Rated; included in both averages |
| `NOT_SURE` | `NULL` | `NULL` | Responded only |

Averages use `RATED` responses only. A strategy nobody rated has `null` averages
and **no dot on the dashboard** — it is listed separately rather than guessed onto
the chart at some default position.

## Data integrity

Enforced by the database, not the interface:

| Invariant | Mechanism |
|---|---|
| One current response per participant per strategy | `UNIQUE (session_id, participant_id, strategy_id)`; re-voting is `ON CONFLICT DO UPDATE`, so a double submit cannot fan out |
| A `NOT_SURE` never carries stale scores | `CHECK` tying `kind` to whether `benefit`/`effort` are `NULL` — this is what makes RATED → NOT_SURE correct at the data layer, not just in aggregate code |
| Ratings are whole numbers 1–5 | `CHECK (benefit BETWEEN 1 AND 5)`, same for effort, plus an integer check that returns 400 |
| Locked voting rejects writes | The vote upsert is a single statement guarded by `WHERE EXISTS (session OPEN AND strategy live)`, so there is no window between checking and writing |
| Archiving never destroys history | `archived_at` is a soft delete; responses are untouched and restoring brings them back |
| Recovery codes are unique | `UNIQUE` column with retry-on-collision at insert |

## Participant identity

- **`participants.id` is a UUID and never changes.** It is the identity.
- **`display_name` is a label.** Mutable and deliberately *not* unique — two people
  can both be "Quoc Duy" and stay separate participants. Renaming keeps every vote.
- **The browser stores only the UUID** (`localStorage`) and revalidates it on load.
  A stale id drops cleanly back to the join screen.
- **Each participant gets a 5-character resume code** (e.g. `K7M4Q`) from an
  alphabet with no `0/O`, `1/I/L`, `2/Z`, `5/S`, or `8/B`. *Resume with code* on the
  join screen restores the identity on another browser or device.

### Deliberate MVP limitation

Someone who clears their browser data can rejoin as a new participant. That is
accepted — closing it would mean real authentication, which is not worth it for a
workshop prototype. The resume code lets identity move between devices today, and
lets stronger identity be layered on later without a data migration.

## Admin authorisation

`POST /api/admin/login` exchanges the passcode for a bearer token stored in
`admin_sessions`. **Every** `/api/admin/*` route sits behind `requireAdmin`, which
re-checks the token against the database on every request — hiding a button in the
client changes nothing. Logging out revokes the token; failed logins are throttled
per IP. The tests assert every admin route returns 401 unauthenticated, with a
forged token, with a valid *participant* id, and after logout.

## Anonymity

`/api/results` returns aggregates only. No participant id, display name, or resume
code appears in it, and a test asserts that. Individual votes are never attributed
to a dot. The participant roster — names, join times, progress, resume codes —
lives behind `/api/admin/overview`.

---

## Known trade-offs

- **Identity is asserted by sending the UUID in a header.** Anyone holding another
  participant's UUID could vote as them. Consistent with the limitation above.
- **Results poll every 5s** rather than using websockets. Invisible at workshop scale.
- **One voting session.** `session_id` is already a real column on every table, so
  parallel groups are a routing change, not a migration.
- **Login throttling is per-process and in-memory**, so it resets on a serverless
  cold start.
