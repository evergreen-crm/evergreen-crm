// 🚀 Opening-day readiness (plan E2): automatic checks for missing details, the "before opening" tick list,
// and one button to switch off every test account on opening day. Administrator; the CEO can read.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { levelOf } from '@/lib/levels';
import { todayISO, fmtDate, fmtDateTime } from '@/lib/options';
import { adminKey } from '@/lib/supabase/admin';
import { GOLIVE_GROUPS, GOLIVE_KEYS } from './items';
import { saveItem, switchOffTests } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Opening-day readiness · Evergreen' };

const isTestHouse = (h) => /test/i.test(h?.name ?? '');

function Check({ ok, label, children, href }) {
  return (
    <li style={{ marginBottom: 8 }}>
      <span>{ok ? '✅' : '⚠️'}</span> <strong>{label}</strong>{href && <> · <Link href={href}>Open</Link></>}
      {!ok && children && <div className="small" style={{ marginLeft: 24 }}>{children}</div>}
    </li>
  );
}
const names = (list, max = 12) => <>{list.slice(0, max).map((p, i) => <span key={p.id ?? i}>{i ? ', ' : ''}{p.href ? <Link href={p.href}>{p.label}</Link> : p.label}</span>)}{list.length > max ? ` and ${list.length - max} more` : ''}</>;

export default async function GoLive({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  const isAdmin = profile.role === 'admin';
  if (!isAdmin && !(levelOf(profile) >= 7 && !profile.staff_group)) redirect('/');
  const today = todayISO();

  const [{ data: people }, { data: details }, { data: homes }, { data: trainings }, { data: rates }, { data: items }, { data: residents }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, email, phone, role, active, is_test, home_id, staff_group, level').neq('role', 'family'),
    supabase.from('staff_details').select('profile_id, position, hire_date, program, program_confirmed, emergency_contact, emergency_phone, employment_type'),
    supabase.from('homes').select('id, name, address, licence_number, phone, on_call_phone, program, capacity, lat, lng'),
    supabase.from('trainings').select('profile_id, title, expires_on'),
    supabase.from('pay_rates').select('position, hourly_rate, grid_level, active'),
    supabase.from('golive_items').select('key, done, note, done_at, by:done_by(full_name)'),
    supabase.from('residents').select('id, home_id, status'),
  ]);
  const det = new Map((details ?? []).map((d) => [d.profile_id, d]));
  const real = (people ?? []).filter((p) => p.active && !p.is_test);
  const tests = (people ?? []).filter((p) => p.is_test);
  const testsOn = tests.filter((p) => p.active);
  const staff = real.filter((p) => p.role !== 'admin');
  const link = (p, hash = '') => ({ id: p.id, label: p.full_name, href: `/hr/${p.id}${hash}` });

  const noEmail = real.filter((p) => !p.email);
  const noJob = staff.filter((p) => { const d = det.get(p.id); return !d?.position || !d?.hire_date; });
  const noProgram = staff.filter((p) => !det.get(p.id)?.program_confirmed);
  const noEmergency = real.filter((p) => { const d = det.get(p.id); return !d?.emergency_contact || !d?.emergency_phone; });
  const byPerson = new Map();
  for (const t of trainings ?? []) (byPerson.get(t.profile_id) ?? byPerson.set(t.profile_id, []).get(t.profile_id)).push(t);
  const expired = staff.filter((p) => (byPerson.get(p.id) ?? []).some((t) => t.expires_on && t.expires_on < today));
  const noFirstAid = staff.filter((p) => !p.staff_group && !(byPerson.get(p.id) ?? []).some((t) => /first aid/i.test(t.title) && (!t.expires_on || t.expires_on >= today)));

  const realHomes = (homes ?? []).filter((h) => !isTestHouse(h));
  const testHomes = (homes ?? []).filter(isTestHouse);
  const homeGaps = realHomes.map((h) => ({ h, miss: [
    !h.address && 'address', !h.licence_number && 'licence number', !h.phone && 'house phone', !h.on_call_phone && 'on-call phone',
    !['MCFD', 'CLBC'].includes(h.program) && 'program (MCFD / CLBC)', !h.capacity && 'number of beds', (h.lat == null || h.lng == null) && 'map location (for clock-in)',
  ].filter(Boolean) })).filter((x) => x.miss.length);
  const testResidents = (residents ?? []).filter((r) => testHomes.some((h) => h.id === r.home_id));
  const noRate = (rates ?? []).filter((r) => r.active !== false && r.hourly_rate == null && r.grid_level == null);

  const setup = [
    ['Email sending (Resend)', !!process.env.RESEND_API_KEY],
    ['Server key (automatic jobs, public forms)', !!adminKey()],
    ['Daily job secret (CRON_SECRET)', !!process.env.CRON_SECRET],
    ['Portal address for email links (SITE_URL)', !!(process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL)],
    ['Ask Evergreen full answers (ANTHROPIC_API_KEY) — optional', !!process.env.ANTHROPIC_API_KEY],
  ];

  const itemBy = new Map((items ?? []).map((i) => [i.key, i]));
  const ticked = GOLIVE_KEYS.filter((k) => itemBy.get(k)?.done).length;
  const autoChecks = [noEmail, noJob, noProgram, noEmergency, expired, noFirstAid, homeGaps, noRate].filter((x) => x.length === 0).length + (realHomes.length ? 1 : 0) + (testsOn.length ? 0 : 1);

  return (
    <main>
      <h1>🚀 Opening-day readiness</h1>
      <p className="muted">What still needs doing before Evergreen opens with real staff and real youth and adults. The checks below update by themselves; tick the other items as they are done.</p>
      {sp.ok && <p className="message ok">{sp.ok}</p>}
      {sp.error && <p className="message">{sp.error}</p>}

      <div className="stats">
        <div className="stat"><strong>{autoChecks}/10</strong><span>automatic checks OK</span></div>
        <div className="stat"><strong>{ticked}/{GOLIVE_KEYS.length}</strong><span>items ticked</span></div>
        <div className={`stat ${testsOn.length ? 'warn' : ''}`}><strong>{testsOn.length}</strong><span>test accounts still on</span></div>
        <div className="stat"><strong>{staff.length}</strong><span>real staff accounts</span></div>
      </div>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Automatic checks</h2>
        <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
          <Check ok={realHomes.length > 0} label={`Real houses entered (${realHomes.length})`} href="/homes">No real house yet.</Check>
          <Check ok={homeGaps.length === 0} label="Every house has its address, licence, phones, program, beds and map location" href="/homes">
            {homeGaps.map(({ h, miss }) => <div key={h.id}><Link href={`/homes/${h.id}`}>{h.name}</Link>: missing {miss.join(', ')}</div>)}
          </Check>
          <Check ok={noEmail.length === 0} label="Everyone has an email (sign-in codes and alerts)" href="/admin">{names(noEmail.map((p) => link(p)))}</Check>
          <Check ok={noJob.length === 0} label="Every staff member has a position and hire date (staff number, offer letter, probation)">{names(noJob.map((p) => link(p, '#details')))}</Check>
          <Check ok={noProgram.length === 0} label="Every staff member’s program (MCFD / CLBC / both) is confirmed">{names(noProgram.map((p) => link(p, '#details')))}</Check>
          <Check ok={noEmergency.length === 0} label="Everyone has an emergency contact and phone">{names(noEmergency.map((p) => link(p, '#details')))}</Check>
          <Check ok={noFirstAid.length === 0} label="Every house staff member has a current First Aid certificate on file">{names(noFirstAid.map((p) => link(p, '#certificates')))}</Check>
          <Check ok={expired.length === 0} label="No expired certificates">{names(expired.map((p) => link(p, '#certificates')))}</Check>
          <Check ok={noRate.length === 0} label="Every position has a pay rate or grid level" href="/hr/pay-rates">{noRate.map((r) => r.position).join(', ')}</Check>
          <Check ok={testsOn.length === 0} label="Test accounts switched off">{testsOn.length} still on (see the button at the bottom).</Check>
        </ul>
        {(testHomes.length > 0 || testResidents.length > 0) && <p className="small">ℹ Test data still in the portal: {testHomes.map((h) => h.name).join(', ')}{testResidents.length ? ` with ${testResidents.length} test resident${testResidents.length === 1 ? '' : 's'}` : ''}. Archive or remove it before opening (tick “Test house… archived” below).</p>}
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Portal setup</h2>
        <ul style={{ listStyle: 'none', paddingLeft: 0 }}>{setup.map(([l, ok]) => <li key={l}>{ok ? '✅' : '⚠️'} {l}</li>)}</ul>
        <p className="muted small">These are settings in Vercel. Only whether each one is set is shown, never its value.</p>
      </section>

      {GOLIVE_GROUPS.map(([group, list]) => (
        <section key={group} className="card">
          <h2 style={{ marginTop: 0 }}>{group}</h2>
          {list.map(([key, label]) => {
            const it = itemBy.get(key);
            return (
              <form key={key} id={key} action={saveItem} className="row" style={{ alignItems: 'center', borderBottom: '1px solid var(--line, #e5e5e5)', padding: '6px 0' }}>
                <input type="hidden" name="key" value={key} />
                <span style={{ flex: '1 1 320px' }}>{it?.done ? '✅' : '⬜'} {label}
                  {it?.done && <div className="muted small">Ticked {fmtDateTime(it.done_at)} by {it.by?.full_name ?? '—'}</div>}</span>
                {isAdmin ? (<>
                  <input name="note" defaultValue={it?.note ?? ''} maxLength={1000} placeholder="Note (optional)" style={{ flex: '1 1 200px' }} />
                  <button name="done" value={it?.done ? 'no' : 'yes'} className={it?.done ? 'secondary small' : 'small'}>{it?.done ? 'Untick' : 'Done'}</button>
                </>) : it?.note ? <span className="small">{it.note}</span> : null}
              </form>
            );
          })}
        </section>
      ))}

      <section className="card" id="tests" style={{ borderLeft: '4px solid #b42318' }}>
        <h2 style={{ marginTop: 0 }}>Opening day: switch off the test accounts</h2>
        <p className="small">Test accounts ({tests.length}): {tests.map((p) => `${p.full_name}${p.active ? '' : ' (off)'}`).join(', ') || 'none'}.</p>
        <p className="small">This turns off their portal access and blocks their sign-in. Their test records stay (for the audit trail). Your own account is never switched off. The test portal is not affected.</p>
        {isAdmin && testsOn.length > 0 ? (
          <form action={switchOffTests} className="row" style={{ alignItems: 'end' }}>
            <label>Type SWITCH OFF to confirm<input name="confirm" autoComplete="off" /></label>
            <button className="danger">Switch off {testsOn.length} test account{testsOn.length === 1 ? '' : 's'}</button>
          </form>
        ) : <p className="small">{testsOn.length ? 'Only the Administrator can do this.' : '✅ All test accounts are off.'}</p>}
      </section>
      <p className="muted small">Checked {fmtDate(today)}. See also <Link href="/admin/access-review">Monthly access review</Link> and <Link href="/house-requirements">House requirements</Link>.</p>
    </main>
  );
}
