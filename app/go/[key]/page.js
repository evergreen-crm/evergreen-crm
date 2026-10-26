// What's inside a home tile (e.g. /go/sick, /go/shift): a short list of big links.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { buildMenu } from '@/lib/menu';

export const dynamic = 'force-dynamic';

export default async function Hub({ params }) {
  const { key } = await params;
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  let onCall = null;
  if (profile.home_id) {
    const { data } = await supabase.from('homes').select('on_call_phone').eq('id', profile.home_id).maybeSingle();
    onCall = data?.on_call_phone ?? null;
  }
  const { data: psRole } = await supabase.rpc('prescreen_role');
  const menu = buildMenu(profile, { onCall, psRole });
  const tile = menu.tiles.find((t) => t.key === key);
  const hub = menu.hubs[key];
  if (!tile || !hub) redirect('/more');
  return (
    <main className="hub">
      <p className="small no-print"><Link href="/portal">← Home</Link></p>
      <h1>{hub.icon} {hub.label}</h1>
      <p className="muted">{hub.sub}</p>
      <ul className="hub-list">
        {hub.items.map((it) => (
          <li key={it.href + it.label}>
            <Link href={it.href}><span className="hub-icon" aria-hidden="true">{it.icon}</span><span><strong>{it.label}</strong>{it.note && <small className="muted"> {it.note}</small>}</span><span aria-hidden="true">›</span></Link>
          </li>
        ))}
      </ul>
      {hub.note && <p className="small">{hub.note}</p>}
    </main>
  );
}
