// Policy library: every Evergreen policy, its current version and whether you've signed it.
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { POLICY_CATEGORIES } from '@/lib/onboarding';
import { fmtDate, fmtDateTime } from '@/lib/options';
import PolicyUpload from './PolicyUpload';
import PrintButton from '@/app/PrintButton';

export default async function PoliciesPage({ searchParams }) {
  const sp = await searchParams;
  const { supabase, user, profile } = await requireUser(['admin', 'manager', 'staff']);
  const isAdmin = profile.role === 'admin';
  const [{ data: policies }, { data: myAcks }] = await Promise.all([
    supabase.from('policies').select('*, current:current_version_id(id, version_label, effective_date, published_at, change_note)')
      .order('category').order('title'),
    supabase.from('policy_acks').select('policy_id, policy_version_id, signed_at').eq('profile_id', user.id),
  ]);
  const shown = (policies ?? []).filter((p) => (sp.archived ? !p.active : p.active));
  const signedFor = (p) => myAcks?.find((a) => a.policy_version_id === p.current?.id);
  const needed = shown.filter((p) => p.require_signature && p.current && !signedFor(p));
  const groups = {};
  for (const p of shown) (groups[p.category ?? 'Other'] ??= []).push(p);

  return (
    <main>
      <div className="div-banner" style={{ '--div': '#5a3d8a' }}>
        <span className="div-icon">📘</span>
        <div><h1>Policies</h1><p>Read every Evergreen policy and sign it digitally. Policies can’t be edited here.</p></div>
        <span className="no-print"><PrintButton label="Print" /></span>
      </div>

      <div className="stats">
        <div className={`stat ${needed.length ? 'bad' : ''}`}><strong>{needed.length}</strong><span>waiting for your signature</span></div>
        <div className="stat"><strong>{shown.length}</strong><span>policies</span></div>
      </div>

      {Object.entries(groups).map(([cat, list]) => (
        <section key={cat}>
          <h2>{cat}</h2>
          <ul className="list">
            {list.map((p) => {
              const ack = signedFor(p);
              return (
                <li key={p.id}>
                  <Link href={`/policies/${p.id}`}>
                    <span>
                      <strong>{p.title}</strong>
                      <span className="muted small"> · {p.code ? `${p.code} · ` : ''}v{p.current?.version_label ?? '—'}{p.current?.effective_date && ` · effective ${fmtDate(p.current.effective_date)}`}</span>
                    </span>
                    <span className="small">
                      {!p.require_signature ? <span className="badge">For reference</span>
                        : ack ? <span className="badge">✓ Signed {fmtDateTime(ack.signed_at)}</span>
                        : <span className="badge bad">Read and sign</span>}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {shown.length === 0 && <p className="muted">{isAdmin ? 'No policies yet — add your first one below.' : 'No policies have been added yet.'}</p>}

      <p className="small no-print">{sp.archived ? <Link href="/policies">← Current policies</Link> : <Link href="/policies?archived=1">Archived policies</Link>}</p>
      {isAdmin && <PolicyUpload mode="new" categories={POLICY_CATEGORIES} />}
    </main>
  );
}
