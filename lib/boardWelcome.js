// The Board of Directors' message to every staff member who completes the New Staff Orientation.
// One source for the welcome screen (/orientation/welcome) and the automatic email. No names: it is signed by the Board.
// It is a summary of the Staff Rules and Regulations Handbook (v1.1); the handbook and policy manual are the full rules.

export const WELCOME_SIGNATURE = 'The Board of Directors';
export const WELCOME_ORG = 'Evergreen Community Care';
export const WELCOME_ACK = 'I have read this message from the Board of Directors and I accept these responsibilities.';

export const firstName = (fullName) => String(fullName ?? '').trim().split(/\s+/)[0] || 'there';

export const welcomeIntro = (fullName) => [
  `${firstName(fullName)}, you have completed the Evergreen New Staff Orientation: every Academy course, every quiz and every in-person step. That took real effort, and it has been noticed.`,
  'On behalf of the Board of Directors, welcome to Evergreen Community Care. Whatever your role, whether you work directly with the people we support or lead those who do, we ask you to read this message carefully before you begin. It sets out the trust that is being placed in you, the laws you now work under, and what you can expect from us in return.',
];

// Each section: title, an opening line, and points. `strong` is the bold lead-in of a point.
export const WELCOME_SECTIONS = [
  {
    key: 'trust',
    title: '1. The trust placed in you',
    lead: 'You are about to care for children, youth and adults who depend on the people around them. Many have already been let down by adults they trusted. You may be the most consistent person in their day.',
    points: [
      { strong: 'Their safety, well-being and rights come first.', text: 'They come ahead of convenience, routine and staff comfort, on every shift.' },
      { strong: 'Act as a prudent and caring parent would.', text: 'That is the standard we hold you to, within each person’s care plan and the guardian’s direction.' },
      { strong: 'We care on behalf of others.', text: 'Youth are placed with us by the Ministry of Children and Family Development (MCFD), which is their guardian. Adults are referred by Community Living BC (CLBC). We follow their direction, the care plan and our contract.' },
      { strong: 'When you are unsure, ask before you act.', text: 'Call the on-call supervisor. If someone is in immediate danger, act to keep them safe first, then report right away.' },
    ],
  },
  {
    key: 'law',
    title: '2. The laws and standards you now work under',
    lead: 'These are legal duties, and several of them are yours personally. They cannot be handed to a co-worker or a supervisor.',
    points: [
      { strong: 'Duty to report a child in need of protection (Child, Family and Community Service Act, section 14).', text: 'If you have reason to believe a child or youth needs protection, you must report it yourself, right away, to the youth’s social worker or the Helpline at 1-800-663-9122. Telling your supervisor does not replace your own report. Report even if you are unsure.' },
      { strong: 'Rights of children in care (Child, Family and Community Service Act, section 70).', text: 'Every youth has the right to be cared for, consulted, given privacy, kept free from physical punishment, and to contact their social worker, the Representative for Children and Youth or the Ombudsperson in private. You protect these rights and never punish a complaint.' },
      { strong: 'Protection of vulnerable adults (Adult Guardianship Act).', text: 'Suspected abuse, neglect or self-neglect of an adult we support is reported to the designated agency and to CLBC.' },
      { strong: 'MCFD and CLBC standards.', text: 'Our homes are run to MCFD residential care standards and CLBC standards and policies, including the rules on restricted practices. They decide how we staff, supervise, record and report.' },
      { strong: 'Privacy (BC privacy law, including FOIPPA).', text: 'Information about the people we support, their families and your co-workers is confidential. Share only what someone needs to provide care. This duty continues after you leave Evergreen.' },
      { strong: 'Workplace safety (WorkSafeBC Occupational Health and Safety Regulation).', text: 'Report every hazard, injury and near miss the same shift. You have the right to refuse unsafe work.' },
      { strong: 'Human rights (BC Human Rights Code).', text: 'No discrimination or harassment, toward the people we support or toward each other. Respect every person’s culture, identity, name and pronouns.' },
      { strong: 'Staying cleared to work.', text: 'Your Criminal Record Check and required training must stay current. Tell your Program Manager within 24 hours if you are charged with an offence, are the subject of a protection investigation, or have your driver’s licence suspended.' },
    ],
  },
  {
    key: 'lines',
    title: '3. The lines that are never crossed',
    lead: 'These are zero-tolerance rules. Breaking one means removal from the schedule right away, an investigation, and possibly dismissal and a report to MCFD, CLBC or the police.',
    points: [
      { strong: 'Never abuse, neglect or exploit a person in care', text: 'physically, emotionally, sexually or financially.' },
      { strong: 'Never use or threaten physical punishment,', text: 'humiliation, name-calling, mocking or shaming.' },
      { strong: 'Never withhold food, sleep, clothing, medical care,', text: 'family or cultural contact, or a person’s rights as a consequence.' },
      { strong: 'Never cross a professional boundary.', text: 'No romantic or sexual contact of any kind. No contact with youth, adults in care or their families outside work, including by personal phone or social media.' },
      { strong: 'Never use a prohibited restraint.', text: 'No face-down holds, no pressure on the neck, chest or back, no seclusion. Physical intervention is a last resort, only by staff with current training.' },
      { strong: 'Never leave people without the supervision their plan requires,', text: 'and never leave a shift until you are relieved.' },
      { strong: 'Never change, back-date or falsify a record,', text: 'or sign for something you did not do or see.' },
      { strong: 'Never work impaired,', text: 'and never bring alcohol, cannabis, illegal drugs or weapons to a program.' },
      { strong: 'Never photograph or record the people we support on a personal device,', text: 'and never post anything about them or the program online.' },
      { strong: 'Never punish or retaliate against anyone', text: 'for making a complaint or a report in good faith.' },
    ],
  },
  {
    key: 'shift',
    title: '4. What we expect on every shift',
    lead: 'Good care is made of small things done properly, every time.',
    points: [
      { strong: 'Start prepared.', text: 'Read the shift log, handover notes, safety plans and alerts, and do a headcount.' },
      { strong: 'Follow each person’s care plan and supervision level,', text: 'and record your checks.' },
      { strong: 'Give medication only if you are signed off to do so,', text: 'and record every dose at the time it is given.' },
      { strong: 'Write a daily note for each person before you leave.', text: 'Keep it factual and respectful, written as if the person and their guardian will read it. They may.' },
      { strong: 'Critical incidents: tell the on-call supervisor immediately.', text: 'Write the incident report before the end of your shift.' },
      { strong: 'Missing youth: search for 30 minutes at most, then report.', text: 'If there is immediate danger, call 911 first.' },
      { strong: 'Use calm, trauma-informed approaches first.', text: 'Relationship, routine, choices and de-escalation come before anything else.' },
    ],
  },
  {
    key: 'ours',
    title: '5. What you can expect from us',
    lead: 'High standards are only fair when the people asked to meet them are supported.',
    points: [
      { strong: 'Paid training.', text: 'Training time is paid time, and your 90-day training plan continues from here.' },
      { strong: 'You are never alone.', text: 'An on-call supervisor is available on every shift.' },
      { strong: 'Regular feedback.', text: 'You will have probation reviews at 30, 90 and 120 days, then confirmation.' },
      { strong: 'Protection when you speak up.', text: 'Reporting unsafe practice, abuse or a breach of the rules in good faith is protected. Retaliation is not tolerated.' },
      { strong: 'A fair process.', text: 'If a concern is raised about your work, you will be told what it is, you can bring a support person, and you will be heard.' },
      { strong: 'A voice.', text: 'Use the suggestion button anywhere in the portal. Leadership reads what you send.' },
    ],
  },
];

// Extra section for Program Coordinators, Program Managers and everyone above them (level 2+).
export const WELCOME_LEADER_SECTION = {
  key: 'lead',
  title: '6. If you lead others',
  lead: 'Everything above applies to you first. As a Program Coordinator, Program Manager or director you also answer for the care given by your team.',
  points: [
    { strong: 'Set the standard.', text: 'Your team will do what they see you do. Be calm, respectful and consistent, and hold yourself to every rule you enforce.' },
    { strong: 'Schedule only staff who are cleared and trained,', text: 'and keep the required staffing on every shift. Escalate a gap right away.' },
    { strong: 'Review daily notes and incident reports within 24 hours.', text: 'Send critical incidents on the same day. MCFD, the guardian and CLBC are notified within 24 hours, and by phone right away when it is serious.' },
    { strong: 'Act on every concern.', text: 'An allegation about a staff member means they come off the schedule right away while it is looked into. Complaints are acknowledged within 2 business days.' },
    { strong: 'Supervise and develop your people.', text: 'Hold regular supervision meetings, complete probation and performance reviews on time, and keep your team’s training current.' },
    { strong: 'Be fair.', text: 'Tell people the concern in advance, hear their side, document it, and never allow retaliation against someone who spoke up.' },
    { strong: 'Be reachable.', text: 'When you are on call, answer within 15 minutes and be fit to respond.' },
  ],
};
export const welcomeSections = (isLeader) => (isLeader ? [...WELCOME_SECTIONS, WELCOME_LEADER_SECTION] : WELCOME_SECTIONS);

export const WELCOME_CLOSING = [
  'The people in our homes will remember how they were treated here. Show up for them with patience, respect and consistency, and you will have done this work well.',
  'We are proud to have you with us, and we look forward to the difference you will make.',
];

export const WELCOME_FOOTNOTE = 'This message is a summary. The Evergreen Staff Rules and Regulations Handbook and the Residential Care Policy Manual are the full rules, and they apply if anything here differs.';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// The same message as an email. certificateNo is optional; href opens the welcome screen in the portal.
export function welcomeEmail({ fullName, certificateNo, href, isLeader = false }) {
  const all = welcomeSections(isLeader);
  const subject = `Congratulations, ${firstName(fullName)}. Welcome to ${WELCOME_ORG}`;
  const p = (t) => `<p style="margin:0 0 12px;line-height:1.55">${esc(t)}</p>`;
  const sections = all.map((s) => `
<h3 style="margin:22px 0 8px;font-size:16px;color:#0b5a34">${esc(s.title)}</h3>
${p(s.lead)}
<ul style="margin:0 0 8px;padding-left:20px;line-height:1.5">${s.points.map((x) => `<li style="margin-bottom:6px"><strong>${esc(x.strong)}</strong> ${esc(x.text)}</li>`).join('')}</ul>`).join('');
  const html = `<!doctype html><html><body style="margin:0;background:#f4f6f5;font-family:Arial,Helvetica,sans-serif;color:#1d2b24">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f5;padding:20px 0"><tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#fff;border-radius:10px;overflow:hidden;border:1px solid #dde5e0">
<tr><td style="background:#0b5a34;color:#fff;padding:16px 24px;font-size:15px;letter-spacing:1px"><strong>EVERGREEN</strong> COMMUNITY CARE</td></tr>
<tr><td style="padding:24px;font-size:15px">
<p style="margin:0 0 4px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#6b7a72">A message from the Board of Directors</p>
<h2 style="margin:0 0 16px;font-size:22px;color:#0b5a34">Congratulations, ${esc(firstName(fullName))}. Welcome to the team.</h2>
${welcomeIntro(fullName).map(p).join('')}
${certificateNo ? p(`Your orientation certificate, ${certificateNo}, is attached and saved in your staff file.`) : ''}
${sections}
<div style="margin-top:22px">${WELCOME_CLOSING.map(p).join('')}</div>
<p style="margin:18px 0 0;line-height:1.5"><strong>${esc(WELCOME_SIGNATURE)}</strong><br>${esc(WELCOME_ORG)}</p>
<p style="margin:24px 0 4px"><a href="${href}" style="background:#0b5a34;color:#fff;text-decoration:none;padding:11px 18px;border-radius:6px;display:inline-block;font-weight:bold">Open the message in the portal</a></p>
<p style="margin:18px 0 0;font-size:12px;color:#6b7a72;line-height:1.5">${esc(WELCOME_FOOTNOTE)}</p>
</td></tr>
<tr><td style="padding:14px 24px;background:#f4f6f5;color:#6b7a72;font-size:12px">Automatic message from the Evergreen portal. Please don’t reply. Open the portal instead.</td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    'A MESSAGE FROM THE BOARD OF DIRECTORS', '', ...welcomeIntro(fullName), '',
    ...(certificateNo ? [`Your orientation certificate, ${certificateNo}, is attached and saved in your staff file.`, ''] : []),
    ...all.flatMap((s) => [s.title.toUpperCase(), s.lead, ...s.points.map((x) => `- ${x.strong} ${x.text}`), '']),
    ...WELCOME_CLOSING, '', WELCOME_SIGNATURE, WELCOME_ORG, '', `Open the message in the portal: ${href}`, '', WELCOME_FOOTNOTE,
  ].join('\n');
  return { subject, html, text };
}
