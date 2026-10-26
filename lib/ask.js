// 🤖 Ask Evergreen (AI helper, phase 1) — answers policy and how-to questions from Evergreen's own policies
// and the CRM help tips only, with the policy name and page. Setup: supabase/ask-evergreen.sql.
//  · Safety first: danger words always show 🆘 / 911 / on-call / 1-800-663-9122 before any answer.
//  · No youth data: a question naming a youth or adult in care is stopped before anything is sent.
//  · No medical or medication advice beyond what the policy says (staff are sent to the MAR, pharmacist, on-call).
//  · Model: Claude Haiku 5.5 (fast and low cost: about a tenth of a cent per question).
import 'server-only';
import { createAdminClient, adminKey } from '@/lib/supabase/admin';
import { PAGE_HELP, FAQ, HELP_GUIDES } from '@/lib/help';
import { RULES, EVERGREEN_RULES } from '@/lib/rules';

export const ASK_MODEL = process.env.ASK_MODEL || 'claude-haiku-5-5';
export const askReady = () => !!process.env.ANTHROPIC_API_KEY;
export const ASK_DAILY_LIMIT = 30;

// ---------- Safety ----------
const DANGER = /\b(missing|run ?away|ran away|awol|not (come|came) (home|back)|overdos|od'?d|suicid|kill (him|her|them)sel|self[- ]?harm|cutting|hurt(ing)? (him|her|them)sel|abus|assault|sexual|weapon|knife|gun|fire|smoke|unconscious|not breathing|breathing|choking|seizure|bleeding|police|911|emergenc|danger|threat|violent|attack|restrain|allergic|anaphyla|epipen|naloxone|narcan)/i;
export const isDanger = (q) => DANGER.test(q ?? '');
const MEDS = /\b(dose|dosage|mg|milligram|how much .*(give|take)|double (up|dose)|missed (a )?dose|tylenol|advil|ibuprofen|acetaminophen|melatonin|prn|medication|meds?|pill|tablet|insulin|inhaler)\b/i;
export const isMeds = (q) => MEDS.test(q ?? '');

// A question that names a youth or adult in care is stopped: their information must never leave the CRM.
export async function namesInQuestion(supabase, q) {
  const { data } = await supabase.from('residents').select('first_name, last_name, preferred_name').limit(500);
  const text = ` ${String(q).toLowerCase()} `;
  const hits = new Set();
  for (const r of data ?? []) {
    for (const n of [r.first_name, r.last_name, r.preferred_name]) {
      const w = String(n ?? '').trim().toLowerCase();
      if (w.length >= 3 && new RegExp(`[^a-z]${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^a-z]`).test(text)) hits.add(n);
    }
  }
  return [...hits];
}

// ---------- The answer ----------
const SYSTEM = `You are "Ask Evergreen", the helper inside the Evergreen Community Care CRM (a BC, Canada group-home agency for youth in care (MCFD) and adults (CLBC)). Staff ask how to do their job.

Rules:
- Answer ONLY from the numbered SOURCES given. If the sources don't answer the question, say: "I couldn't find this in Evergreen's policies. Please ask your Program Coordinator." Never guess or use outside knowledge, and never make up a policy, phone number, time limit or form.
- Put the source number in square brackets after each fact, like [2]. Use only numbers that appear in SOURCES.
- Plain, simple English (grade 6). Short: a one-line answer first, then up to 6 short steps or bullet points. No long introductions.
- Safety first: if anyone may be in danger, start with: "If anyone is in danger, call 911 now, then on-call." For possible abuse or neglect of a child or youth, also say they must call 1-800-663-9122 themselves.
- Medication and health: never give a dose or medical advice of your own. Only repeat what the policy says, and tell them to follow the MAR and the pharmacist's label and call on-call or the pharmacist if unsure.
- Never ask for or repeat a youth's or adult's name or personal details.
- You are not a lawyer or a doctor. For HR questions about pay, discipline or a complaint, give the policy, then say to talk to their Program Coordinator, HR or Payroll.`;

export async function askClaude(question, chunks) {
  const sources = chunks.map((c, i) => `[${i + 1}] ${c.title}${c.page ? `, page ${c.page}` : ''}\n${c.content}`).join('\n\n---\n\n');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: ASK_MODEL, max_tokens: 800, temperature: 0, system: SYSTEM,
      messages: [{ role: 'user', content: `SOURCES:\n\n${sources}\n\n=====\nQUESTION: ${question}` }],
    }),
    signal: AbortSignal.timeout(45000),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok) throw new Error(j?.error?.message || `The AI service answered ${res.status}.`);
  return (j?.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
}

// ---------- Reading the policies in ----------
const clean = (t) => String(t ?? '').replace(/\u0000/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
function chunkText(text, size = 1600, overlap = 200) {
  const t = clean(text);
  if (t.length <= size) return t.length >= 40 ? [t] : [];
  const out = [];
  let i = 0;
  while (i < t.length) {
    let end = Math.min(t.length, i + size);
    const cut = t.lastIndexOf('\n', end);
    if (end < t.length && cut > i + size * 0.6) end = cut;
    const part = t.slice(i, end).trim();
    if (part.length >= 40) out.push(part);
    if (end >= t.length) break;
    i = Math.max(end - overlap, i + 1);
  }
  return out;
}

// Help tips, FAQ, guides and the "Rules and laws we follow" — rebuilt every time (they live in the code).
export function helpChunks() {
  const rows = [];
  for (const h of PAGE_HELP) rows.push({ title: `CRM help: ${h.title} page`, link: h.path, content: h.tips.join('\n') });
  rows.push({ title: 'CRM help: common questions', link: '/help', content: FAQ.map((f) => `Q: ${f.q}\nA: ${f.a}`).join('\n\n') });
  for (const g of HELP_GUIDES) rows.push({ title: `CRM help: ${g.title}`, link: '/help', content: g.items.map(([a, b]) => `${a}: ${b}`).join('\n') });
  for (const r of [...RULES, ...EVERGREEN_RULES]) rows.push({ title: `Rules we follow: ${r.title}`, link: '/help', content: (r.points ?? []).join('\n') });
  return rows.flatMap((r) => chunkText(r.content).map((content) => ({ source: 'help', title: r.title, link: r.link, content })));
}

// Reads policy PDFs that aren't read in yet (newest version only), within a time budget. Safe to call again.
export async function indexPolicies({ budgetMs = 40000, force = false, retryFailed = false } = {}) {
  if (!adminKey()) return { error: 'The Supabase secret key is not set in Vercel.' };
  const started = Date.now();
  const admin = createAdminClient();
  const { extractText, getDocumentProxy } = await import('unpdf');
  const out = { done: 0, failed: [], left: 0, help: 0 };

  // Help tips: replace them every run (cheap).
  const help = helpChunks();
  await admin.from('ask_chunks').delete().eq('source', 'help');
  for (let i = 0; i < help.length; i += 200) {
    const { error } = await admin.from('ask_chunks').insert(help.slice(i, i + 200));
    if (error) return { error: 'Ask Evergreen isn’t set up yet (run supabase/ask-evergreen.sql): ' + error.message };
  }
  out.help = help.length;

  const { data: pols, error } = await admin.from('policies')
    .select('id, title, active, current_version_id, v:current_version_id(id, file_path, file_type, file_name, version_label)').eq('active', true).order('title');
  if (error) return { error: error.message };
  const { data: done } = await admin.from('ask_indexed').select('version_id, chunks');
  const doneSet = new Set(force ? [] : (done ?? []).filter((d) => !(retryFailed && d.chunks === 0)).map((d) => d.version_id));
  const todo = (pols ?? []).filter((p) => p.v?.id && !doneSet.has(p.v.id));

  for (const p of todo) {
    if (Date.now() - started > budgetMs) { out.left++; continue; }
    try {
      const isPdf = /pdf/i.test(p.v.file_type ?? '') || /\.pdf$/i.test(p.v.file_path ?? p.v.file_name ?? '');
      let pages = [];
      if (isPdf) {
        const { data: blob, error: dlErr } = await admin.storage.from('policies').download(p.v.file_path);
        if (dlErr) throw new Error(dlErr.message);
        const pdf = await getDocumentProxy(new Uint8Array(await blob.arrayBuffer()));
        const { text } = await extractText(pdf, { mergePages: false });
        pages = Array.isArray(text) ? text : [text];
      }
      const rows = [];
      pages.forEach((t, i) => chunkText(t).forEach((content) => rows.push({ source: 'policy', policy_id: p.id, version_id: p.v.id, title: p.title, page: i + 1, link: `/policies/${p.id}`, content })));
      await admin.from('ask_chunks').delete().eq('policy_id', p.id);
      for (let i = 0; i < rows.length; i += 200) {
        const { error: insErr } = await admin.from('ask_chunks').insert(rows.slice(i, i + 200));
        if (insErr) throw new Error(insErr.message);
      }
      const note = !isPdf ? 'Not a PDF — not read in' : rows.length ? null : 'No text found (a scanned PDF?)';
      await admin.from('ask_indexed').upsert({ version_id: p.v.id, policy_id: p.id, pages: pages.length, chunks: rows.length, note, indexed_at: new Date().toISOString() });
      if (note) out.failed.push(`${p.title}: ${note}`); else out.done++;
    } catch (e) {
      // Recorded so it isn't retried every few minutes; it is tried again when a new version is uploaded (or "Read … now").
      await admin.from('ask_indexed').upsert({ version_id: p.v.id, policy_id: p.id, pages: 0, chunks: 0, note: 'Could not read: ' + String(e.message).slice(0, 200), indexed_at: new Date().toISOString() });
      out.failed.push(`${p.title}: ${e.message}`);
    }
  }
  return out;
}
