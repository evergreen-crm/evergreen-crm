// Policy library: every Evergreen policy, its current version and whether you've signed it.
import { canHR, levelOf } from '@/lib/levels';
import { canPullPolicyFiles } from '@/lib/levels';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { POLICY_CATEGORIES, appliesTo, PROGRAMS } from '@/lib/onboarding';
import ProgramBadge from '@/app/components/ProgramBadge';
import { fmtDate, fmtDateTime } from '@/lib/options';
import PolicyUpload from './PolicyUpload';
import PrintButton from '@/app/PrintButton';
import { policyFor, appliesToProgram, roleNames } from '@/lib/policyDue';
import { DOMAINS, domainOf, domainLabel } from '@/lib/policyDomains';

export default async function PoliciesPage({ searchParams }) {
  const sp = await searchParams;
  const { supabase, user, profile } = await requireUser(['admin', 'manager', 'staff']);
  const isAdmin = profile.role === 'admin';
  const [{ data: policies }, { data: myAcks }, { data: me }] = await Promise.all([
    supabase.from('policies').select('*, current:current_version_id(id, version_label, effective_date, published_at, change_note)')
      .order('category').order('title'),
    supabase.from('policy_acks').select('policy_id, policy_version_id, signed_at').eq('profile_id', user.id),
    supabase.from('staff_details').select('program').eq('profile_id', user.id).maybeSingle(),
  ]);
  const myProgram = me?.program ?? 'Both';
  const prog = sp.program ?? '';
  const dom = DOMAINS.find((d) => d.key === sp.domain) ? sp.domain : '';
  const forMe = (p) => policyFor(p, myProgram, profile);
  const signedFor = (p) => myAcks?.find((a) => a.policy_version_id === p.current?.id);
  // Once a policy is signed it is locked and leaves the person's list (everyone except HR, directors and the Administrator).
  const hideSigned = !canPullPolicyFiles(profile);
  const base = (policies ?? []).filter((p) => (sp.archived ? !p.active : p.active))
    .filter((p) => !prog || (p.applies_to ?? 'Both') === prog || (prog !== 'Both' && p.applies_to === 'Both'))
    .filter((p) => !hideSigned || !(p.require_signature && signedFor(p)));
  const shown = base.filter((p) => !dom || domainOf(p.code)?.key === dom);
  const needed = shown.filter((p) => p.require_signature && p.current && forMe(p) && !signedFor(p));
  // Grouped by policy domain (D01–D11), in domain order; the code decides the domain.
  const groups = {};
  for (const p of shown) (groups[domainLabel(domainOf(p.code))] ??= []).push(p);
  const order = [...DOMAINS.map(domainLabel), domainLabel(null)];
  const groupList = Object.entries(groups).sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  const countIn = (key) => base.filter((p) => domainOf(p.code)?.key === key).length;
  const link = (q) => { const u = new URLSearchParams(); if (prog) u.set('program', prog); if (sp.archived) u.set('archived', '1'); for (const [k, v] of Object.entries(q)) if (v) u.set(k, v); const s = u.toString(); return s ? `/policies?${s}` : '/policies'; };

  return (
    <main>
      <div className="div-banner" style={{ '--div': '#5a3d8a' }}>
        <span className="div-icon">📘</span>
        <div><h1>Policies</h1><p>{hideSigned ? 'Read and sign the policies waiting for you. Signed policies are locked after signing and kept in your staff file. To read one again, use the binder in the house.' : 'Read every Evergreen policy and sign it digitally. Policies can’t be edited here.'}</p></div>
        <span className="no-print"><PrintButton label="Print" /></span>
      </div>

      <div className="stats">
        <div className={`stat ${needed.length ? 'bad' : ''}`}><strong>{needed.length}</strong><span>waiting for your signature</span></div>
        <div className="stat"><strong>{shown.length}</strong><span>policies</span></div>
      </div>

      <p className="small">You work in: <ProgramBadge program={myProgram} /> — you only need to sign policies marked for your program and your job.</p>

      <details className="card no-print" open={!!dom || undefined}>
        <summary><strong>📚 How the policy library is organized</strong> <span className="muted small">— 11 domains; every policy has a domain number</span></summary>
        <p className="small">Every policy belongs to one domain. You find its domain in the <strong>Policy Domain</strong> row of the document control table on its first page, and its file name starts with the same number. Click a domain to see only its policies.</p>
        <table>
          <thead><tr><th>Domain</th><th>Name</th><th>What it covers</th><th>Policies</th></tr></thead>
          <tbody>
            {DOMAINS.map((d) => (
              <tr key={d.key} className={dom === d.key ? 'on' : ''}>
                <td><Link href={link({ domain: dom === d.key ? '' : d.key })}><strong>{d.prefix}</strong></Link></td>
                <td><Link href={link({ domain: dom === d.key ? '' : d.key })}>{d.name}</Link></td>
                <td className="small">{d.covers}</td>
                <td>{countIn(d.key)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="small"><strong>How to read a file name</strong> — <code>D03_ECC-SOS-2026-001_Schedule_of_Services_v1.2_BOTH</code>:</p>
        <ul className="small">
          <li><strong>D03</strong> – domain (Program Operations) · <strong>ECC</strong> – Evergreen Community Care · <strong>SOS</strong> – short code of the document</li>
          <li><strong>2026</strong> – year first created · <strong>001</strong> – number when two documents share a short code (EP-001, EP-002)</li>
          <li><strong>v1.2</strong> – version; only this changes when the policy is updated · <strong>BOTH / MCFD / CLBC</strong> – program it applies to</li>
        </ul>
      </details>

      <nav className="tabs-bar no-print">
        <Link href={dom ? `/policies?domain=${dom}` : '/policies'} className={!prog ? 'on' : ''}>All</Link>
        <Link href={`/policies?program=MCFD${dom ? `&domain=${dom}` : ''}`} className={prog === 'MCFD' ? 'on' : ''}>MCFD (children & youth)</Link>
        <Link href={`/policies?program=CLBC${dom ? `&domain=${dom}` : ''}`} className={prog === 'CLBC' ? 'on' : ''}>CLBC (adults)</Link>
        <Link href={`/policies?program=Both${dom ? `&domain=${dom}` : ''}`} className={prog === 'Both' ? 'on' : ''}>Both only</Link>
      </nav>
      {dom && <p className="small no-print">Showing domain <strong>{domainLabel(DOMAINS.find((d) => d.key === dom))}</strong> · <Link href={link({})}>Show all domains</Link></p>}
      {groupList.map(([cat, list]) => (
        <section key={cat}>
          <h2>{cat}</h2>
          <ul className="list">
            {list.map((p) => {
              const ack = signedFor(p);
              return (
                <li key={p.id}>
                  <Link href={`/policies/${p.id}`}>
                    <span>
                      <ProgramBadge program={p.applies_to} /> <strong>{p.title}</strong>
                      <span className="muted small"> · {p.code ? `${p.code} · ` : ''}v{p.current?.version_label ?? '—'}{p.current?.effective_date && ` · effective ${fmtDate(p.current.effective_date)}`}{p.applies_roles?.length ? ` · for ${roleNames(p.applies_roles)}` : ''}</span>
                    </span>
                    <span className="small">
                      {!p.require_signature ? <span className="badge">For reference</span>
                        : !forMe(p) ? <span className="muted">{appliesToProgram(p.applies_to, myProgram) ? 'Not for your job' : 'Not for your program'}</span>
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

      <p className="no-print"><Link className="button secondary" href="/policies/records">📝 Policy sign-off records</Link></p>
      {canHR(profile) && (
        <p className="no-print"><Link className="button secondary" href="/policies/report">🖨 Print all policies — read & signature report</Link></p>
      )}
      <p className="small no-print">{sp.archived ? <Link href="/policies">← Current policies</Link> : <Link href="/policies?archived=1">Archived policies</Link>}</p>
      {isAdmin && <PolicyUpload mode="new" categories={POLICY_CATEGORIES} />}
    </main>
  );
}
