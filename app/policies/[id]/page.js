// One policy: read the current version, sign it, version history, and (managers) who has signed.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { POLICY_CATEGORIES, appliesTo } from '@/lib/onboarding';
import ProgramBadge from '@/app/components/ProgramBadge';
import { fmtDate, fmtDateTime } from '@/lib/options';
import { signPolicy, updatePolicy, restoreVersion } from '@/app/policies/actions';
import PolicyUpload from '@/app/policies/PolicyUpload';
import PrintButton from '@/app/PrintButton';
import { personLabel, canHR } from '@/lib/levels';

function nextVersion(label) {
  const [maj, min = '0'] = String(label ?? '1.0').split('.');
  return `${maj}.${Number(min) + 1}`;
}

export default async function PolicyPage({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, user, profile } = await requireUser(['admin', 'manager', 'staff']);
  const isAdmin = profile.role === 'admin';
  const isBoss = canHR(profile);
  const { data: p } = await supabase.from('policies').select('*').eq('id', id).maybeSingle();
  if (!p) notFound();

  const [{ data: versions }, { data: acks }, { data: people }, { data: onb }] = await Promise.all([
    supabase.from('policy_versions').select('*, publisher:published_by(full_name)').eq('policy_id', id).order('published_at', { ascending: false }),
    supabase.from('policy_acks').select('*, person:profile_id(full_name)').eq('policy_id', id).order('signed_at', { ascending: false }),
    isBoss ? supabase.from('profiles').select('id, full_name, role, level, active, staff_details(program)').in('role', ['admin', 'manager', 'staff']).eq('active', true).order('full_name') : { data: [] },
    supabase.from('onboardings').select('signature_image').eq('profile_id', user.id).maybeSingle(),
  ]);
  const { data: me } = await supabase.from('staff_details').select('program').eq('profile_id', user.id).maybeSingle();
  const progOf = (x) => x.staff_details?.program ?? x.staff_details?.[0]?.program ?? 'Both';
  const forMe = appliesTo(p.applies_to, me?.program ?? 'Both');
  const team = (people ?? []).filter((x) => appliesTo(p.applies_to, progOf(x)));
  const current = versions?.find((v) => v.id === p.current_version_id);
  const myAck = acks?.find((a) => a.profile_id === user.id && a.policy_version_id === current?.id);
  const myOld = acks?.filter((a) => a.profile_id === user.id && a.policy_version_id !== current?.id) ?? [];
  let url = null;
  if (current) {
    const { data } = await supabase.storage.from('policies').createSignedUrl(current.file_path, 3600);
    url = data?.signedUrl;
  }
  const isPdf = current && (current.file_type === 'application/pdf' || /\.pdf$/i.test(current.file_name ?? current.file_path));
  const signedCurrent = (pid) => acks?.find((a) => a.profile_id === pid && a.policy_version_id === current?.id);

  return (
    <main>
      <p className="small no-print"><Link href="/policies">← All policies</Link></p>
      <div className="div-banner" style={{ '--div': '#5a3d8a' }}>
        <span className="div-icon">📘</span>
        <div>
          <h1>{p.title}</h1>
          <p><ProgramBadge program={p.applies_to} /> {[p.code, p.category, current && `Version ${current.version_label}`, current?.effective_date && `effective ${fmtDate(current.effective_date)}`].filter(Boolean).join(' · ')}</p>
        </div>
        <span className="no-print"><PrintButton label="Print" /></span>
      </div>
      {!p.active && <p className="alert">This policy is archived.</p>}
      {p.description && <p>{p.description}</p>}
      {current?.change_note && <p className="small"><strong>What changed in v{current.version_label}:</strong> {current.change_note}</p>}

      {current && url && (
        isPdf
          ? <iframe src={`${url}#toolbar=0`} className="policy-viewer no-print" title={p.title} />
          : <p className="card no-print">📄 <a href={url} target="_blank" rel="noreferrer">Open {current.file_name ?? 'the policy'}</a> <span className="muted small">(this file type opens in Word; ask your admin for a PDF to read it on screen)</span></p>
      )}
      {!current && <p className="muted">No file has been uploaded yet.</p>}

      {/* ---------- Sign ---------- */}
      {current && p.require_signature && !forMe && (
        <p className="card muted">This policy is for {p.applies_to === 'MCFD' ? 'MCFD (children & youth)' : 'CLBC (adult)'} programs only — you don’t need to sign it, but you can read it.</p>
      )}
      {current && p.require_signature && forMe && (
        <section className="card sign-box" id="sign">
          <h2>Digital signature</h2>
          {sp.error && <p className="message">{sp.error}</p>}
          {sp.signed && myAck && <p className="message ok">✓ Signed. Thank you — your signature, date and time are saved.</p>}
          {myAck ? (
            <div className="signed">
              {onb?.signature_image && <img src={onb.signature_image} alt="" />}
              <span>✓ Signed by <strong>{myAck.signed_name}</strong> on {fmtDateTime(myAck.signed_at)} — version {current.version_label}</span>
            </div>
          ) : (
            <form action={signPolicy} className="no-print">
              <input type="hidden" name="policy_id" value={p.id} />
              <input type="hidden" name="version_id" value={current.id} />
              {myOld.length > 0 && <p className="alert">This policy was updated. Please read the new version and sign again.</p>}
              <label className="check"><input type="checkbox" name="agree" required /> I have read and understand <strong>{p.title}, version {current.version_label}</strong>, and I agree to follow it.</label>
              <label>Type your full name to sign — <strong>{profile.full_name}</strong><input name="signed_name" required placeholder={profile.full_name} autoComplete="off" /></label>
              <p className="muted small">Your name, the date and the exact time are recorded by the system when you click Sign.</p>
              <button>Sign</button>
            </form>
          )}
        </section>
      )}

      {/* ---------- Who has signed (managers) ---------- */}
      {isBoss && current && p.require_signature && (
        <section>
          <h2>Signatures for version {current.version_label}</h2>
          <p className="small">{team.filter((x) => signedCurrent(x.id)).length} of {team.length} active staff in {p.applies_to === 'Both' ? 'MCFD & CLBC' : p.applies_to} programs have signed.</p>
          <table>
            <thead><tr><th>Name</th><th>Role</th><th>Program</th><th>Signed</th></tr></thead>
            <tbody>
              {team.map((x) => {
                const a = signedCurrent(x.id);
                return (
                  <tr key={x.id}>
                    <td>{x.full_name}</td><td>{personLabel(x)}</td><td><ProgramBadge program={progOf(x)} /></td>
                    <td>{a ? <>✓ {a.signed_name} · {fmtDateTime(a.signed_at)}</> : <span className="badge bad">Not signed</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {/* ---------- Version history ---------- */}
      <section>
        <h2>Version history</h2>
        <table>
          <thead><tr><th>Version</th><th>Effective</th><th>What changed</th><th>Published</th>{isAdmin && <th></th>}</tr></thead>
          <tbody>
            {versions?.map((v) => (
              <tr key={v.id}>
                <td><strong>v{v.version_label}</strong>{v.id === p.current_version_id && <span className="badge"> current</span>}</td>
                <td>{fmtDate(v.effective_date)}</td>
                <td>{v.change_note ?? '—'}</td>
                <td className="small">{fmtDateTime(v.published_at)}<div className="muted">{v.publisher?.full_name}</div></td>
                {isAdmin && (
                  <td>{v.id !== p.current_version_id && (
                    <form action={restoreVersion}>
                      <input type="hidden" name="policy_id" value={p.id} /><input type="hidden" name="version_id" value={v.id} />
                      <button className="link small">Make current</button>
                    </form>
                  )}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {isBoss && acks?.length > 0 && (
          <details className="card">
            <summary><strong>All signatures, every version ({acks.length})</strong></summary>
            <ul className="small">
              {acks.map((a) => {
                const v = versions?.find((x) => x.id === a.policy_version_id);
                return <li key={a.id}>{a.signed_name} — v{v?.version_label} — {fmtDateTime(a.signed_at)}</li>;
              })}
            </ul>
          </details>
        )}
      </section>

      {/* ---------- Admin ---------- */}
      {isAdmin && (
        <>
          <PolicyUpload mode="version" policyId={p.id} suggestedVersion={nextVersion(current?.version_label)} />
          <details className="card no-print">
            <summary><strong>Edit policy details</strong></summary>
            <form action={updatePolicy}>
              <input type="hidden" name="id" value={p.id} />
              <div className="row">
                <label>Title<input name="title" required defaultValue={p.title} /></label>
                <label>Document code<input name="code" defaultValue={p.code ?? ''} /></label>
                <label>Category<select name="category" defaultValue={p.category ?? 'HR'}>{POLICY_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
              </div>
              <label>Applies to
                <select name="applies_to" defaultValue={p.applies_to ?? 'Both'}>
                  <option value="Both">MCFD & CLBC (both programs)</option>
                  <option value="MCFD">MCFD only — children & youth</option>
                  <option value="CLBC">CLBC only — adults</option>
                </select>
              </label>
              <label>Short description<input name="description" defaultValue={p.description ?? ''} /></label>
              <label className="check"><input type="checkbox" name="require_signature" defaultChecked={p.require_signature} /> Staff must read and sign it</label>
              <label className="check"><input type="checkbox" name="active" defaultChecked={p.active} /> Active (untick to archive)</label>
              <button>Save</button>
            </form>
          </details>
        </>
      )}
    </main>
  );
}
