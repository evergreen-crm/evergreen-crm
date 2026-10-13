// Evergreen offer letter: one document built from the offer's saved terms, with both signatures and the audit trail.
// Used for the portal page, printing/saving as PDF, and the email copy. All values are escaped.
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const day = (iso) => (iso ? new Date(String(iso).length === 10 ? iso + 'T12:00:00Z' : iso).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Vancouver' }) : '—');
const stamp = (ts) => (ts ? new Date(ts).toLocaleString('en-CA', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Vancouver' }) : '');
const money = (n, unit) => (n == null ? '—' : `$${Number(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} per ${unit === 'year' ? 'year' : 'hour'}`);
const PROGRAM = { MCFD: 'MCFD (children and youth)', CLBC: 'CLBC (adults)', Both: 'MCFD and CLBC' };

export function offerHtml(o, { personName, fileUrl = null, forEmail = false } = {}) {
  const rows = [
    ['Position', o.position], ['Program', PROGRAM[o.program] ?? o.program], ['Employment type', o.employment_type],
    ['Wage', money(o.wage, o.wage_unit)], ['Hours', o.hours], ['Start date', day(o.start_date)],
    ['Location', o.house], ['Reports to', o.reports_to],
  ].filter(([k, v]) => ['Position', 'Wage', 'Start date'].includes(k) || (v != null && v !== ''));
  const cell = 'padding:6px 10px;border:1px solid #d7e0da;text-align:left;vertical-align:top';
  const sigImg = o.signature_image && !forEmail ? `<img src="${esc(o.signature_image)}" alt="Signature" style="height:56px;display:block;margin:4px 0" />` : '';
  return `
<div style="font-family:Georgia,'Times New Roman',serif;color:#1d2b24;line-height:1.5;max-width:720px">
  <div style="border-bottom:3px solid #0b5a34;padding-bottom:8px;margin-bottom:16px">
    <div style="font-family:Arial,sans-serif;font-weight:700;font-size:20px;color:#0b5a34;letter-spacing:1px">EVERGREEN COMMUNITY CARE INC.</div>
    <div style="font-family:Arial,sans-serif;font-size:12px;color:#5b6b63">Supporting Growth. Building Futures.</div>
  </div>
  <p>${esc(day(o.issued_at ?? o.created_at))}</p>
  <p>Dear ${esc(personName)},</p>
  <p><strong>Offer of employment — ${esc(o.position)}</strong></p>
  <p>We are pleased to offer you the position of <strong>${esc(o.position)}</strong> with Evergreen Community Care Inc. on the following terms:</p>
  <table style="border-collapse:collapse;margin:8px 0 14px;font-family:Arial,sans-serif;font-size:14px">
    ${rows.map(([k, v]) => `<tr><th style="${cell};background:#f2f7f4;width:160px">${esc(k)}</th><td style="${cell}">${esc(v ?? '—')}</td></tr>`).join('')}
  </table>
  ${o.file_path ? `<p><strong>Attached letter.</strong> Evergreen’s attached offer letter${o.file_name ? ` (“${esc(o.file_name)}”)` : ''} forms part of this offer${fileUrl ? ` — <a href="${esc(fileUrl)}">open it</a>` : ' and can be opened in the portal'}.</p>` : ''}
  <p><strong>Conditions.</strong> This offer is conditional on a clear Criminal Record Check (Vulnerable Sector) and any MCFD/CLBC screening required for your role being received <em>before</em> you have any contact with youth or adults in care, satisfactory references, proof of your qualifications, and completing the training required before your first shift.</p>
  <p><strong>Probation.</strong> Your first 120 days are a probationary period, with reviews at 30, 90 and 120 days.</p>
  <p><strong>Policies.</strong> You agree to follow Evergreen’s Staff Rules and Regulations Handbook, policies, Code of Conduct and confidentiality requirements, which you will read and sign during onboarding.</p>
  <p><strong>Employment standards.</strong> Your employment is governed by the <em>Employment Standards Act</em> (British Columbia). Nothing in this letter gives you less than the Act requires.</p>
  ${o.extra_terms ? `<p><strong>Other terms.</strong> ${esc(o.extra_terms).replace(/\n/g, '<br>')}</p>` : ''}
  ${o.respond_by ? `<p>Please accept this offer by <strong>${esc(day(o.respond_by))}</strong>.</p>` : ''}
  <p>We look forward to welcoming you to the Evergreen team.</p>
  <table style="width:100%;margin-top:18px;font-family:Arial,sans-serif;font-size:13px"><tr>
    <td style="vertical-align:top;width:50%;padding-right:12px">
      <div style="color:#5b6b63">For Evergreen Community Care Inc.</div>
      ${o.issued_at ? `<div style="font-family:'Brush Script MT',cursive;font-size:26px;color:#0f3059">${esc(o.issued_by_name)}</div>
      <div><strong>${esc(o.issued_by_name)}</strong>, ${esc(o.issued_by_title)}</div>
      <div style="color:#5b6b63">Signed electronically ${esc(stamp(o.issued_at))}</div>` : '<div style="color:#9b1c1c">Draft — not yet signed or sent</div>'}
    </td>
    <td style="vertical-align:top;width:50%;padding-left:12px;border-left:1px solid #d7e0da">
      <div style="color:#5b6b63">Accepted by</div>
      ${o.status === 'Accepted' ? `${sigImg}<div><strong>${esc(o.signed_name)}</strong></div>
      <div style="color:#5b6b63">Signed electronically ${esc(stamp(o.accepted_at))}</div>` :
      o.status === 'Declined' ? `<div style="color:#9b1c1c">Declined ${esc(stamp(o.declined_at))}</div>` :
      o.status === 'Withdrawn' ? `<div style="color:#9b1c1c">Offer withdrawn ${esc(stamp(o.withdrawn_at))}</div>` :
      `<div style="color:#5b6b63">Waiting for ${esc(personName)} to sign</div>`}
    </td>
  </tr></table>
  ${o.status === 'Accepted' ? `<div style="margin-top:16px;padding:8px 10px;background:#f2f7f4;border:1px solid #d7e0da;font-family:Arial,sans-serif;font-size:11px;color:#5b6b63">
    Electronic signature record: accepted by ${esc(o.signed_name)} on ${esc(stamp(o.accepted_at))}${o.signer_ip ? ` from IP ${esc(o.signer_ip)}` : ''}.
    Document fingerprint (SHA-256): ${esc(o.doc_hash)}. Offer ID: ${esc(o.id)}.
  </div>` : ''}
</div>`;
}
