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
