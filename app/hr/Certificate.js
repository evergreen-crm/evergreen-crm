// The Evergreen certificate of completion (used on single and print-all pages).
import { certificateNo, hoursFor } from '@/lib/onboarding';

// Gold seal drawn in SVG so it prints sharply.
function GoldSeal() {
  const pts = Array.from({ length: 48 }, (_, i) => {
    const a = (i / 48) * Math.PI * 2, r = i % 2 ? 46 : 50;
    return `${60 + r * Math.cos(a)},${60 + r * Math.sin(a)}`;
  }).join(' ');
  return (
    <svg className="cert-seal" viewBox="0 0 120 150" aria-hidden="true">
      <defs>
        <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f7e08a" /><stop offset=".45" stopColor="#d4a72c" /><stop offset=".7" stopColor="#b8860b" /><stop offset="1" stopColor="#f1d36b" />
        </linearGradient>
        <path id="sealText" d="M 22,60 a 38,38 0 1,1 76,0 a 38,38 0 1,1 -76,0" />
      </defs>
      <path d="M38 95 L28 148 L45 136 L55 150 L60 100 Z" fill="#0b5a34" />
      <path d="M82 95 L92 148 L75 136 L65 150 L60 100 Z" fill="#0f3059" />
      <polygon points={pts} fill="url(#gold)" stroke="#9c7412" strokeWidth="1" />
      <circle cx="60" cy="60" r="40" fill="none" stroke="#fff7d6" strokeWidth="1.5" />
      <circle cx="60" cy="60" r="30" fill="url(#gold)" stroke="#9c7412" strokeWidth="1" />
      <text fontSize="7.4" fontWeight="700" fill="#5c430a" letterSpacing="1.2">
        <textPath href="#sealText">EVERGREEN ACADEMY • CERTIFIED •</textPath>
      </text>
      <path d="M60 40 l6 12 h-3.5 l6 10 h-4 l6 10 h-21 l6 -10 h-4 l6 -10 h-3.5 z" fill="#0b5a34" />
      <rect x="58" y="72" width="4" height="6" fill="#5c430a" />
    </svg>
  );
}

export default function Certificate({ t, name, employeeNo }) {
  const hours = t.hours ?? hoursFor(t.title);
  const long = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
  return (
    <div className={`certificate ${t.verified_by ? '' : 'unverified'}`}>
      <div className="cert-inner">
        <img src="/logo.png" alt="Evergreen Community Care" className="cert-logo" />
        <p className="cert-academy">Evergreen Academy</p>
        <p className="cert-kicker">Certificate of Completion</p>
        <p className="cert-small">This certifies that</p>
        <p className="cert-name">{name}</p>
        {employeeNo && <p className="cert-small">Employee no. {employeeNo}</p>}
        <p className="cert-small">has successfully completed</p>
        <p className="cert-course">{t.title}</p>
        <p className="cert-small">
          on {long(t.completed_on)}{hours ? ` · ${hours} hours` : ''}{t.provider ? ` · ${t.provider}` : ''}
        </p>
        {t.expires_on && <p className="cert-small">Valid until {long(t.expires_on)}</p>}
        {t.verified_by && <GoldSeal />}
        <div className="cert-sign">
          <div><span>{t.verifier?.full_name ?? ''}</span><hr />Verified by, Evergreen Community Care Inc.</div>
          <div><span>{long(t.completed_on)}</span><hr />Date</div>
        </div>
        <p className="cert-no">Certificate no. {certificateNo(t)} · Evergreen Academy · MCFD Standard G.3 training record</p>
      </div>
    </div>
  );
}

