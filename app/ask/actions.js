'use server';
// 🤖 Ask Evergreen: answer a question from Evergreen's policies and help tips (lib/ask.js).
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { levelOf } from '@/lib/levels';
import { askReady, askClaude, namesInQuestion, isDanger, isMeds, indexPolicies } from '@/lib/ask';

const NOT_SET_UP = 'Ask Evergreen isn’t set up yet (setup file: ask-evergreen.sql).';
const plainErr = (e) => (/does not exist|Could not find the function/i.test(e?.message ?? '') ? NOT_SET_UP : (e?.message ?? 'Something went wrong.'));
const NOT_FOUND = 'I couldn’t find this in Evergreen’s policies. Please ask your Program Coordinator.';

// The part of a policy section around the first word of the question (about 600 letters).
function snippet(text, q) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= 650) return t;
  const words = String(q).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4).sort((a, b) => b.length - a.length);
  const low = t.toLowerCase();
  let at = -1;
  for (const w of words) { at = low.indexOf(w.slice(0, Math.max(4, w.length - 2))); if (at >= 0) break; }
  const start = Math.max(0, (at < 0 ? 0 : at) - 200);
  return (start > 0 ? '… ' : '') + t.slice(start, start + 600).trim() + (start + 600 < t.length ? ' …' : '');
}

export async function askQuestion({ question }) {
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  const q = String(question ?? '').trim().slice(0, 1000);
  if (q.length < 3) return { error: 'Please type a question.' };
  const danger = isDanger(q), meds = isMeds(q);

  // Never send a youth's or adult's name out of the CRM.
  const names = await namesInQuestion(supabase, q).catch(() => []);
  if (names.length) return { blocked: true, error: 'Please ask again without a name. For privacy, questions can’t include the name of a youth or adult in care — say “a youth” or “a resident” instead.', danger, meds };

  const { data: logId, error: startErr } = await supabase.rpc('ask_start', { p_q: q });
  if (startErr) return { error: plainErr(startErr), danger, meds };

  const { data: chunks, error: searchErr } = await supabase.rpc('ask_search', { p_q: q, p_n: 8 });
  if (searchErr) return { error: plainErr(searchErr), danger, meds };
  let answer = NOT_FOUND, sources = [], found = false;
  // Free mode (no AI key): show the matching policy sections themselves, best first.
  if (!askReady()) {
    const excerpts = (chunks ?? []).slice(0, 5).map((c, i) => ({ n: i + 1, title: c.title, page: c.page, link: c.link, text: snippet(c.content, q) }));
    found = excerpts.length > 0;
    await supabase.rpc('ask_finish', { p_id: logId, p_answer: found ? '(search only)' : NOT_FOUND, p_sources: excerpts.map(({ text, ...s }) => s), p_found: found });
    revalidatePath('/ask');
    return { id: logId, mode: 'search', excerpts, found, answer: found ? null : NOT_FOUND, danger, meds };
  }
  if (chunks?.length) {
    try { answer = await askClaude(q, chunks); }
    catch (e) { return { error: 'Ask Evergreen couldn’t answer just now (' + e.message + '). Please try again in a minute.', danger, meds }; }
    const used = new Set([...answer.matchAll(/\[(\d{1,2})\]/g)].map((m) => Number(m[1])).filter((n) => n >= 1 && n <= chunks.length));
    sources = [...used].sort((a, b) => a - b).map((n) => ({ n, title: chunks[n - 1].title, page: chunks[n - 1].page, link: chunks[n - 1].link }));
    found = !/couldn.t find this in Evergreen/i.test(answer);
  }
  await supabase.rpc('ask_finish', { p_id: logId, p_answer: answer, p_sources: sources, p_found: found });
  revalidatePath('/ask');
  return { id: logId, answer, sources, found, danger, meds, level: levelOf(profile) };
}

export async function rateAnswer({ id, helpful }) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const { error } = await supabase.from('ask_log').update({ helpful: !!helpful }).eq('id', id);
  return error ? { error: plainErr(error) } : { ok: true };
}

// Directors (level 4+) and Admin: read new or changed policies in now (also runs every night).
export async function readPoliciesNow() {
  const { profile } = await requireUser(['admin', 'manager', 'staff']);
  if (!(levelOf(profile) >= 4 || profile.role === 'admin')) return { error: 'Directors only.' };
  const r = await indexPolicies({ budgetMs: 45000, retryFailed: true });
  revalidatePath('/ask');
  return r;
}
