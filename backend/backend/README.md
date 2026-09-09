# Student Portal Backend

Express API for the SIH student placement portal. The backend uses Supabase
PostgreSQL for persistence and custom JWTs for college authentication.

## Windows 11 setup

From PowerShell:

```powershell
cd backend\backend
Copy-Item .env.example .env
npm install
npm run dev
```

Edit `.env` before starting the server:

```env
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<server-only-service-role-key>
JWT_SECRET=<long-random-secret>
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` or `JWT_SECRET` to the browser or
commit `.env`.

## API

- `GET /api/health`
- `POST /api/college/signup`
- `POST /api/college/login`
- `GET|PUT /api/college/profile`
- `GET|POST /api/college/students`
- `PUT|DELETE /api/college/students/:id`
- `GET|POST /api/college/drives`
- `PUT|DELETE /api/college/drives/:id`
- `GET /api/college/drives/:id/applications`
- `GET /api/college` for dashboard metrics

Protected endpoints require `Authorization: Bearer <jwt>`. The JWT contains
the college id and the `college` role; every student, drive, and dashboard
query is scoped to that college.

## Six-person parallel hackathon split

1. **Backend Person 1 - platform setup:** own the Express app, environment
   setup, Supabase connection, JWT middleware, error handling, API contract,
   and integration branch.
2. **Backend Person 2 - student module:** student profile CRUD, verification,
   validation, and student-facing APIs.
3. **Backend Person 3 - company and drives:** company accounts, placement drive
   CRUD, eligibility rules, and drive status transitions.
4. **Backend Person 4 - applications and placements:** apply/withdraw flow,
   shortlist, interview stages, offer/placement status, and authorization
   checks.
5. **Backend Person 5 - database and security:** Supabase schema/migrations,
   indexes, row-level security review, seed data, rate limiting, and secrets.
6. **Backend Person 6 - integration and showcase:** frontend API wiring,
   Postman collection, smoke tests, deployment, demo data, and presentation
   flow.

All contributors should agree on endpoint names and response shapes before
parallel implementation. Person 1 should merge shared middleware and API
contract changes first, while feature owners work on separate route modules.
