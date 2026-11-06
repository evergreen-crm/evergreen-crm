// OneDrive / SharePoint video links for Academy courses (training_videos table).
// A Microsoft 365 "Anyone with the link" share link opens a viewer page; adding download=1 makes it stream the
// file itself, so the CRM's own player can still check the whole video was watched before the quiz opens.
export function playableVideoUrl(url) {
  if (!url || !/^https:\/\//i.test(url)) return null;
  try {
    const u = new URL(url);
    if (/sharepoint\.com$/i.test(u.hostname) && !u.searchParams.has('download')) u.searchParams.set('download', '1');
    return u.toString();
  } catch {
    return null;
  }
}

// The saved link for one course, or null. Uses the viewer's own connection (everyone signed in can read).
export async function courseVideoLink(supabase, key) {
  const { data } = await supabase.from('training_videos').select('url').eq('course_key', key).maybeSingle();
  return playableVideoUrl(data?.url);
}

// The video staff should watch for one course: the current version (Academy -> Course videos), or null.
// Returns { url, version } — a OneDrive link made playable, or a signed link to the uploaded file.
// Before versions existed, a saved link or the newest .mp4 in the course folder was used; that still works as a fallback.
export async function currentCourseVideo(supabase, key) {
  const folder = key === 'orientation' ? 'orientation' : `courses/${key}`;
  const { data: v } = await supabase.from('course_video_versions').select('version_no, source, path, url')
    .eq('course_key', key).eq('is_current', true).maybeSingle();
  if (v?.source === 'link') return { url: playableVideoUrl(v.url), version: v.version_no };
  if (v?.source === 'upload') {
    const { data } = await supabase.storage.from('academy-media').createSignedUrl(v.path, 6 * 3600);
    if (data?.signedUrl) return { url: data.signedUrl, version: v.version_no };
  }
  const linked = await courseVideoLink(supabase, key);
  if (linked) return { url: linked, version: null };
  const { data: files } = await supabase.storage.from('academy-media').list(folder, { limit: 50, sortBy: { column: 'updated_at', order: 'desc' } });
  const latest = (files ?? []).find((f) => /\.mp4$/i.test(f.name));
  if (!latest) return { url: null, version: null };
  const { data } = await supabase.storage.from('academy-media').createSignedUrl(`${folder}/${latest.name}`, 6 * 3600);
  return { url: data?.signedUrl ?? null, version: null };
}
