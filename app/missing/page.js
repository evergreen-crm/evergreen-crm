// 🔎 Missing: everyone currently missing or just back, and recent closed logs.
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { fmtDateTime } from '@/lib/options';
import NotReady from '@/app/components/NotReady';
import Elapsed from './Elapsed';

export default async function MissingList() {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const { data, error } = await supabase.from('missing_episodes')
    .select('id, status, started_at, found_at, closed_at, higher_risk, police_called_at, residents(first_name, last_name, preferred_name), homes(name)')
    .order('started_at', { ascending: false }).limit(60);
  const notReady = error && /does not exist|schema cache/i.test(error.message);
  const rows = data ?? [];
  const open = rows.filter((r) => r.status !== 'Closed');
  const closed = rows.filter((r) => r.status === 'Closed').slice(0, 20);
  const name = (r) => `${r.residents?.preferred_name || r.residents?.first_name} ${r.residents?.last_name ?? ''}`;

  return (
    <main>
      <div className="div-banner" style={{ '--div': '#b3261e' }}>
        <span className="div-icon">🔎</span>
        <div><h1>Missing youth or adult</h1><p>Start the log the minute someone can’t be found. It times every step and alerts leaders.</p></div>
      </div>
      <p className="small">🆘 In danger, or higher risk (young, mental health or support needs, late at night, drugs or alcohol, exploitation)? <strong>Call 911 first.</strong></p>
      {notReady ? <NotReady what="The missing-person log" file="missing-youth.sql" /> : (
        <>
          <p><Link className="button miss-go" href="/missing/new">🔎 Report someone missing</Link></p>
          <section className="card">
            <h2 style={{ marginTop: 0 }}>Now</h2>
            {!open.length && <p className="muted">Nobody is missing. ✓</p>}
            <ul className="list">
              {open.map((r) => (
                <li key={r.id} className={r.status === 'Missing' ? 'miss-row' : ''}>
                  <span>
                    <Link href={`/missing/${r.id}`}><strong>{name(r)}</strong></Link> · {r.homes?.name}
                    {r.higher_risk && <span className="badge bad"> Higher risk</span>}
                    <br /><span className="small">{r.status === 'Missing'
                      ? <>Missing for <strong><Elapsed since={r.started_at} /></strong>{r.police_called_at ? ' · police called' : ' · police not called yet'}</>
                      : <>Back since {fmtDateTime(r.found_at)} · debrief and close</>}</span>
                  </span>
                  <span className={`badge ${r.status === 'Missing' ? 'bad' : 'warn'}`}>{r.status === 'Missing' ? 'Missing' : 'Back'}</span>
                </li>
              ))}
            </ul>
          </section>
          {closed.length > 0 && (
            <section className="card">
              <h2 style={{ marginTop: 0 }}>Closed</h2>
              <ul className="list compact">
                {closed.map((r) => (
                  <li key={r.id}><span><Link href={`/missing/${r.id}`}>{name(r)}</Link> · {r.homes?.name}</span><span className="small muted">{fmtDateTime(r.started_at)}</span></li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}
