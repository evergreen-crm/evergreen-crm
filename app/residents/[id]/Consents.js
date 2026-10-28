// Consents tab: each consent, its expiry date, and a renewal. Time-limited consents show when they lapse.
import { fmtDate, todayISO, addDaysISO } from '@/lib/options';
import { addConsent } from '@/app/residents/consent-actions';

export const CONSENT_KINDS = ['Medical treatment', 'Health information sharing', 'Photographs', 'Community activities', 'Information sharing with family', 'Information sharing with funder', 'Other'];

export default async function Consents({ supabase, resident, canEdit }) {
  const { data: rows } = await supabase.from('resident_consents').select('*').eq('resident_id', resident.id).order('expires_on', { ascending: false });
  const t = todayISO();
  const soon = addDaysISO(t, 30);
  const status = (c) => (c.expires_on < t ? 'Expired' : c.expires_on <= soon ? 'Expires soon' : 'Current');
  const current = (rows ?? []).filter((c) => c.expires_on >= t);
  const latestByKind = Object.values((rows ?? []).reduce((m, c) => (m[c.kind] && m[c.kind].signed_on >= c.signed_on ? m : { ...m, [c.kind]: c }), {}));
  const problems = latestByKind.filter((c) => c.expires_on <= soon);

  return (
    <section>
      {problems.length > 0 && (
        <p className="message error">{problems.length} consent{problems.length === 1 ? '' : 's'} expired or expiring within 30 days: {problems.map((c) => `${c.kind} (${c.expires_on < t ? 'expired' : 'expires'} ${fmtDate(c.expires_on)})`).join('; ')}. Renew before it lapses.</p>
      )}
      {(rows ?? []).length === 0 && <p className="muted">No consents recorded yet.</p>}
      <table className="small">
        <thead><tr><th>Consent</th><th>Shared with</th><th>Signed</th><th>Expires</th><th>Status</th><th>Signed by</th></tr></thead>
        <tbody>
          {(rows ?? []).map((c) => (
            <tr key={c.id}>
              <td>{c.kind}{c.note && <div className="muted">{c.note}</div>}</td>
              <td>{c.shared_with ?? '—'}</td>
              <td>{fmtDate(c.signed_on)}</td>
              <td>{fmtDate(c.expires_on)}</td>
              <td><span className={`badge ${status(c) === 'Expired' ? 'bad' : status(c) === 'Expires soon' ? 'warn' : ''}`}>{status(c)}</span></td>
              <td>{c.signed_by ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">{current.length} current. Old consents stay on record when renewed.</p>

      {canEdit && (
        <details className="card no-print" open={problems.length > 0}>
          <summary><strong>+ Record a consent or renewal</strong></summary>
          <form action={addConsent} className="stack">
            <input type="hidden" name="resident_id" value={resident.id} />
            <div className="row">
              <label>Consent for
                <select name="kind" required defaultValue="">
                  <option value="" disabled>Choose…</option>
                  {CONSENT_KINDS.map((k) => <option key={k}>{k}</option>)}
                </select>
              </label>
              <label>Shared with (who the information goes to)<input name="shared_with" placeholder="e.g., Family, funder, school" /></label>
            </div>
            <div className="row">
              <label>Signed on<input type="date" name="signed_on" required defaultValue={t} /></label>
              <label>Expires on<input type="date" name="expires_on" required defaultValue={addDaysISO(t, 365)} /></label>
              <label>Signed by<input name="signed_by" placeholder="Name and role" /></label>
            </div>
            <label>Note<input name="note" /></label>
            <button>Save consent</button>
          </form>
        </details>
      )}
    </section>
  );
}
