// The reference form and rules shared by the browser and the server (lib/references.js does the sending).
// References must be people who supervised the applicant / staff member (Melvin, Oct 26 2026).
export const REF_RELATIONS = ['Manager / supervisor', 'Program manager / coordinator', 'Clinical / team supervisor', 'Practicum / placement supervisor'];

// The reference form (answered by the supervisor).
export const REF_FORM = {
  ratings: [
    ['reliability', 'Reliability and attendance'],
    ['clients', 'Care and respect for clients / people served'],
    ['team', 'Teamwork and communication'],
    ['policies', 'Following policies, documentation and direction'],
    ['stress', 'Handling stress, conflict or a crisis'],
  ],
  text: [
    ['role', 'What was their position, and what did they do?', true],
    ['strengths', 'What are their main strengths?', false],
    ['growth', 'Where could they grow or improve?', false],
  ],
};
export const RATING_WORDS = { 5: 'Excellent', 4: 'Good', 3: 'OK', 2: 'Weak', 1: 'Poor' };


export const okEmail = (e) => typeof e === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e.trim());

export function cleanRefs(raw) {
  const s = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  return [0, 1, 2].map((i) => {
    const r = raw?.[i] ?? {};
    return { name: s(r.name, 120), title: s(r.title, 120), org: s(r.org, 160), rel: s(r.rel, 60), phone: s(r.phone, 40), email: s(r.email, 160).toLowerCase(), years: s(r.years, 40) };
  });
}
// Same rules for applicants and staff: 3 supervisors, each with agency, email and phone; 3 different emails.
export function refErrors(refs, ownEmail = null) {
  const e = [];
  refs.forEach((r, i) => {
    if (!r.name || !r.title || !r.org || !r.phone || !r.email) e.push(`Reference ${i + 1}: give the name, job title, agency, phone and email.`);
    else if (!okEmail(r.email)) e.push(`Reference ${i + 1}: the email address doesn’t look right.`);
    if (!REF_RELATIONS.includes(r.rel)) e.push(`Reference ${i + 1}: must be someone who supervised you (choose the relationship).`);
  });
  const emails = refs.map((r) => r.email).filter(Boolean);
  if (new Set(emails).size < emails.length) e.push('Each reference needs a different email address.');
  if (ownEmail && emails.includes(String(ownEmail).toLowerCase())) e.push('A reference can’t use your own email address.');
  return e;
}

