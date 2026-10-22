// HR record section: this person's offer letters, and a form that creates a new one automatically.
import Link from 'next/link';
import { createOffer } from './actions';
import { plainStatus } from '@/lib/plain';
import NotReady from '@/app/components/NotReady';

const STATUS = { Draft: 'warn', Sent: 'warn', Accepted: '', Declined: 'bad', Withdrawn: 'bad' };
const fmt = (ts) => (ts ? new Date(ts).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'America/Vancouver' }) : '');

export default async function OfferPanel({ supabase, person, details, canEdit, isSelf }) {
  const { data: offers, error } = await supabase.from('offer_letters')
    .select('id, status, position, start_date, created_at, issued_at, accepted_at').eq('profile_id', person.id).order('created_at', { ascending: false });
  if (error) return canEdit ? <div className="card" id="offer"><h2>📄 Offer letter</h2><NotReady what="Offer letters" file="offer-letters.sql" card={false} /></div> : null;
  const list = (offers ?? []).filter((x) => canEdit || x.status !== 'Draft');
  if (!canEdit && !list.length) return null;
  const today = new Date().toISOString().slice(0, 10);
  const in7 = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  return (
    <div className="card" id="offer">
      <h2>📄 Offer letter</h2>
      {list.length > 0 ? (
        <ul className="list compact">
          {list.map((x) => (
            <li key={x.id}>
              <span><Link href={`/offer/${x.id}`}>{x.position}</Link> <span className="muted small">· created {fmt(x.created_at)}{x.accepted_at ? ` · signed ${fmt(x.accepted_at)}` : x.issued_at ? ` · sent ${fmt(x.issued_at)}` : ''}</span></span>
              <span className={`badge ${STATUS[x.status]}`}>{x.status === 'Accepted' ? '✓ Signed' : plainStatus(x.status)}</span>
            </li>
          ))}
        </ul>
      ) : <p className="muted small">No offer letter yet.</p>}
      {canEdit && !isSelf && (
        <details className="no-print" open={!list.length}>
          <summary><strong>➕ Create an offer letter</strong></summary>
          <p className="muted small">The letter is written automatically from these terms on Evergreen letterhead (conditions, probation, policies and Employment Standards wording included). You can also attach your own letter after creating it. When sent, Evergreen’s signature is added automatically and {person.full_name} signs in the portal; the signed letter is saved here as one document.</p>
          <form action={createOffer}>
            <input type="hidden" name="profile_id" value={person.id} />
            <div className="row">
              <label>Position<input name="position" required defaultValue={details?.position ?? 'Youth Worker'} /></label>
              <label>Program<select name="program" defaultValue={details?.program ?? 'Both'}><option>MCFD</option><option>CLBC</option><option>Both</option></select></label>
              <label>Employment type<select name="employment_type" defaultValue={details?.employment_type ?? 'Part-time'}><option>Full-time</option><option>Part-time</option><option>Casual</option></select></label>
            </div>
            <div className="row">
              <label>Wage ($)<input name="wage" type="number" step="0.01" min="0" placeholder="e.g. 25.00" /></label>
              <label>Per<select name="wage_unit" defaultValue="hour"><option value="hour">hour</option><option value="year">year</option></select></label>
              <label>Hours<input name="hours" placeholder="e.g. 0.8 FTE, rotating shifts incl. nights" /></label>
            </div>
            <div className="row">
              <label>Start date<input name="start_date" type="date" defaultValue={details?.hire_date ?? ''} /></label>
              <label>Location / house<input name="house" defaultValue={person.homes?.name ?? ''} /></label>
              <label>Reports to<input name="reports_to" placeholder="e.g. Program Coordinator" /></label>
            </div>
            <div className="row">
              <label>Accept by<input name="respond_by" type="date" min={today} defaultValue={in7} /></label>
            </div>
            <label>Other terms (optional)<textarea name="extra_terms" rows={3} placeholder="e.g. Benefits after 3 months; on-call premium; driver's licence required" /></label>
            <div className="row" style={{ gap: 8 }}>
              <button name="send_now" value="0" className="secondary">Create draft to check first</button>
              <button name="send_now" value="1">✍️ Create, sign for Evergreen and send</button>
            </div>
          </form>
        </details>
      )}
    </div>
  );
}
