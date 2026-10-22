// Plain words: the short forms we use (with what they mean), friendlier status words,
// and error messages people can act on instead of database errors.

export const GLOSSARY = [
  { term: 'MAR', name: 'Medication record', meaning: 'Medication Administration Record — every dose given or refused, written down at the time.' },
  { term: 'KPI', name: 'Key performance number', meaning: 'A number we track to see how we are doing, for example “notes signed on time”.' },
  { term: 'CRC', name: 'Criminal record check', meaning: 'The vulnerable-sector criminal record check everyone needs before working with youth or adults.' },
  { term: 'MCFD', name: 'Ministry of Children and Family Development', meaning: 'The BC ministry that places children and youth with us.' },
  { term: 'CLBC', name: 'Community Living BC', meaning: 'The BC agency that funds support for adults with developmental disabilities.' },
  { term: 'SHSS', name: 'Specialized Homes and Support Services', meaning: 'MCFD’s program and contract for staffed homes like ours.' },
  { term: 'NVCI', name: 'Nonviolent Crisis Intervention', meaning: 'Training in calming a crisis safely; Module 1 is needed before working alone.' },
  { term: 'WHMIS', name: 'Workplace Hazardous Materials Information System', meaning: 'Training on using cleaning products and chemicals safely.' },
  { term: 'PCS', name: 'Provincial Centralized Screening', meaning: 'MCFD’s 24-hour line for child-protection reports: 1-800-663-9122.' },
  { term: 'CFCSA', name: 'Child, Family and Community Service Act', meaning: 'The BC law that protects children; it includes the duty to report abuse.' },
  { term: 'OHS', name: 'Occupational health and safety', meaning: 'Keeping staff safe at work (WorkSafeBC rules).' },
  { term: 'LOE', name: 'Letter of Expectation', meaning: 'A written letter about what needs to change. Three may lead to dismissal.' },
  { term: 'PC', name: 'Program Coordinator', meaning: 'Runs one house day to day and supervises its staff.' },
  { term: 'PM', name: 'Program Manager', meaning: 'Oversees several houses and the Program Coordinators.' },
  { term: 'ED', name: 'Executive Director', meaning: 'Leads operations and finance for Evergreen.' },
  { term: 'CSO', name: 'Chief Strategy Officer', meaning: 'Leads planning, growth and quality.' },
  { term: 'CEO', name: 'Chief Executive Officer', meaning: 'Leads the whole organization.' },
  { term: 'N/A', name: 'Not needed', meaning: 'This item doesn’t apply today — a short reason is always written.' },
  { term: 'Shift log', name: 'Communication book', meaning: 'Where each shift writes what the next shift needs to know.' },
  { term: 'Action item', name: 'Problem to fix', meaning: 'Something the system or a manager found that needs fixing, with an owner and a due date.' },
  { term: 'Referral', name: 'Intake', meaning: 'A request from MCFD or CLBC to place a youth or adult with us.' },
  { term: 'Probation', name: 'First 90 days', meaning: 'A new staff member’s first 90 days, with check-ins at 30 and 90 days.' },
];
const BY_TERM = Object.fromEntries(GLOSSARY.map((g) => [g.term.toLowerCase(), g]));
export const glossary = (term) => BY_TERM[String(term).toLowerCase()] ?? null;

// Status words people understand. The database keeps its own values; only the label changes.
const STATUS = {
  Submitted: 'Sent — waiting for a check',
  Verified: '✓ Approved',
  Returned: 'Needs fixing',
  'N/A': 'Not needed',
  Draft: 'Not sent yet',
  Withdrawn: 'Cancelled',
  'To do': 'To do',
};
export const plainStatus = (s) => STATUS[s] ?? s;

// Turn technical errors into something a person can act on.
export function plainError(msg) {
  if (!msg) return msg;
  const m = String(msg);
  const sql = m.match(/supabase\/([a-z0-9-]+\.sql)/i);
  if (sql) return `This part isn’t switched on yet. Please tell the office (setup file: ${sql[1]}).`;
  if (/row-level security|violates row level|permission denied|not allowed/i.test(m)) return 'You don’t have permission to do that. Ask your Program Coordinator if you think you should.';
  if (/duplicate key|already exists|unique constraint/i.test(m)) return 'That is already saved — no need to add it again.';
  if (/violates foreign key/i.test(m)) return 'That item is linked to something that no longer exists. Refresh the page and try again.';
  if (/violates not-null|null value in column/i.test(m)) return 'Something required is missing. Fill in every box marked as needed and try again.';
  if (/violates check constraint/i.test(m)) return 'One of the answers isn’t allowed. Check the choices and try again.';
  if (/invalid input syntax/i.test(m)) return 'One of the boxes has the wrong kind of answer (for example letters where a date or number is needed).';
  if (/does not exist|Could not find the (function|table)|schema cache/i.test(m)) return 'This part isn’t switched on yet. Please tell the office.';
  if (/JWT|session|not authenticated|Auth session missing/i.test(m)) return 'You were signed out. Please sign in again — what you typed may need to be entered again.';
  if (/fetch failed|network|ECONN|timeout|Failed to fetch/i.test(m)) return 'Couldn’t save — check your internet connection and try again.';
  if (/payload too large|file size|exceeded the maximum/i.test(m)) return 'That file is too big. Try a smaller photo or PDF (under 10 MB).';
  return m.replace(/^.*?ERROR:\s*/, '').replace(/\s*\(SQLSTATE[^)]*\)/, '');
}
