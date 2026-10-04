// The Evergreen certificate of completion (used on single and print-all pages).
import { certificateNo } from '@/lib/onboarding';

export default function Certificate({ t, name }) {
  const long = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
  return (
    <div className="certificate">
      <div className="cert-inner">
        <img src="/logo.png" alt="Evergreen Community Care" className="cert-logo" />
        <p className="cert-kicker">Certificate of Completion</p>
        <p className="cert-small">This certifies that</p>
        <p className="cert-name">{name}</p>
        <p className="cert-small">has successfully completed</p>
        <p className="cert-course">{t.title}</p>
        <p className="cert-small">
          on {long(t.completed_on)}{t.hours ? ` · ${t.hours} hours` : ''}{t.provider ? ` · ${t.provider}` : ''}
        </p>
        {t.expires_on && <p className="cert-small">Valid until {long(t.expires_on)}</p>}
        <div className="cert-sign">
          <div><span>{t.verifier?.full_name ?? ''}</span><hr />Verified by, Evergreen Community Care Inc.</div>
          <div><span>{long(t.completed_on)}</span><hr />Date</div>
        </div>
        <p className="cert-no">Certificate no. {certificateNo(t)} · MCFD Standard G.3 training record</p>
      </div>
    </div>
  );
}

