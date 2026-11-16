// Evergreen offer letter: one document built from the offer's saved terms, with both signatures and the audit trail.
// Used for the portal page, printing/saving as PDF, and the email copy. All values are escaped.
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const day = (iso) => (iso ? new Date(String(iso).length === 10 ? iso + 'T12:00:00Z' : iso).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Etc/GMT+7' }) : '—');
const stamp = (ts) => (ts ? new Date(ts).toLocaleString('en-CA', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Etc/GMT+7' }) : '');
const money = (n, unit) => (n == null ? '—' : `$${Number(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} per ${unit === 'year' ? 'year' : 'hour'}`);
// The standard terms, by version. Each letter keeps the version it was made with (offer_letters.terms_version),
// so a letter already sent or signed never changes. Version 2 from Nov 16 2026.
// [heading, text, optional bullet list]
const CONDITIONS = ['Conditions', 'This offer is conditional on a clear Criminal Record Check (Vulnerable Sector) and any MCFD/CLBC screening required for your role being received before you have any contact with youth or adults in care, satisfactory references, proof of your qualifications, and completing the training required before your first shift.'];
const TERMS = {
  1: [
    CONDITIONS,
    ['Probation', 'Your first 120 days are a probationary period, with reviews at 30, 90 and 120 days.'],
    ['Policies', "You agree to follow Evergreen's Staff Rules and Regulations Handbook, policies, Code of Conduct and confidentiality requirements, which you will read and sign during onboarding."],
    ['Employment standards', 'Your employment is governed by the Employment Standards Act (British Columbia). Nothing in this letter gives you less than the Act requires.'],
  ],
  2: [
    CONDITIONS,
    ['Probation', 'Your first 3 months of work are a probationary period, with reviews at 30, 60 and 90 days. During probation Evergreen assesses your suitability, skills, reliability and conduct, and may end your employment, as the Employment Standards Act allows. Evergreen may extend probation by agreement in writing; an extension does not reduce any right you have under the Act once you have worked 3 consecutive months.'],
    ['Policies are part of this agreement', 'Evergreen’s policies are conditions of your employment and form part of this agreement. You must read and sign them in the portal before your first shift (and within 14 days of being asked for any new or updated policy), and follow them at all times. They include:', [
      'Staff Code of Conduct and Zero-Tolerance Standards (ECC-HR-COC-2026-001)',
      'Bullying and Harassment Prevention Policy (ECC-HR-BH-2026-001)',
      'Investigation, Removal from Duty and Discipline Procedure (ECC-HR-DISC-2026-001)',
      'Employment Terms, Probation and Termination Policy (ECC-HR-EMP-2026-001)',
      'Staff Rules and Regulations Handbook, Occupational Health and Safety Program, and the confidentiality, privacy and IT policies',
    ]],
    ['Policy updates', 'Evergreen may update its policies to meet the law, MCFD and CLBC contract standards, licensing and WorkSafeBC requirements, or safety needs. You will be told about each change and asked to sign the new version. Policy updates will not reduce your wage, your hours or your rights under the Employment Standards Act.'],
    ['Safe and respectful workplace', 'You must work safely and treat everyone with respect. Under the Workers Compensation Act and the OHS Regulation you must follow safe work procedures and your training, use the equipment and protective gear provided, and report hazards, injuries, near misses and incidents right away. You must never bully, harass, threaten, discriminate against or retaliate against anyone (BC Human Rights Code), and you must report bullying and harassment you experience or see. You have the right to refuse unsafe work and to raise safety or care concerns in good faith; Evergreen will never punish you for doing so.'],
    ['Honesty and cooperation', 'You must be honest in everything you do for Evergreen:', [
      'Keep daily notes, incident reports, medication records, timesheets and all other records true, complete and on time. Never change, backdate, falsify or delete a record.',
      'Tell the truth and cooperate fully in any investigation or review by Evergreen, MCFD, CLBC, licensing, WorkSafeBC or the police, and keep investigations confidential.',
      'Tell your Program Manager or HR within 24 hours if you are charged with or convicted of a criminal offence, become subject to a court order or investigation involving children or vulnerable adults, lose or have restrictions on your driver’s licence (if you drive for work), or have any change that affects your criminal record check or right to work in Canada.',
      'Report abuse, neglect and critical incidents as Evergreen’s policies and the law require.',
    ]],
    ['Investigation and removal from duty', 'If a concern is raised about your conduct or the safety of the people we support, Evergreen may remove you from shifts or from a house while it investigates. Removal from duty is not discipline, and you will be paid your scheduled hours during it, unless the law allows otherwise. You will be told the concerns, given a fair chance to respond, and may bring a support person to meetings.'],
    ['Discipline', 'Evergreen will deal with most concerns fairly and in steps that match how serious they are, such as coaching, a Letter of Expectation, a written warning, a performance improvement plan or suspension. Serious misconduct may lead directly to termination.'],
    ['Termination for just cause', 'Evergreen may end your employment at any time for just cause, as that term is understood under BC law, without notice or pay in place of notice. Depending on the facts, a single incident can be just cause. Examples of misconduct that may be just cause include:', [
      'abuse, neglect, exploitation or unsafe care of a youth or adult we support, or failing to report it',
      'lying, falsifying or backdating records, notes, medication records or timesheets, or lying to or misleading an investigation',
      'bullying, harassment, sexual harassment, discrimination, threats or violence toward anyone, or retaliating against someone who reported in good faith',
      'theft, fraud, or misuse of Evergreen, resident or funder money or property',
      'working while impaired by alcohol, cannabis or drugs',
      'serious breach of confidentiality or privacy, including photographing, recording, copying or sharing records, policies or information about the people we support',
      'leaving a shift or the people in your care without proper handover, or a serious or repeated safety breach',
      'not telling Evergreen about a criminal charge or a change to your screening as set out above',
    ]],
    ['Termination without cause', 'Evergreen may end your employment at any time without cause by giving you written notice, pay in place of notice, or a combination of both, equal to the amount required by the Employment Standards Act, together with any other pay the Act requires (such as earned wages and vacation pay). This is all the notice, pay in place of notice, or compensation you will receive, and you agree you are not entitled to any further notice or pay under common law. If the Act ever requires more than this letter, Evergreen will give you what the Act requires.'],
    ['Resignation', 'If you resign, please give at least 2 weeks’ written notice so that shifts and the care of the people we support stay safe.'],
    ['Confidentiality and Evergreen property', 'Information about the people we support, their families, staff and Evergreen’s operations is confidential, during and after your employment. When your employment ends you must return all keys, fobs, cards, devices, documents and records, and your portal access will be closed.'],
    ['Employment standards and your rights', 'Your employment is governed by the Employment Standards Act (British Columbia). Nothing in this letter gives you less than the Act, the Workers Compensation Act or the Human Rights Code requires. If any part of this letter is found to be unenforceable, it is replaced by the legal minimum and the rest of the letter still applies.'],
    ['Your acceptance', 'By signing, you confirm you have read and understood this letter, had the chance to ask questions and to get independent legal advice before signing, and that you accept these terms freely.'],
  ],
};
const termsOf = (o) => TERMS[o.terms_version] ?? TERMS[1];
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
  <p style="margin:0">${esc(personName)}</p>
  ${o.person_address ? `<p style="margin:0">${esc(o.person_address)}</p>` : ''}
  <p style="margin-top:14px">Dear ${esc(personName)},</p>
  <p><strong>Offer of employment — ${esc(o.position)}</strong></p>
  <p>We are pleased to offer you the position of <strong>${esc(o.position)}</strong> with Evergreen Community Care Inc. on the following terms:</p>
  <table style="border-collapse:collapse;margin:8px 0 14px;font-family:Arial,sans-serif;font-size:14px">
    ${rows.map(([k, v]) => `<tr><th style="${cell};background:#f2f7f4;width:160px">${esc(k)}</th><td style="${cell}">${esc(v ?? '—')}</td></tr>`).join('')}
  </table>
  ${o.file_path ? `<p><strong>Attached letter.</strong> Evergreen’s attached offer letter${o.file_name ? ` (“${esc(o.file_name)}”)` : ''} forms part of this offer${fileUrl ? ` — <a href="${esc(fileUrl)}">open it</a>` : ' and can be opened in the portal'}.</p>` : ''}
  ${termsOf(o).map(([h, t, list]) => `<p><strong>${esc(h)}.</strong> ${esc(t)}</p>${list ? `<ul style="margin:-4px 0 12px">${list.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}`).join('\n  ')}
  ${o.extra_terms ? `<p><strong>Other terms.</strong> ${esc(o.extra_terms).replace(/\n/g, '<br>')}</p>` : ''}
  ${o.respond_by ? `<p>Please accept this offer by <strong>${esc(day(o.respond_by))}</strong>.</p>` : ''}
  <p>We look forward to welcoming you to the Evergreen team.</p>
  <table style="width:100%;margin-top:18px;font-family:Arial,sans-serif;font-size:13px"><tr>
    <td style="vertical-align:top;width:50%;padding-right:12px">
      <div style="color:#5b6b63">For Evergreen Community Care Inc.</div>
      ${o.issued_at && o.auto ? `<div style="margin:6px 0 2px"><strong>${esc(o.issued_by_name)}</strong></div>
      <div>${esc(o.issued_by_title)}</div>
      <div style="color:#5b6b63">Issued electronically ${esc(stamp(o.issued_at))}</div>` :
      o.issued_at ? `<div style="font-family:'Brush Script MT',cursive;font-size:26px;color:#0f3059">${esc(o.issued_by_name)}</div>
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
    Document fingerprint (SHA-256): ${esc(o.doc_hash)}. Offer ID: ${esc(o.id)}. Terms version ${esc(o.terms_version ?? 1)}.
  </div>` : ''}
</div>`;
}

// The same letter as plain paragraphs, for the signed PDF kept in the staff file.
export function offerLines(o, personName) {
  const terms = [
    ['Position', o.position], ['Program', PROGRAM[o.program] ?? o.program], ['Employment type', o.employment_type],
    ['Wage', money(o.wage, o.wage_unit)], ['Hours', o.hours], ['Start date', day(o.start_date)],
    ['Location', o.house], ['Reports to', o.reports_to],
  ].filter(([k, v]) => ['Position', 'Wage', 'Start date'].includes(k) || (v != null && v !== ''));
  return [
    `Offer of employment from Evergreen Community Care Inc. to ${personName}${o.person_address ? `, ${o.person_address}` : ''} (issued ${stamp(o.issued_at)}).`,
    terms.map(([k, v]) => `${k}: ${v ?? '-'}`).join('  |  '),
    ...(o.file_path ? [`Evergreen's attached offer letter${o.file_name ? ` ("${o.file_name}")` : ''} forms part of this offer.`] : []),
    ...termsOf(o).flatMap(([h, t, list]) => [`${h}. ${t}`, ...(list ?? []).map((x) => `   - ${x}`)]),
    ...(o.extra_terms ? [`Other terms. ${o.extra_terms}`] : []),
    o.auto ? `Issued for Evergreen Community Care Inc. by ${o.issued_by_title}.` : `For Evergreen Community Care Inc.: ${o.issued_by_name}, ${o.issued_by_title}.`,
    ...(o.status === 'Accepted' ? [`Accepted and signed electronically by ${o.signed_name} (${stamp(o.accepted_at)}).`] : []),
    `Electronic signature record: document fingerprint (SHA-256) ${o.doc_hash}. Offer ID ${o.id}.`,
  ];
}
