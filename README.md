# jest-supertest-rbac-api-tests

A real, working **black-box** API test suite written in TypeScript with Jest
and Supertest, built against the `rbac-healthcare-system` sample backend.

This is the reference implementation for the capstone of the "API Testing
using TypeScript" course: every test in this repository sends a real HTTP
request over the network to a separately running server at
`http://localhost:5000`. Nothing here imports the backend's Express app or
its source code directly -- there is no `import app from '.../server'`
anywhere in this repository. That's a deliberate choice: it keeps this
suite an honest black-box test of the API as a client actually sees it,
rather than an in-process test that shares a process with the app under
test.

## What's in here

- `types.ts` -- typed request/response shapes matching the real API's
  snake_case JSON fields (`patient_id`, `doctor_id`, `appointment_date`,
  `full_name`, and so on).
- `helpers.ts` -- shared test infrastructure: a `supertest(BASE_URL)`
  client, a `loginAs(role)` helper that gets a real JWT for each of the
  app's 4 roles, a fixture helper that looks up a seeded user by role
  instead of hardcoding an ID, a direct-SQLite query helper for verifying
  writes at the storage layer, and a helper that fetches the app's real
  OpenAPI spec straight from the running Swagger UI.
- `tests/` -- one spec file per area of the app, mirroring the course's own
  module breakdown:
  - `smoke.test.ts` -- fast, tagged sanity checks (`npm run test:smoke`)
  - `auth.test.ts` -- login, registration, and the JWT contract
  - `appointments.test.ts` -- full CRUD lifecycle + scoped-access checks
  - `medical-records.test.ts` -- Doctor-only CRUD + the Nurse-visibility gap
  - `patients.test.ts` -- patient listing and per-patient records
  - `users.test.ts` -- **the capstone suite**: full RBAC + ownership + CRUD
    coverage of `/api/users`, the same area the course's own capstone
    targets
  - `rbac-matrix.test.ts` -- the 4-role permission matrix, parameterized
  - `negative-and-edge-cases.test.ts` -- confirmed (not assumed) failure
    behavior
  - `security.test.ts` -- JWT tampering, SQL injection resistance, and one
    real, unfixed parameter-tampering gap
  - `openapi.test.ts` -- validating real responses against the app's own
    live OpenAPI spec
  - `database.test.ts` -- verifying API writes directly against the
    on-disk SQLite file

## Prerequisites

- Node.js 18 or later
- A running copy of [`rbac-healthcare-system`](https://github.com/codedbyabhishekc/rbac-healthcare-system),
  seeded with its sample data

This works the same way on Windows, macOS, and Linux -- the commands below
are identical on all three (run them in any terminal: PowerShell, cmd, Bash,
zsh).

## Setup

**1. Clone and start the backend under test**, if you haven't already:

```bash
git clone https://github.com/codedbyabhishekc/rbac-healthcare-system.git
cd rbac-healthcare-system/backend
npm install
mkdir database
```

Create a `.env` file inside `backend/`:

```
PORT=5000
JWT_SECRET=any-long-random-string-you-want
NODE_ENV=development
```

Start it once to create the database, then stop it and seed real data:

```bash
npm start
# Ctrl+C once you see "Server is running on port 5000"
npm run seed
npm start
```

Leave this running -- every test in this repository talks to it over real
HTTP at `http://localhost:5000`.

**2. Clone and install this test suite**, as a sibling directory next to
`rbac-healthcare-system`:

```bash
git clone <this-repo-url> jest-supertest-rbac-api-tests
cd jest-supertest-rbac-api-tests
npm install
```

## Running the tests

With the backend from step 1 still running in its own terminal:

```bash
npm test
```

Other useful scripts:

```bash
npm run test:smoke      # just the @smoke-tagged sanity checks
npm run test:coverage   # with a coverage report
npm run test:watch      # watch mode while developing
```

A filterable HTML report of the last run is written to
`html-report/report.html`.

## Configuration

Two environment variables let you point this suite at a non-default setup:

| Variable | Default | Purpose |
|---|---|---|
| `RBAC_BASE_URL` | `http://localhost:5000` | Where the running backend is reachable |
| `RBAC_DB_PATH` | `../rbac-healthcare-system/backend/database/rbac.db` (relative to this repo) | Path to the backend's SQLite file, used by `database.test.ts` to verify writes directly at the storage layer |

If you cloned `rbac-healthcare-system` somewhere other than as a sibling of
this repository, set `RBAC_DB_PATH` to the real path before running `npm
test`:

```bash
RBAC_DB_PATH=/path/to/rbac-healthcare-system/backend/database/rbac.db npm test
```

(On Windows PowerShell: `$env:RBAC_DB_PATH = "C:\path\to\rbac.db"; npm test`)

## Why black-box, specifically

Supertest supports two ways of making a request: `supertest(app)`, passing
an imported Express application object directly (in-process -- no real
server needs to be running, but the test now shares a process with the
code it's testing), and `supertest(baseUrl)`, passing a URL string (black-box
-- a real HTTP request over a real socket to a server that has to already
be running somewhere). Every request in this repository uses the second
form. That's slower per request than in-process testing, and it requires
the backend to already be running before `npm test` works -- but it's also
the most realistic test possible: it exercises the exact same network
boundary a real client (a browser, a mobile app, another service) actually
crosses, rather than skipping it.

## Known, real divergences this suite documents on purpose

A few tests in this suite are not bugs in the test code -- they're
deliberately asserting on real, verified behavior of the backend that
doesn't match what a stricter reading of its documentation might imply:

- `POST /api/appointments` has no role restriction at all; any
  authenticated role, including Patient, can create an appointment for any
  `patient_id`, including someone else's.
- `GET /api/medical-records` is not filtered for a Nurse; a Nurse sees
  every medical record in the system, the same as an Administrator.
- `PUT /api/appointments/:id` lets a Nurse set `status: "completed"`,
  which arguably should be Doctor-only but isn't enforced.
- `PUT /api/users/:id` returns a raw `500` if `full_name` or `email` is
  omitted from the request body, even though the API's own OpenAPI spec
  marks both as optional; only `phone` can safely be left out on its own.

These are findings, not failures to fix -- each one is asserted on
explicitly so a future change to the backend that alters this behavior
will be caught by this suite, rather than drifting unnoticed.

## License

Copyright (C) 2026 SypherNext

This project is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0). You may
use, study and change it. If you share a modified version, or run one as a website or service
that other people use, you must make your full modified source code available under the same
license. See [LICENSE](LICENSE) for the full terms.
