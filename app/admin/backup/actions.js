'use server';
// 💾 Backup: connect the OneDrive (backup@) and test it. Administrator only. supabase/onedrive-backup.sql
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { createAdminClient, adminKey } from '@/lib/supabase/admin';
import { fail } from '@/lib/fail';
import { startDeviceSignIn, finishDeviceSignIn, refreshAccess, whoAmI, putSmallFile } from '@/lib/onedrive';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const back = (msg) => redirect('/admin/backup?ok=' + encodeURIComponent(msg));

async function adminOnly() {
  const ctx = await requireUser(['admin']);
  if (!adminKey()) await fail('The server key is not set up, so the backup can’t be connected here.');
  return ctx;
}

export async function startConnect(formData) {
  const { user } = await adminOnly();
  const tenant = String(formData.get('tenant_id') ?? '').trim();
  const client = String(formData.get('client_id') ?? '').trim();
  if (!GUID.test(tenant) || !GUID.test(client)) await fail('Both IDs look like 8-4-4-4-12 letters and numbers. Copy them from the app’s Overview page in Microsoft Entra.');
  const s = await startDeviceSignIn(tenant, client);
  if (s.error) await fail('Microsoft: ' + s.error);
  const admin = createAdminClient();
  const { error } = await admin.from('backup_settings').update({
    tenant_id: tenant, client_id: client, pending_device_code: s.deviceCode, pending_user_code: s.userCode, pending_url: s.url,
    pending_until: new Date(Date.now() + (s.expiresIn ?? 900) * 1000).toISOString(),
  }).eq('id', 1);
  if (error) await fail('Could not save: ' + error.message);
  void user;
  revalidatePath('/admin/backup');
  redirect('/admin/backup');
}

export async function finishConnect() {
  const { user } = await adminOnly();
  const admin = createAdminClient();
  const { data: s } = await admin.from('backup_settings').select('*').eq('id', 1).maybeSingle();
  if (!s?.pending_device_code) await fail('Start the sign-in first.');
  if (s.pending_until && new Date(s.pending_until) < new Date()) await fail('The sign-in code expired. Press “Get a sign-in code” again.');
  const t = await finishDeviceSignIn(s.tenant_id, s.client_id, s.pending_device_code);
  if (t.pending) await fail('Microsoft hasn’t finished the sign-in yet. Finish it on the Microsoft page, then press the button again.');
  if (t.error || !t.refresh) await fail('Microsoft: ' + (t.error ?? 'no sign-in token came back. Check that “offline_access” is allowed.'));
  const account = await whoAmI(t.access);
  const { error: e1 } = await admin.rpc('backup_save_token', { p_token: t.refresh });
  if (e1) await fail('Could not keep the sign-in safely: ' + e1.message);
  await admin.from('backup_settings').update({
    account, connected_at: new Date().toISOString(), connected_by: user.id,
    pending_device_code: null, pending_user_code: null, pending_url: null, pending_until: null,
  }).eq('id', 1);
  revalidatePath('/admin/backup');
  back(`Connected to the OneDrive of ${account ?? 'the account you signed in with'}.${account && !/^backup@/i.test(account) ? ' Note: this is not backup@evergreencommunitycare.com. Connect again and sign in as backup@ if that was a mistake.' : ''}`);
}

export async function testUpload() {
  await adminOnly();
  const admin = createAdminClient();
  const [{ data: s }, { data: token }] = await Promise.all([
    admin.from('backup_settings').select('tenant_id, client_id, folder').eq('id', 1).maybeSingle(),
    admin.rpc('backup_get_token'),
  ]);
  if (!s?.tenant_id || !token) await fail('Connect the OneDrive first.');
  const a = await refreshAccess(s.tenant_id, s.client_id, token);
  if (a.error) await fail('Microsoft: ' + a.error + ' Connect the OneDrive again.');
  if (a.refresh && a.refresh !== token) await admin.rpc('backup_save_token', { p_token: a.refresh });
  const when = new Date().toISOString();
  const up = await putSmallFile(a.access, `${s.folder}/connection-test.txt`, `Evergreen portal connection test, ${when}. This file can be deleted.\n`);
  if (up.error) await fail('OneDrive: ' + up.error);
  back(`Test file saved in OneDrive → ${s.folder}. The connection works.`);
}

export async function disconnect() {
  await adminOnly();
  const admin = createAdminClient();
  await admin.rpc('backup_save_token', { p_token: 'disconnected' });
  await admin.from('backup_settings').update({ account: null, connected_at: null, connected_by: null, pending_device_code: null, pending_user_code: null, pending_url: null, pending_until: null }).eq('id', 1);
  revalidatePath('/admin/backup');
  back('Disconnected. The nightly backup stops until the OneDrive is connected again.');
}
