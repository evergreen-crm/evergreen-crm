// 🧩 Missing details: hire date, program and everything else a staff or house record needs.
// Program Coordinator + Program Manager have 1 week; then it goes to the Director of Operations;
// after 1 month to the Executive Director, CSO and CEO. Fixed items close by themselves (supabase/record-gaps.sql).
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { levelOf, groupOf, canHR } from '@/lib/levels';
import { fmtDate, todayISO } from '@/lib/options';
import { plainError } from '@/lib/plain';
import NotReady from '@/app/components/NotReady';
import { fillBlanks, checkNow } from './actions';

const STAGE = {
  1: { short: 'Due', who: 'Program Coordinator & Program Manager', cls: '' },
  2: { short: 'Overdue → Director', who: 'now also the Director of Operations', cls: 'warn' },
  3: { short: 'Over a month → ED & CEO', who: 'now also the Executive Director, CSO and CEO', cls: 'bad' },
};
const FILLABLE = ['hire_date', 'program', 'position', 'employment', 'emergency', 'phone'];
const POSITIONS = ['Youth Worker', 'Support Worker', 'Senior Support Worker', 'Program Coordinator', 'Program Manager', 'Director of Operations', 'Office / Admin'];
const days = (a, b) => Math.max(0, Math.round((new Date(b) - new Date(a)) / 864e5));

function FillForm({ id, fields }) {
  const f = new Set(fields);
  return (
    <form action={fillBlanks} className="fill-form">
      <input type="hidden" name="profile_id" value={id} />
      <div className="row">
        {f.has('hire_date') && <label>Hire date<input type="date" name="hire_date" /></label>}
        {f.has('program') && (
          <label>Program
            <select name="program" defaultValue="">
              <option value="">Choose…</option>
              <option value="MCFD">MCFD only — children & youth</option>
              <option value="CLBC">CLBC only — adults</option>
              <option value="Both">Both MCFD and CLBC</option>
            </select>
          </label>
        )}
        {f.has('position') && (
          <label>Position<input name="position" list="positions" placeholder="e.g. Youth Worker" /></label>
        )}
        {f.has('employment') && (
          <label>Full-time, part-time or casual
            <select name="employment_type" defaultValue=""><option value="">Choose…</option><option>Full-time</option><option>Part-time</option><option>Casual</option></select>
          </label>
        )}
        {f.has('phone') && <label>Phone number<input name="phone" type="tel" inputMode="tel" /></label>}
        {f.has('emergency') && <label>Emergency contact (name)<input name="emergency_contact" /></label>}
        {f.has('emergency') && <label>Emergency phone<input name="emergency_phone" type="tel" inputMode="tel" /></label>}
      </div>
      <button>Save</button>
      <span className="muted small"> Only empty boxes are filled in. To change something already saved, use the HR page.</span>
    </form>
  );
}

export default async function Records({ searchParams }) {
  const sp = await searchParams;
  const { supabase, user, profile } = await requireUser(['admin', 'manager', 'staff']);
  const lvl = levelOf(profile);
  const hr = canHR(profile);
  const lead = lvl >= 2 || hr;
  const today = todayISO();

  if (lead) await supabase.rpc('scan_record_gaps', { p_trigger: 'auto' }); // runs at most every 6 hours; the morning job does the rest
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const none = Promise.resolve({ data: [] });
  const [open, fixed, homes, runs] = await Promise.all([
    supabase.from('record_gaps').select('*').is('fixed_at', null).order('found_at'),
    supabase.from('record_gaps').select('id, kind, subject_id, subject_name, home_id, label, found_at, fixed_at').not('fixed_at', 'is', null).gte('fixed_at', since).order('fixed_at', { ascending: false }),
    supabase.from('homes').select('id, name').order('name'),
    lead ? supabase.from('record_gap_runs').select('ran_at, found, fixed, escalated, open_now').order('ran_at', { ascending: false }).limit(1) : none,
  ]);
  if (open.error && /does not exist|schema cache/i.test(open.error.message)) return <main><h1>Missing details</h1><NotReady what="Missing details" file="record-gaps.sql" /></main>;

  const hName = Object.fromEntries((homes.data ?? []).map((h) => [h.id, h.name]));
  const stageF = Number(sp?.stage) || null;
  const homeF = sp?.home ?? null;
  let gaps = open.data ?? [];
  const allOpen = gaps;
  if (stageF) gaps = gaps.filter((g) => g.stage === stageF);
  if (homeF) gaps = gaps.filter((g) => (homeF === 'none' ? !g.home_id : g.home_id === homeF));
  const fixedRows = fixed.data ?? [];
  const avgFix = fixedRows.length ? Math.round(fixedRows.reduce((t, g) => t + days(g.found_at, g.fixed_at), 0) / fixedRows.length) : null;

  // One card per person / house
  const groups = [];
  const byKey = {};
  for (const g of gaps) {
    const k = g.kind + g.subject_id;
    if (!byKey[k]) groups.push(byKey[k] = { key: k, kind: g.kind, id: g.subject_id, name: g.subject_name, home: g.home_id, items: [] });
    byKey[k].items.push(g);
  }
  for (const x of groups) {
    x.stage = Math.max(...x.items.map((g) => g.stage));
    x.due = x.items.map((g) => g.due_on).sort()[0];
  }
  groups.sort((a, b) => b.stage - a.stage || a.due.localeCompare(b.due) || (a.name ?? '').localeCompare(b.name ?? ''));

  const canFill = (x) => x.kind === 'staff' && (lvl >= 3 || hr || (lvl === 2 && x.home && x.home === profile.home_id));
  const houseRows = [...(homes.data ?? []).map((h) => ({ id: h.id, name: h.name })), { id: 'none', name: 'No house (office & managers)' }]
    .map((h) => {
      const mine = (g) => (h.id === 'none' ? !g.home_id : g.home_id === h.id);
      const o = allOpen.filter(mine);
      return { ...h, open: o.length, late: o.filter((g) => g.stage >= 2).length, fixed: fixedRows.filter(mine).length };
    }).filter((h) => h.open || h.fixed);
  const q = (o) => { const p = new URLSearchParams(); const v = { stage: stageF, home: homeF, ...o }; for (const k in v) if (v[k]) p.set(k, v[k]); const s = p.toString(); return s ? `/records?${s}` : '/records'; };
  const last = runs.data?.[0];

  return (
    <main>
      <div className="div-banner">
        <span className="div-icon">🧩</span>
        <div>
          <h1>Missing details</h1>
          <p>{lead ? 'Hire dates, programs, contacts, certificates and house details. Fill them in within 1 week.' : 'Details your staff record still needs.'}</p>
        </div>
      </div>
      {sp?.ok && <p className="message ok">{sp.ok}</p>}
      {sp?.error && <p className="message error">{plainError(sp.error)}</p>}

      {lead && (
        <>
          <div className="stats">
            <Link href={q({ stage: null })} className="stat"><strong>{allOpen.length}</strong><span>Missing now</span></Link>
            <Link href={q({ stage: 1 })} className="stat"><strong>{allOpen.filter((g) => g.stage === 1).length}</strong><span>Due within 1 week</span></Link>
            <Link href={q({ stage: 2 })} className="stat"><strong style={{ color: '#9a6700' }}>{allOpen.filter((g) => g.stage === 2).length}</strong><span>Overdue → Director</span></Link>
            <Link href={q({ stage: 3 })} className="stat"><strong style={{ color: '#b3261e' }}>{allOpen.filter((g) => g.stage === 3).length}</strong><span>Over a month → ED & CEO</span></Link>
            <div className="stat"><strong style={{ color: '#0b5a34' }}>{fixedRows.length}</strong><span>Fixed in 30 days{avgFix != null ? ` · ${avgFix} day${avgFix === 1 ? '' : 's'} on average` : ''}</span></div>
          </div>

          <details className="card">
            <summary><strong>How it works</strong></summary>
            <ol className="small">
              <li>Every morning the CRM checks every active staff member and house for missing details.</li>
              <li>Anything missing → the house’s <strong>Program Coordinator</strong> and the <strong>Program Manager</strong> get a notification (HR too, for staff records). <strong>Due in 1 week.</strong></li>
              <li>Not done in 1 week → it goes to the <strong>Director of Operations</strong>.</li>
              <li>Still not done after 1 month → it goes to the <strong>Executive Director, CSO and CEO</strong>.</li>
              <li>Every Monday there’s a reminder while anything is still missing. Once a detail is filled in, it closes by itself and counts as fixed.</li>
            </ol>
            <p className="muted small">Checked for staff: hire date, program, position, full-time/part-time/casual, phone, emergency contact, house (frontline), criminal record check and First Aid (missing or expired). For houses: map location, on-call phone, house phone and address.</p>
          </details>

          {houseRows.length > 0 && (
            <section className="card">
              <h2 style={{ marginTop: 0 }}>By house</h2>
              <table>
                <thead><tr><th>House</th><th>Missing now</th><th>Overdue</th><th>Fixed in 30 days</th></tr></thead>
                <tbody>{houseRows.map((h) => (
                  <tr key={h.id}>
                    <td><Link href={q({ home: homeF === h.id ? null : h.id })}>{homeF === h.id ? '✓ ' : ''}{h.name}</Link></td>
                    <td>{h.open}</td>
                    <td>{h.late ? <span className="badge warn">{h.late}</span> : '0'}</td>
                    <td>{h.fixed}</td>
                  </tr>))}
                </tbody>
              </table>
            </section>
          )}

          <div className="row" style={{ alignItems: 'center', gap: 10 }}>
            <form action={checkNow}><button className="secondary">🔄 Check now</button></form>
            {(stageF || homeF) && <Link href="/records" className="small">Show everything</Link>}
            {last && <span className="muted small">Last checked {new Date(last.ran_at).toLocaleString('en-CA', { timeZone: 'America/Vancouver', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>}
          </div>
        </>
      )}

      {!groups.length && <p className="card">{allOpen.length ? 'Nothing here with this filter.' : '✓ Nothing missing. Every record is complete.'}</p>}

      <datalist id="positions">{POSITIONS.map((p) => <option key={p} value={p} />)}</datalist>
      {groups.map((x) => {
        const st = STAGE[x.stage];
        const fill = x.items.filter((g) => FILLABLE.includes(g.field)).map((g) => g.field);
        const other = x.items.filter((g) => !FILLABLE.includes(g.field));
        const self = x.kind === 'staff' && x.id === user.id;
        return (
          <section key={x.key} id={`p-${x.id}`} className={`card gap-card${x.stage === 3 ? ' rh-urgent' : ''}`}>
            <div className="rh-head">
              <h3 style={{ margin: 0 }}>{x.kind === 'house' ? '🏠 ' : '👤 '}{x.name}{x.kind === 'staff' && x.home && <span className="muted small"> · {hName[x.home]}</span>}</h3>
              <span className={`badge ${st.cls}`}>{st.short}{x.stage === 1 ? ` ${fmtDate(x.due)}` : ''}</span>
            </div>
            <ul className="gap-chips">
              {x.items.map((g) => (
                <li key={g.id} className={g.stage > 1 ? 'late' : ''} title={`Found ${fmtDate(g.found_at.slice(0, 10))}`}>{g.label}{g.stage > 1 && <span className="small"> · {days(g.found_at, new Date())} days</span>}</li>
              ))}
            </ul>
            {x.stage > 1 && <p className="small muted" style={{ margin: '4px 0' }}>Not done within 1 week — {st.who}.</p>}

            {fill.length > 0 && canFill(x) && !self && (
              <details open={sp?.fill === x.id}>
                <summary className="button secondary small-btn">✏️ Fill in</summary>
                <FillForm id={x.id} fields={fill} />
              </details>
            )}
            {fill.length > 0 && (!canFill(x) || self) && (
              <p className="small muted">{self ? 'Please give these to your Program Coordinator or HR so they can add them.' : 'The Program Manager or HR fills these in.'}</p>
            )}
            <div className="row small" style={{ gap: 12 }}>
              {other.some((g) => ['crc', 'first_aid'].includes(g.field)) && (hr || lvl >= 3) && <Link href={`/hr/${x.id}`}>📜 Add the certificate on the HR page →</Link>}
              {other.some((g) => ['crc', 'first_aid'].includes(g.field)) && !(hr || lvl >= 3) && <span className="muted">Certificates: the staff member uploads the new certificate; HR records it.</span>}
              {other.some((g) => g.field === 'house') && (lvl >= 8 || profile.role === 'admin') && <Link href="/admin">🏠 Set their house on the Access page →</Link>}
              {other.some((g) => g.field === 'house') && !(lvl >= 8 || profile.role === 'admin') && <span className="muted">House: an Administrator sets it on the Access page.</span>}
              {x.kind === 'house' && (lvl >= 3 || profile.role === 'admin') && <Link href={`/homes/${x.id}?edit=1`}>✏️ Edit the house →</Link>}
              {x.kind === 'house' && lvl < 3 && profile.role !== 'admin' && <span className="muted">House details: the Program Manager fills these in.</span>}
              {x.kind === 'staff' && (hr || lvl >= 3) && <Link href={`/hr/${x.id}`}>Open HR file →</Link>}
            </div>
          </section>
        );
      })}

      {lead && fixedRows.length > 0 && (
        <details className="card">
          <summary><strong>✓ Fixed in the last 30 days ({fixedRows.length})</strong></summary>
          <ul className="list compact">
            {fixedRows.slice(0, 60).map((g) => (
              <li key={g.id}><span>{g.subject_name}: {g.label}</span><span className="small muted">{fmtDate(g.fixed_at.slice(0, 10))} · took {days(g.found_at, g.fixed_at)} day{days(g.found_at, g.fixed_at) === 1 ? '' : 's'}</span></li>
            ))}
          </ul>
        </details>
      )}
    </main>
  );
}
