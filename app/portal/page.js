// Portal home: the seven Evergreen divisions in a grid, each with its areas.
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { visibleDivisions, getGrants, isBoss } from '@/lib/portal';
import { isDone } from '@/lib/divisions';
import { todayISO, fmtDate } from '@/lib/options';

const QUICK = [
  { href: '/dashboard', icon: '🔔', label: 'Today’s alerts' },
  { href: '/homes', icon: '🏡', label: 'Houses & residents' },
  { href: '/calendar', icon: '📅', label: 'Calendar' },
  { href: '/schedule', icon: '🗓', label: 'Shift schedule' },
  { href: '/timesheet', icon: '⏱', label: 'Timesheet' },
  { href: '/academy', icon: '🎓', label: 'Evergreen Academy' },
  { href: '/policies', icon: '📘', label: 'Policies' },
  { href: '/hr', icon: '🪪', label: 'HR files', boss: true },
];

export default async function PortalHome() {
  const { supabase, user, profile } = await requireUser(['admin', 'manager', 'staff']);
  const grants = await getGrants(supabase, profile);
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
          <p className="muted">Operations portal · {fmtDate(today)} · Organized by the seven divisions (ECC-DIV-2026-001)</p>
        </div>
      </div>

      <div className="quick-grid no-print">
        {QUICK.filter((q) => !q.boss || isBoss(profile)).map((q) => (
          <Link key={q.href} href={q.href} className="quick"><span>{q.icon}</span>{q.label}</Link>
        ))}
      </div>

      {divisions.length === 0 && (
        <p className="card muted">No divisions are open at your access level yet. Your administrator can change your level or give you access.</p>
      )}
      {profile.role === 'admin' && divisions.length > 0 && (
        <p className="muted small no-print">Divisions open for staff by access level (Admin → Portal divisions by level). Add one-off people on a division’s “Who has access”.</p>
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
    </main>
  );
}
