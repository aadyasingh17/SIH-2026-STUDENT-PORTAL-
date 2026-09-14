# SkillBridge

**The Ultimate Academia-Industry Placement Engine.**

A unified platform for students, universities, and corporate recruiters to manage academics, verify skills, and streamline campus hiring workflows — built for **Smart India Hackathon 2026**.

---

## 🎯 Problem Statement

**PS ID:** 26044
**Title:** Portal for Academia–Industry Collaboration for Skill Mapping, Internships and Placement
**Category:** Software
**Reference:** [sih.gov.in/sih2026PS](https://www.sih.gov.in/sih2026PS)

Higher education institutions and industry recruiters currently operate on disconnected systems — colleges track academic records in isolation, students have no single place to showcase verified skills, and recruiters lack visibility into a verified, ready-to-hire talent pool. SkillBridge closes this gap with one shared portal for all three stakeholders.

## 👥 Team

6-member team, Smart India Hackathon 2026.

## 🧩 The Three Portals

SkillBridge is built around three role-based workspaces sharing one data layer:

| Portal | Who it's for | Purpose |
|---|---|---|
| **Student** | Students | Track academics (courses, attendance, grades), get verified skill badges, follow a personalized learning path, see market demand for their skills, and apply to internships/placement drives |
| **College** | Placement cells / TPOs | Manage the student roster, verify skills/records, run placement drives, and monitor placement KPIs on one dashboard |
| **Company** | Recruiters | Post drives/openings, view a verified pool of applicants, and manage hiring workflow (planned) |

## 🏗️ Tech Stack

- **Frontend:** HTML, CSS, vanilla JavaScript (no framework — lightweight, fast to iterate on for a hackathon timeline)
- **Backend:** Node.js + Express
- **Database:** Supabase (managed Postgres)
- **Auth:** JSON Web Tokens (JWT) + bcrypt password hashing for the College portal

## 📂 Project Structure

```
SIH-2026-STUDENT-PORTAL/
├── index.html              # Single-page app shell — all three role views live here
├── css/styles.css          # Shared design system (dark theme, green accent)
├── js/
│   ├── app.js              # Auth, routing between role views, modal logic
│   └── supabaseClient.js   # Supabase client init
└── backend/backend/
    ├── server.js            # Entry point
    ├── src/
    │   ├── app.js           # Express app + middleware wiring
    │   ├── config/          # Environment config
    │   ├── middlewares/     # Auth, role-guard, error handling
    │   └── routes/          # Route aggregator
    ├── routes/              # Feature routes (college auth, students, drives, dashboard)
    └── config/              # Supabase client (server-side)
```

## ✅ Current Feature Status

### Student Portal
- Dashboard overview (CGPA, industry-match score, active applications)
- Profile management
- Courses, Attendance, Marks & Grades views
- Skill Assessment + verified "My Skills" tracker
- Learning Path timeline
- Market Demand (industry skill-gap insight)
- Internships & Jobs listing with apply flow

### College Portal
- College signup/login (JWT + bcrypt)
- Profile management
- Student roster CRUD (add/view/update/delete)
- Placement drive CRUD
- Dashboard KPIs (total students, verified students, active drives, applications)

### Company Portal
- Not yet built (signup/login shell only)

## 🚀 Running Locally

**Backend:**
```bash
cd backend/backend
npm install
cp .env.example .env   # fill in Supabase URL, service role key, JWT secret
npm run dev             # runs on http://localhost:5000
```

**Frontend:**
Open `index.html` with a local server (e.g. VS Code "Live Server") so it can reach the backend without CORS issues. Make sure `FRONTEND_URL` in `.env` matches the port your frontend runs on.

## 🗺️ Roadmap

See the "What's left before showcase" breakdown for the prioritized punch list going into the demo.
