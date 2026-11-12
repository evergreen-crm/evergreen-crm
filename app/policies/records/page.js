// 📝 Policy sign-off records: who has signed every policy, and whose record is waiting for a witness.
// Each person sees their own. House leaders see their houses; HR, directors and the Administrator see everyone.
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { fmtDate } from '@/lib/options';
import { WITNESS_DAYS, POLICY_DAYS } from '@/lib/policyDue';
import { createAdminClient, adminKey } from '@/lib/supabase/admin';
import { loadPolicyStatus } from '@/lib/policyJob';
import { levelOf, groupOf } from '@/lib/levels';
import { todayISO } from '@/lib/options';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Policy sign-off records · Evergreen' };
const STAGE = { 1: 'Program Coordinator', 2: 'Program Manager', 3: 'Directors' };

export default async function PolicyRecords({ searchParams }) {
  const sp = await searchParams;
  const { supabase, user, profile } = await requireUser(['admin', 'manager', 'staff']);
  // Who still has policies to sign: yourself, your houses' staff (PC / PM), or everyone (HR, directors, Administrator).
  let unsigned = [];
  const today = todayISO();
  if (adminKey()) {
    const { people, staff, status } = await loadPolicyStatus(createAdminClient(), today);
    const me = people.find((p) => p.id === user.id) ?? { ...profile, homes: new Set([profile.home_id].filter(Boolean)) };
    const all = profile.role === 'admin' || groupOf(profile) === 'hr' || (!groupOf(profile) && levelOf(profile) >= 4);
    const house = !groupOf(profile) && [2, 3].includes(levelOf(profile));
    const canSee = (p) => p.id === user.id || all || (house && p.home_id && me.homes.has(p.home_id) && levelOf(p) < levelOf(profile));
    unsigned = staff.filter((p) => canSee(p) && status[p.id]?.unsigned.length && (!sp?.person || p.id === sp.person))
      .map((p) => ({ p, st: status[p.id] })).sort((a, b) => (b.st.late.length - a.st.late.length) || String(a.p.full_name).localeCompare(String(b.p.full_name)));
  }
  const { data: rows, error } = await supabase.from('policy_records')
    .select('id, profile_id, status, stage, stage_started_at, ready_at, witnessed_name, witnessed_at, items, person:profile_id(full_name, homes(name))')
    .in('status', ['awaiting_witness', 'witnessed']).order('ready_at', { ascending: false }).limit(300);
  const waiting = (rows ?? []).filter((r) => r.status === 'awaiting_witness');
  const done = (rows ?? []).filter((r) => r.status === 'witnessed');
  const days = (ts) => Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
  const row = (r) => (
    <li key={r.id}>
      <Link href={`/policies/records/${r.id}`}><strong>{r.person?.full_name ?? 'Staff'}</strong>{r.profile_id === user.id ? ' (you)' : ''}{' '}
        <span className="muted small">· {r.person?.homes?.name ?? 'No house'} · {(r.items ?? []).length} policies · {r.status === 'witnessed' ? `witnessed by ${r.witnessed_name}, ${fmtDate(String(r.witnessed_at).slice(0, 10))}` : `with ${STAGE[r.stage]}, day ${days(r.stage_started_at) + 1}`}</span></Link>
      {r.status === 'witnessed' ? <span className="badge">✓ Witnessed</span> : <span className={`badge ${days(r.stage_started_at) >= WITNESS_DAYS ? 'bad' : 'warn'}`}>Waiting</span>}
    </li>
  );
  return (
    <main>
      <p className="small no-print"><Link href="/policies">← Policies</Link></p>
      <h1>📝 Policy sign-off records</h1>
      <p className="small">Staff sign each policy within {POLICY_DAYS} days. When someone has signed them all, one record is made here. Their Program Coordinator checks the signed copies and signs once as witness. If that isn’t done in {WITNESS_DAYS} days it also goes to the Program Manager, then to the directors.</p>
      {error && <p className="message">Sign-off records aren’t switched on yet (setup file: policy-records.sql).</p>}
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Still to sign ({unsigned.length}){sp?.person ? <> <Link className="small" href="/policies/records">show everyone</Link></> : null}</h2>
        {!unsigned.length && <p className="muted small">Nobody you look after has policies left to sign.</p>}
        {unsigned.map(({ p, st }) => (
          <details key={p.id} open={!!sp?.person || p.id === user.id}>
            <summary><strong>{p.full_name}</strong>{p.id === user.id ? ' (you)' : ''} <span className="muted small">· signed {st.have} of {st.need}</span>{' '}
              {st.late.length ? <span className="badge bad">{st.late.length} late, was due {fmtDate(st.oldestDue)}</span> : <span className="badge warn">due {fmtDate(st.nextDue)}</span>}</summary>
            <ul className="list compact">{st.unsigned.map((x) => (
              <li key={x.policy_id}><Link href={`/policies/${x.policy_id}`}>{x.code ? `${x.code} ` : ''}{x.title}</Link><span className={`small ${x.due < today ? 'badge bad' : 'muted'}`}>{x.due < today ? `late, was due ${fmtDate(x.due)}` : `due ${fmtDate(x.due)}`}</span></li>
            ))}</ul>
          </details>
        ))}
      </section>
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Waiting for a witness ({waiting.length})</h2>
        {!waiting.length && <p className="muted small">Nothing is waiting.</p>}
        <ul className="list compact">{waiting.map(row)}</ul>
      </section>
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Witnessed ({done.length})</h2>
        {!done.length && <p className="muted small">No witnessed records yet.</p>}
        <ul className="list compact">{done.map(row)}</ul>
      </section>
      <p className="small no-print">Who still has policies to sign: <Link href="/policies/report">Policy sign-off report</Link>.</p>
    </main>
  );
}
