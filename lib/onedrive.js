// OneDrive for the nightly backup (Microsoft Graph). Server only. The Administrator signs in once as
// backup@evergreencommunitycare.com with a code (device sign-in, so no password ever passes through the portal);
// the refresh token goes into Supabase Vault (supabase/onedrive-backup.sql). Delegated permission Files.ReadWrite
// reaches only that account's own OneDrive.
import 'server-only';

export const SCOPE = 'offline_access Files.ReadWrite User.Read';
const login = (tenant) => `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0`;
const form = (o) => new URLSearchParams(o).toString();

async function post(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form(body), cache: 'no-store' });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, j };
}

// Step 1: ask Microsoft for a sign-in code.
export async function startDeviceSignIn(tenant, clientId) {
  const { ok, j } = await post(`${login(tenant)}/devicecode`, { client_id: clientId, scope: SCOPE });
  if (!ok) return { error: j.error_description?.split('\r\n')[0] ?? j.error ?? 'Microsoft refused the request.' };
  return { deviceCode: j.device_code, userCode: j.user_code, url: j.verification_uri, expiresIn: j.expires_in };
}

// Step 2: after the person signed in, collect the tokens.
export async function finishDeviceSignIn(tenant, clientId, deviceCode) {
  const { ok, j } = await post(`${login(tenant)}/token`, { grant_type: 'urn:ietf:params:oauth:grant-type:device_code', client_id: clientId, device_code: deviceCode });
  if (!ok) return { pending: j.error === 'authorization_pending', error: j.error === 'authorization_pending' ? null : (j.error_description?.split('\r\n')[0] ?? j.error ?? 'Sign-in failed.') };
  return { access: j.access_token, refresh: j.refresh_token };
}

export async function refreshAccess(tenant, clientId, refresh) {
  const { ok, j } = await post(`${login(tenant)}/token`, { grant_type: 'refresh_token', client_id: clientId, refresh_token: refresh, scope: SCOPE });
  if (!ok) return { error: j.error_description?.split('\r\n')[0] ?? j.error ?? 'Could not refresh the OneDrive sign-in.' };
  return { access: j.access_token, refresh: j.refresh_token ?? refresh };
}

export async function whoAmI(access) {
  const r = await fetch('https://graph.microsoft.com/v1.0/me?$select=userPrincipalName,mail,displayName', { headers: { Authorization: `Bearer ${access}` }, cache: 'no-store' });
  const j = await r.json().catch(() => ({}));
  return r.ok ? (j.mail || j.userPrincipalName || j.displayName || 'unknown') : null;
}

// A small file (under 4 MB) into the backup folder.
export async function putSmallFile(access, path, text) {
  const enc = path.split('/').map(encodeURIComponent).join('/');
  const r = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/${enc}:/content`, {
    method: 'PUT', headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'text/plain' }, body: text, cache: 'no-store',
  });
  const j = await r.json().catch(() => ({}));
  return r.ok ? { ok: true, webUrl: j.webUrl } : { error: j.error?.message ?? `OneDrive said ${r.status}` };
}
