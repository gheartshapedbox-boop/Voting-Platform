# Strategy Voting Platform (MVP)

A Kahoot-style voting prototype. Participants join with nothing but a name,
score each strategy on two axes, and the room's opinion lands on a 2×2 chart.
A facilitator dashboard manages strategies and watches progress.

Built to be **changed**, not to scale: one Node process, one SQLite file, no
build ceremony beyond Vite.

---

## Run it

```bash
npm install

# Development: API on :3001, client with hot reload on :5173
npm run dev
#   -> open http://localhost:5173

# Production-ish: build the client, serve everything from one process on :3001
npm run build
ADMIN_PASSCODE="pick-something" npm start
#   -> open http://localhost:3001
```

```bash
npm test        # 35 unit + integration tests, no server needed
```

### First five minutes

1. Open **Facilitator** → sign in with the admin passcode.
2. Add a few strategies.
3. Open **Vote** in another browser (or a private window), join with a name, score them.
4. Open **Results** to watch the chart fill in. It refreshes every 5 seconds.

### Configuration

| Variable | Default | Notes |
|---|---|---|
| `ADMIN_PASSCODE` | `let-me-in` | **Set this.** The server logs a warning while the default is in use. |
| `PORT` | `3001` | API + static client. |
| `DB_FILE` | `data/voting.db` | SQLite file; created on first boot. Delete it to start clean. |

---

## How it fits together

```
server/
  schema.sql          every important invariant, as a DB constraint
  db.js               opens SQLite, applies schema, seeds settings
  store.js            all SQL, one function per operation
  auth.js             admin passcode -> bearer token, and the guard middleware
  domain/
    identity.js       name rules, recovery codes        (pure, no DB)
    results.js        averages, quadrants, dispersion   (pure, no DB)
  routes/
    public.js         join / resume / vote / results
    admin.js          everything behind requireAdmin
client/src/
  screens/            Join, Vote, Results, Admin
  components/
    QuadrantChart.jsx pixels only -- every number is computed server-side
```

The split that matters: **`server/domain/` knows the rules, `QuadrantChart.jsx`
knows how to draw.** Changing what "contested" means, or moving the quadrant
midpoint, is a one-file edit in `results.js` that the chart picks up for free.

---

## Participant identity

- **`participants.id` is a UUID and never changes.** It is the identity.
- **`display_name` is just a label.** It is mutable and *not* unique — two people
  can both be "Alex" and remain separate participants. Renaming keeps every vote.
- **The browser stores only the UUID** (`localStorage`), and re-validates it against
  the server on load. A stale id (say, after the DB is reset) drops cleanly back to
  the join screen.
- **Each participant gets a 5-character recovery code** (e.g. `K7M4Q`) from an
  alphabet with no `0/O`, `1/I/L`, `5/S`, or `2/Z`. *Resume with code* on the join
  screen restores the identity on another browser or device.

### Deliberate MVP limitation

Someone who clears their browser data can rejoin as a new participant. That is
accepted — closing it would mean real authentication, which is not worth it for a
workshop prototype. The recovery code exists so identity can move between devices
*today*, and so stronger identity can be layered on later without a data migration.

---

## Data integrity

Enforced by the database, not by the UI:

| Invariant | Mechanism |
|---|---|
| One vote per participant per strategy | `UNIQUE (participant_id, strategy_id)` — re-voting is an `ON CONFLICT DO UPDATE`, so a double-submit can never fan out into duplicate rows |
| Scores stay on the 1–10 scale | `CHECK (x_score BETWEEN 1 AND 10)`, plus a server-side integer check that returns 400 |
| Recovery codes are unique | `UNIQUE` column, with retry-on-collision at insert |
| No orphaned votes | `FOREIGN KEY ... ON DELETE CASCADE`, with `PRAGMA foreign_keys = ON` (off by default in SQLite — without it the cascade rules are decorative) |
| Display names are never blank | `CHECK (length(trim(display_name)) BETWEEN 1 AND 40)` |

## Admin authorisation

`POST /api/admin/login` exchanges the passcode for a bearer token stored in
`admin_sessions`. **Every** `/api/admin/*` route is behind `requireAdmin`
middleware that re-checks the token server-side, so hiding a button in the client
changes nothing. Logging out revokes the token; failed logins are throttled per IP.

The tests assert this directly: every admin route 401s without a token, with a
forged token, and after logout.

## Anonymity

`/api/results` returns aggregates only. No participant id, display name, or
recovery code is ever attached to a plotted point — individual votes are collapsed
into counted dots (`{x, y, count}`), which is also why the chart grows a dot rather
than jittering positions nobody voted for. A test asserts that no participant id or
recovery code appears anywhere in the results payload.

Note that `/api/results` is **public** — fine for a workshop where results go on a
shared screen. To restrict it, move the route into `routes/admin.js`; it needs no
other change.

---

## Known trade-offs

- **Identity is asserted by sending the UUID in a header.** Anyone holding another
  participant's UUID could vote as them. Consistent with the limitation above.
- **Results poll every 5s** rather than using websockets. Simpler, and invisible at
  workshop scale.
- **Single session.** There are no rounds or multiple concurrent workshops; *Clear
  all votes* in the dashboard resets between runs. Adding a `session_id` column is
  the natural next step if management wants parallel groups.
