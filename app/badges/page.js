// Performance badges 🟢 🟡 🔴 — my badge and history, and (for Program Manager+ / HR) the team view and monthly badge form.
// Everyone has a badge, executives and administrators included; nobody sets their own. Program Coordinators see their own house read-only. Policy: Staff Duties, Expectations, Performance Badges and Bonus v1.1.
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { levelOf, groupOf, personLabel } from '@/lib/levels';
import { todayISO } from '@/lib/options';
import { BADGE, REASONS, bonusCount, fmtMonth, monthStart, reasonByKey, canSetBadge } from '@/lib/badges';
import BadgePill from '@/app/components/BadgePill';
import { setBadge, acknowledgeBadge } from './actions';
import NotReady from '@/app/components/NotReady';
import { plainError } from '@/lib/plain';

const prevMonth = (iso) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 10); };
const reasonText = (keys) => (keys ?? []).map((k) => reasonByKey(k)?.label).filter(Boolean).join(' · ');

export default async function Badges({ searchParams }) {
  const sp = await searchParams;
  const { supabase, user, profile } = await requireUser(['admin', 'manager', 'staff']);
  const lvl = levelOf(profile);
  const isHR = groupOf(profile) === 'hr';
  const seesTeam = isHR || lvl >= 2;
  const thisMonth = monthStart(todayISO());
  const lastMonth = prevMonth(thisMonth);

  const [{ data: all, error }, { data: people }] = await Promise.all([
    supabase.from('staff_badges').select('id, profile_id, month, color, reasons, restart, note, set_at, acknowledged_at').order('month', { ascending: false }),
    seesTeam ? supabase.from('profiles').select('id, full_name, level, role, home_id').in('role', ['staff', 'manager', 'admin']).eq('active', true).order('full_name') : Promise.resolve({ data: [] }),
  ]);
  if (error) return <main><h1>Performance badges</h1><NotReady what="Performance badges" file="performance-badges.sql" /></main>;

  const byPerson = {};
  for (const b of all ?? []) (byPerson[b.profile_id] ??= []).push(b);
  const mine = byPerson[user.id] ?? [];
  const myCount = bonusCount(mine);
  const canSet = (p) => canSetBadge(user.id, lvl, isHR, p.id, levelOf(p));
  const team = (people ?? []).map((p) => ({ ...p, lvl: levelOf(p), me: p.id === user.id, settable: canSet(p) }))
    .filter((p) => p.me || p.settable || lvl >= 5 || (p.lvl < 4 && (lvl >= 3 || isHR || p.home_id === profile.home_id)))
    .sort((a, z) => z.lvl - a.lvl || (a.full_name ?? '').localeCompare(z.full_name ?? ''));
  const settable = team.filter((p) => p.settable);
  const boss = settable.length > 0;

  const person = sp?.person ? settable.find((p) => p.id === sp.person) : null;
  const formMonth = sp?.month ? monthStart(sp.month) : thisMonth;
  const existing = person ? (byPerson[person.id] ?? []).find((b) => b.month === formMonth) : null;
  const groups = [...new Set(REASONS.map((r) => r.group))];

  return (
    <main>
      <div className="div-banner">
        <span className="div-icon">🏅</span>
        <div><h1>Performance badges</h1><p>🟢 Green · 🟡 Yellow · 🔴 Red — set every month. Green with zero substantiated complaints for 24 months earns the Excellence Bonus.</p></div>
      </div>
      {sp?.ok && <p className="message ok">{sp.ok}</p>}
      {sp?.error && <p className="message error">{plainError(sp.error)}</p>}

      <section className="card">
        <h2>My badge</h2>
        <div className="stats">
          <div className="stat"><strong><BadgePill color={mine[0]?.color} big /></strong><span>{mine[0] ? fmtMonth(mine[0].month) : 'Not set yet'}</span></div>
          <div className="stat"><strong>{myCount.months} / 24</strong><span>months toward the Excellence Bonus{myCount.eligible ? ' — 🎉 eligible' : ''}</span></div>
          <div className="stat"><strong>{myCount.yellows} / 3</strong><span>Yellow months used</span></div>
        </div>
        {mine.length > 0 ? (
          <table>
            <thead><tr><th>Month</th><th>Badge</th><th>Why</th><th>Note from your manager</th><th></th></tr></thead>
            <tbody>{mine.map((b) => (
              <tr key={b.id}>
                <td>{fmtMonth(b.month)}</td>
                <td><BadgePill color={b.color} />{b.restart && <div className="muted small">Bonus count restarted</div>}</td>
                <td className="small">{reasonText(b.reasons) || 'All measures met'}</td>
                <td className="small">{b.note ?? '—'}</td>
                <td>{b.acknowledged_at ? <span className="muted small">✓ Seen</span>
                  : <form action={acknowledgeBadge}><input type="hidden" name="id" value={b.id} /><button className="secondary">I have seen this</button></form>}</td>
              </tr>))}
            </tbody>
          </table>
        ) : <p className="muted">No badge yet. Your Program Manager sets it each month and talks it through with you.</p>}
        <p className="muted small">Think a badge is wrong? Ask your Program Manager for a review within 7 days.</p>
      </section>

      <section className="card">
        <h2>What the colours mean</h2>
        <ul>{Object.entries(BADGE).map(([k, b]) => <li key={k}><BadgePill color={k} /> {b.meaning}</li>)}</ul>
        <p className="muted small">Only substantiated complaints count. A youth or family making a complaint is their right and never counts against you by itself. Discouraging a complaint is a zero-tolerance breach.</p>
      </section>

      {seesTeam && (
        <section className="card">
          <h2>{lvl >= 3 || isHR ? 'Everyone’s badges' : 'My house'}</h2>
          <p className="muted small">Everyone has a badge — from Frontline to the CEO and Administrators. Nobody sets their own. Director of Operations and above are set by the Executive Director, CSO, CEO or an Administrator.</p>
          {team.length === 0 ? <p className="muted">No staff to show.</p> : (
            <table>
              <thead><tr><th>Staff</th><th>{fmtMonth(thisMonth)}</th><th>{fmtMonth(lastMonth)}</th><th>Bonus count</th>{boss && <th className="no-print"></th>}</tr></thead>
              <tbody>{team.map((p) => {
                const list = byPerson[p.id] ?? [];
                const now = list.find((b) => b.month === thisMonth); const prev = list.find((b) => b.month === lastMonth);
                const c = bonusCount(list);
                return (
                  <tr key={p.id}>
                    <td>{p.full_name}{p.me && <strong> (you)</strong>}<div className="muted small">{personLabel(p)}</div></td>
                    <td><BadgePill color={now?.color} />{now && !now.acknowledged_at && <div className="muted small">not seen yet</div>}</td>
                    <td><BadgePill color={prev?.color} /></td>
                    <td className="small">{c.months} / 24{c.eligible ? ' 🎉' : ''} · Yellow {c.yellows}/3</td>
                    {boss && <td className="no-print">{p.settable ? <Link href={`/badges?person=${p.id}#set`}>{now ? 'Change' : 'Set badge'}</Link> : <span className="muted small">{p.me ? 'Set by your leader' : '—'}</span>}</td>}
                  </tr>);
              })}</tbody>
            </table>
          )}
        </section>
      )}

      {boss && (
        <section className="card" id="set">
          <h2>Set a monthly badge</h2>
          <p className="muted small">Tick every reason that applies. The colour is worked out for you — the worst reason wins. No reasons ticked = 🟢 Green. Yellow or Red needs a note the staff member will read.</p>
          <form action={setBadge} key={`${person?.id}-${formMonth}`}>
            <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
              <label>Staff member<select name="profile_id" defaultValue={person?.id ?? ''} required>
                <option value="" disabled>Choose…</option>
                {settable.map((p) => <option key={p.id} value={p.id}>{p.full_name} ({personLabel(p)})</option>)}
              </select></label>
              <label>Month<input type="month" name="month" defaultValue={formMonth.slice(0, 7)} required /></label>
            </div>
            {groups.map((g) => (
              <fieldset key={g} style={{ marginTop: 8 }}>
                <legend className="small"><strong>{g}</strong></legend>
                {REASONS.filter((r) => r.group === g).map((r) => (
                  <label key={r.key} className="small" style={{ display: 'block', fontWeight: 400 }}>
                    <input type="checkbox" name="reasons" value={r.key} defaultChecked={existing?.reasons?.includes(r.key)} /> {BADGE[r.color].icon} {r.label}{r.restart && r.color !== 'red' ? ' (restarts bonus count)' : ''}
                  </label>
                ))}
              </fieldset>
            ))}
            <label style={{ marginTop: 8 }}>Note for the staff member<textarea name="note" rows={3} defaultValue={existing?.note ?? ''} placeholder="What happened, what is expected, and the support offered" /></label>
            <button style={{ marginTop: 8 }}>Save badge</button>
          </form>
        </section>
      )}
    </main>
  );
}
