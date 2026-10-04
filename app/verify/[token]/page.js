// Public page shown when someone scans a staff ID card's QR code. No sign-in needed.
import { createClient } from '@/lib/supabase/server';
import { fmtDate, fmtDateTime } from '@/lib/options';

export const metadata = { title: 'Verify staff ID · Evergreen Community Care', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const PROGRAM = { MCFD: 'MCFD', CLBC: 'CLBC', Both: 'MCFD & CLBC' };

export default async function VerifyPage({ params }) {
  const { token } = await params;
  const supabase = await createClient();
  const ok = /^[0-9a-f-]{36}$/i.test(token);
  const { data } = ok ? await supabase.rpc('verify_id_card', { t: token }) : { data: null };
  const c = data?.[0];
  let photo = null;
  if (c?.photo_path && c.status === 'Valid') {
    const { data: s } = await supabase.storage.from('id-photos').createSignedUrl(c.photo_path, 600);
    photo = s?.signedUrl ?? null;
  }
  const valid = c?.status === 'Valid';

  return (
    <main className="verify">
      <div className="verify-head"><img src="/logo.png" alt="Evergreen Community Care" /></div>
      <div className={`verify-box ${valid ? 'ok' : 'bad'}`}>
        <div className="verify-status">{valid ? '✓ VALID STAFF ID' : c ? `✕ ${c.status.toUpperCase()}` : '✕ NOT RECOGNISED'}</div>
        {c && (
          <div className="verify-person">
            {photo && <img src={photo} alt={c.full_name} />}
            <div>
              <strong>{c.full_name}</strong>
              <span>{c.job_title ?? 'Staff'}{c.house && ` · ${c.house}`}</span>
              <span>Employee no. {c.employee_no ?? '—'} · {PROGRAM[c.program] ?? c.program}</span>
              {c.expires_on && <span>{c.status === 'Expired' ? 'Expired' : 'Valid until'} {fmtDate(c.expires_on)}</span>}
            </div>
          </div>
        )}
        {!valid && <p className="small">This card is not currently valid. Please contact Evergreen Community Care to confirm who this person is.</p>}
      </div>
      <p className="muted small">Checked {fmtDateTime(new Date().toISOString())} · Evergreen Community Care Inc.</p>
    </main>
  );
}
