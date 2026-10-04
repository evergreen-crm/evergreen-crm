// The ID card itself: front (photo, name, role, QR) and back (emergency contact, return details).
// Credit-card shape (85.6 × 54 mm) so it fits a phone screen and prints at real size.
import { fmtDate } from '@/lib/options';

const PROGRAM = { MCFD: 'MCFD', CLBC: 'CLBC', Both: 'MCFD · CLBC' };

export function IdCardFront({ name, position, employeeNo, program, house, photoUrl, qr, status, expires }) {
  return (
    <div className={`idcard front st-${status.replace(/\s/g, '')}`}>
      <div className="idc-head">
        <img src="/logo-mark.png" alt="" />
        <span>EVERGREEN<small>COMMUNITY CARE</small></span>
        <em>STAFF</em>
      </div>
      <div className="idc-body">
        <div className="idc-photo">{photoUrl ? <img src={photoUrl} alt={name} /> : <span>No photo</span>}</div>
        <div className="idc-info">
          <strong className="idc-name">{name}</strong>
          <span>{position ?? 'Staff'}</span>
          {house && <span className="muted">{house}</span>}
          <span className="idc-no">{employeeNo ?? '—'}</span>
          <span className="idc-prog">{PROGRAM[program] ?? PROGRAM.Both}</span>
        </div>
        <div className="idc-qr" dangerouslySetInnerHTML={{ __html: qr }} />
      </div>
      <div className="idc-foot">
        <span>{status === 'Valid' ? `Valid until ${fmtDate(expires)}` : status.toUpperCase()}</span>
        <span>Scan to verify</span>
      </div>
    </div>
  );
}

export function IdCardBack({ emergency, verifyUrl, issued }) {
  return (
    <div className="idcard back">
      <p className="idc-label">In an emergency contact</p>
      <p className="idc-emerg"><strong>{emergency.name ?? 'Not on file'}</strong>{emergency.phone && <><br /><a href={`tel:${emergency.phone.replace(/[^\d+]/g, '')}`}>{emergency.phone}</a></>}</p>
      <p className="idc-small">This card belongs to Evergreen Community Care Inc. and must be returned when employment ends. If found, please return to Evergreen Community Care.</p>
      <p className="idc-small">Verify: <span className="idc-url">{verifyUrl}</span></p>
      {issued && <p className="idc-small">Issued {fmtDate(issued)}</p>}
    </div>
  );
}
