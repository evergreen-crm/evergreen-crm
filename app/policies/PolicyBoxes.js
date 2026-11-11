'use client';
// Admin: place the signature boxes on one version of a policy. The boxes are saved as PDF positions.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import BoxEditor from '@/app/sign/new/BoxEditor';
import { toPdfRect, fromPdfRect } from '@/app/sign/PdfPages';
import { saveVersionBoxes } from '@/app/policies/signActions';

const STAFF = [{ key: 'staff', label: 'Staff member (signs here)', short: 'Staff', color: '#1f6feb' }];

export default function PolicyBoxes({ versionId, versionLabel, url, initialFields }) {
  const [boxes, setBoxes] = useState([]);
  const [viewports, setViewports] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  // Turn the saved PDF positions into boxes on the page, once the document has loaded.
  function loaded(vps) {
    setViewports(vps);
    if (boxes.length === 0 && initialFields.length) {
      setBoxes(initialFields.map((f) => {
        const b = fromPdfRect(vps[f.page], f.rect);
        return { id: f.id, type: f.type, who: 'staff', page: f.page, ...b, label: f.label ?? '', required: f.required !== false };
      }));
    }
  }

  async function save() {
    if (!viewports) return;
    setBusy(true); setMsg(null);
    const fields = boxes.map((b) => ({ id: b.id, type: b.type, page: b.page, rect: toPdfRect(viewports[b.page], b), label: b.label, required: b.required }));
    const res = await saveVersionBoxes({ version_id: versionId, fields });
    setBusy(false);
    if (res?.error) { setMsg({ bad: true, text: res.error }); return; }
    setMsg({ bad: false, text: `Saved. Staff can now sign version ${versionLabel} in these boxes.` });
    router.refresh();
  }

  return (
    <>
      <section className="card no-print">
        <div className="title-row">
          <h2 style={{ margin: 0 }}>Signature boxes for version {versionLabel}</h2>
          <button type="button" onClick={save} disabled={busy || !viewports || !boxes.some((b) => b.type === 'signature')}>{busy ? 'Saving…' : '💾 Save the boxes'}</button>
        </div>
        <p className="small">Put a ✍️ <strong>Signature</strong> box where staff sign, on the page with the approval or acknowledgement line. Add date, name or initials boxes if you want them. Staff can only sign this version once the signature box is saved.</p>
        {msg && <p className={`message ${msg.bad ? 'error' : 'ok'}`}>{msg.text}</p>}
      </section>
      <BoxEditor url={url} people={STAFF} boxes={boxes} setBoxes={setBoxes} onViewports={loaded} />
    </>
  );
}
