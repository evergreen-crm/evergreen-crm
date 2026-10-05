# Evergreen CRM — starter app

Your own software for Evergreen's group homes. This starter already does:

- **Login with a code** sent to the person's **email or cell phone** (no passwords to forget)
- **Invite-only access**: only people an Admin adds can sign in
- **Roles**: Admin, Manager (all homes), Staff (one home), Family (one resident)
- **Turn access off** instantly when someone leaves (account kept for the audit trail)
- **Residents** and **shift notes**: save as draft or sign; signed notes are locked
- **Family sharing**: families see only signed notes marked "Share with family"
- **Audit log**: every change is recorded automatically

The "who can see what" rules are inside the database, so even a mistake on a page
can't show one home's residents to another home or to the wrong family.

---

## What you need (all free to start)

1. **Node.js** (LTS version) — https://nodejs.org
2. **VS Code** — https://code.visualstudio.com
3. A **Supabase** account — https://supabase.com
4. Later: **Twilio** (text-message codes) and **Vercel** (putting it online)

## Step 1 — Create the database

1. In Supabase click **New project**. Region: **Canada (Central)**. Save the database password somewhere safe.
2. Open **SQL Editor → New query**. Open `supabase/schema.sql` from this folder, copy everything, paste, click **Run**.
   You should see "Success".

## Step 2 — Turn on login codes

In Supabase → **Authentication**:

1. **Sign In / Providers → Email**: on. Turn **off** "Allow new users to sign up" (so only invited people get in).
2. **Email templates → Magic Link**: replace the template body with:
   ```
   <h2>Your Evergreen sign-in code</h2>
   <p>Enter this code to sign in: <strong>{{ .Token }}</strong></p>
   <p>If you didn't ask for this, ignore this email.</p>
   ```
   (Without `{{ .Token }}` people get a link instead of a 6-digit code.)
3. **Phone** (optional, for text-message codes): turn on, choose **Twilio**, paste your Twilio Account SID,
   Auth Token and Message Service SID. Each text costs a small fee from Twilio.
4. Before real use: **Project Settings → Authentication → SMTP**: connect your own email sender
   (the built-in one is only for testing and sends very few emails per hour).

## Step 3 — Make yourself the first Admin

1. Supabase → **Authentication → Users → Add user → Create new user**. Enter your email, tick **Auto Confirm User**.
2. Copy your new user's **UID**.
3. SQL Editor, run (put in your UID, name and email):
   ```sql
   insert into homes (name) values ('Evergreen House 1');
   insert into profiles (id, full_name, email, role)
   values ('PASTE-YOUR-UID', 'Melvin', 'you@example.com', 'admin');
   ```

## Step 4 — Run the app on your computer

1. Open this folder in VS Code. Open the terminal (**View → Terminal**).
2. Copy `.env.local.example` to a new file named `.env.local`. Fill in the 3 values from
   Supabase → **Project Settings → API** (Project URL, anon public key, service_role key).
3. In the terminal:
   ```
   npm install
   npm run dev
   ```
4. Open http://localhost:3000 → enter your email → enter the code from your inbox.

## Step 5 — Test it like a stranger would

1. **Admin** page → add a second home and two residents (one per home).
2. Give access to a test **Staff** person (home 1) and a test **Family** person (resident in home 1).
   Use your own spare email/phone.
3. Sign in as each one (use a private/incognito window) and check:
   - Staff sees only home 1 residents, can add and sign notes, can't edit a signed note.
   - Family sees only their one resident and only signed notes marked "Share with family".
4. Admin → **Turn off** the staff person → they can't sign in or see anything.

## Step 6 — Put it online (when ready)

1. Put the code on **GitHub** (the `.env.local` file is ignored on purpose — never upload it).
2. **Vercel → Add New Project →** pick the GitHub repo → add the same 3 environment values → Deploy.
3. Supabase → **Authentication → URL Configuration**: set Site URL to your Vercel address.
4. **Get a security review** by a developer before entering real resident information.

---

## Access levels 1–8

Every person has one **access level** (their security level), set on **Admin**:

| Level | Group | Sees |
|---|---|---|
| 1 | Frontline | Their home |
| 2 | Program Coordinator | Their home |
| 3 | Program Manager | All homes |
| 4 | Director of Operations | All homes |
| 5 | Executive Director | All homes |
| 6 | CSO | All homes |
| 7 | CEO | All homes |
| 8 | Administrator | Everything, including giving access |

- The database keeps `role` in step with the level (1–2 = staff, 3–7 = manager, 8 = admin), so every existing rule keeps working.
- The seven portal divisions open automatically by level (**Admin → Portal divisions by level**). A division's "Who has access" still adds one-off people.
- To switch it on: Supabase → SQL Editor → run `supabase/access-levels.sql` (safe to run again). It also removes duplicate test homes/residents that have no records attached.

## How the files fit together

| File | What it does |
|---|---|
| `supabase/schema.sql` | Tables, access rules, signed-note lock, audit log |
| `proxy.js` | Sends anyone not logged in to `/login` |
| `app/login/page.js` | Email / cell phone code login |
| `app/page.js` | List of residents you're allowed to see |
| `app/residents/[id]/page.js` | One resident: shift note form + notes timeline |
| `app/admin/page.js` | Give people access, turn access off, add homes and residents |
| `app/actions.js` | Everything that saves data |
| `lib/auth.js` | Who's logged in and their role |
| `lib/supabase/*.js` | Connections to Supabase (`admin.js` uses the secret key — server only) |

## What to build next (in this order)

1. Medication records (MAR) — copy the shift notes pattern: table + rules in SQL, a form, a list
2. Incident reports — plus an email to the manager on save
3. Staff certifications with expiry warnings
4. Shift scheduling (calendar)
5. Monthly invoices
6. Family messaging

**Tip:** for each new table, always add `enable row level security` and policies like the ones in
`schema.sql`, and add an `audit_...` trigger line. No policy = nobody can see it (safe default).

## KPI Phase 2 — automatic daily job and emails

- Run `supabase/kpi-phase2.sql` once in Supabase → SQL Editor.
- In Vercel → Settings → Environment Variables you need: `CRON_SECRET` (any long random text), `RESEND_API_KEY` (from resend.com), plus the Supabase secret key that is already there.
- `vercel.json` runs `/api/cron/daily` every day at 14:00 UTC (about 7 a.m. in Vancouver). It scans for issues, saves the month's scorecard (`kpi_snapshots`), emails owners about overdue / due-soon / new items (once per day), and on Mondays emails the weekly summary to level 4+.
- Each run is logged in `automation_runs` and shown on the Action required page. Level 4+ can press "Run the daily job now". Everyone can turn their own reminder emails on or off there.
- **KPI owners** (`/kpi/owners`): level 4+ assigns one accountable person per KPI (`kpi_owners` table). Action items for that KPI go to its owner; owners see "KPIs you own" on the portal and get them in their reminder email; the weekly summary names each red/yellow KPI's owner.
