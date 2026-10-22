// Portal home: the seven Evergreen divisions in a grid, each with its areas.
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { visibleDivisions, getGrants, isBoss } from '@/lib/portal';
import { isDone } from '@/lib/divisions';
import { todayISO, fmtDate } from '@/lib/options';
import ExecDashboard from './ExecDashboard';
import MyBadge from '@/app/components/MyBadge';
import RoleHome from './RoleHome';
import { levelOf, groupOf } from '@/lib/levels';

const QUICK = [
  { href: '/dashboard', icon: '🔔', label: 'Today’s alerts' },
  { href: '/action-items', icon: '⚠️', label: 'Problems to fix' },
  { href: '/kpi', icon: '📈', label: 'How we’re doing (KPIs)', minLevel: 2 },
  { href: '/homes', icon: '🏡', label: 'Houses & residents' },
  { href: '/calendar', icon: '📅', label: 'Calendar' },
  { href: '/schedule', icon: '🗓', label: 'Shift schedule' },
  { href: '/timesheet', icon: '⏱', label: 'My hours' },
  { href: '/academy', icon: '🎓', label: 'Evergreen Academy' },
  { href: '/policies', icon: '📘', label: 'Policies' },
  { href: '/hr', icon: '🪪', label: 'HR files', boss: true },
  { href: '/launch', icon: '🚀', label: 'Opening a new house', boss: true },
  { href: '/probation', icon: '📝', label: 'First-90-days reviews', minLevel: 2 },
  { href: '/careers', icon: '🌱', label: 'Career & perks' },
  { href: '/badges', icon: '🏅', label: 'Performance badges' },
  { href: '/words', icon: '📖', label: 'What does this mean?' },
];

export default async function PortalHome() {
  const { supabase, user, profile } = await requireUser(['admin', 'manager', 'staff']);
  // Missing-details check (record-gaps.sql): runs at most every 6 hours when a leader opens the portal.
  const gapCheck = levelOf(profile) >= 2 || groupOf(profile) === 'hr' ? supabase.rpc('scan_record_gaps', { p_trigger: 'auto' }) : null;
  const grants = await getGrants(supabase, profile);
  if (gapCheck) await gapCheck;
  const divisions = visibleDivisions(profile, grants);
  const today = todayISO();

  const { data: rows } = await supabase.from('records').select('division, area, status, due_date');
  const count = {};
  for (const r of rows ?? []) {
    const k = `${r.division}/${r.area}`;
    const c = (count[k] ??= { total: 0, open: 0, overdue: 0 });
    c.total++;
    if (!isDone(r)) { c.open++; if (r.due_date && r.due_date < today) c.overdue++; }
  }
  const divTotals = (d) => d.areas.reduce((s, a) => {
    const c = count[`${d.key}/${a.key}`]; if (c) { s.open += c.open; s.overdue += c.overdue; } return s;
  }, { open: 0, overdue: 0 });

  return (
    <main className="portal">
      <div className="portal-hero">
        <img src="/logo-mark.png" alt="" />
        <div>
          <h1>Evergreen Community Care</h1>
          <p className="muted">Your home page · {fmtDate(today)}</p>
        </div>
      </div>

      <MyBadge supabase={supabase} userId={user.id} />

      <RoleHome supabase={supabase} profile={profile} userId={user.id} />

      <ExecDashboard supabase={supabase} profile={profile} userId={user.id} />

      {/* Frontline and Program Coordinators: everything else is folded away so their shift tools stay on top. */}
      <Fold open={!(levelOf(profile) <= 2 && profile.home_id && !groupOf(profile))}>
      <div className="quick-grid no-print">
        {QUICK.filter((q) => (!q.boss || isBoss(profile)) && levelOf(profile) >= (q.minLevel ?? 0)).map((q) => (
          <Link key={q.href} href={q.href} className="quick"><span>{q.icon}</span>{q.label}</Link>
        ))}
      </div>

      {divisions.length === 0 && (
        <p className="card muted">No areas are open for your job yet. Ask the office to give you access.</p>
      )}
      {profile.role === 'admin' && divisions.length > 0 && (
        <p className="muted small no-print">You see the areas that match your job. Need another area? Ask your manager or the office.</p>
      )}
      <div className="div-grid">
        {divisions.map((d) => {
          const t = divTotals(d);
          return (
            <section key={d.key} className="div-card" style={{ '--div': d.color }}>
              <Link href={`/portal/${d.key}`} className="div-head">
                <span className="div-icon">{d.icon}</span>
                <span>
                  <strong>{d.num}. {d.title}</strong>
                  <small>{d.standards}</small>
                </span>
                {t.overdue > 0 && <span className="badge bad">{t.overdue} overdue</span>}
              </Link>
              <ul className="area-list">
                {d.areas.map((a) => {
                  const c = count[`${d.key}/${a.key}`];
                  return (
                    <li key={a.key}>
                      <Link href={`/portal/${d.key}/${a.key}`}>
                        <span>{a.title} <span className="muted small">· {a.std}</span></span>
                        <span className="small">
                          {c?.overdue > 0 && <span className="badge bad">{c.overdue}</span>}{' '}
                          {c?.open > 0 && <span className="badge warn">{c.open} open</span>}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <p className="div-foot small">{d.roles}</p>
            </section>
          );
        })}
      </div>
      </Fold>
    </main>
  );
}

// Shows its children directly, or folded under “All portal areas” for frontline staff.
function Fold({ open, children }) {
  if (open) return <>{children}</>;
  return <details className="card no-print"><summary><strong>☰ All portal areas</strong> <span className="muted small">— schedule, timesheet, academy, policies, divisions</span></summary>{children}</details>;
}
