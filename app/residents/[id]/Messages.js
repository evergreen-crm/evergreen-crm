// "Messages" tab: private messages between the family and Evergreen.
import { fmtDateTime } from '@/lib/options';
import { sendMessage } from '@/app/residents/modules';

export default async function Messages({ supabase, resident, user, isFamily }) {
  const { data: msgs } = await supabase.from('messages').select('*')
    .eq('resident_id', resident.id).order('created_at', { ascending: true }).limit(300);

  // Opening this tab marks the other side's messages as read.
  const unread = (msgs ?? []).filter((m) => !m.read_at && (isFamily ? m.sender_role !== 'family' : m.sender_role === 'family'));
  if (unread.length) {
    await supabase.from('messages').update({ read_at: new Date().toISOString() }).in('id', unread.map((m) => m.id));
  }

  return (
    <section>
      <p className="muted small">
        {isFamily
          ? 'Send a message to the Evergreen team. For emergencies, please phone the house.'
          : 'Messages with family / guardians. Everything here is part of the permanent record.'}
      </p>
      <div className="chat">
        {msgs?.length === 0 && <p className="muted">No messages yet.</p>}
        {msgs?.map((m) => {
          const mine = m.sender_id === user.id;
          const fromFamily = m.sender_role === 'family';
          return (
            <div key={m.id} className={`bubble ${mine ? 'mine' : ''}`}>
              <div className="meta">{mine ? 'You' : fromFamily ? 'Family' : 'Evergreen staff'} · {fmtDateTime(m.created_at)}
                {mine && m.read_at && <span> · Read</span>}</div>
              <p>{m.body}</p>
            </div>
          );
        })}
      </div>
      <form action={sendMessage} className="card no-print">
        <input type="hidden" name="resident_id" value={resident.id} />
        <label>Message<textarea name="body" rows={3} required /></label>
        <button>Send</button>
      </form>
    </section>
  );
}
