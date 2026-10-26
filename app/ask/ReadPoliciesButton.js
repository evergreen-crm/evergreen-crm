'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { readPoliciesNow } from './actions';

export default function ReadPoliciesButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const router = useRouter();
  async function go() {
    setBusy(true); setMsg(null);
    const r = await readPoliciesNow().catch((e) => ({ error: e.message }));
    setMsg(r.error ? r.error : `Read in ${r.done} polic${r.done === 1 ? 'y' : 'ies'} and ${r.help} help tips.${r.left ? ` ${r.left} still to do — tap again.` : ''}${r.failed?.length ? ` Problems: ${r.failed.join('; ')}` : ''}`);
    setBusy(false); router.refresh();
  }
  return (<p><button type="button" onClick={go} disabled={busy}>{busy ? 'Reading the policies… (up to a minute)' : '📚 Read new or changed policies now'}</button>{msg && <span className="small" style={{ marginLeft: 8 }}>{msg}</span>}</p>);
}
