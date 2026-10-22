// 🔎 Missing youth or adult: the steps and timings (MCFD guideline Oct 2023 + Evergreen Staff Rules Handbook §11).
export function fmtMins(m) {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return `${h} h${r ? ` ${r} min` : ''}`;
}

// Search steps: do these at the same time, not one after another.
export const SEARCH_STEPS = [
  { key: 'searched_home', label: 'Searched the house, yard and nearby, including their room' },
  { key: 'called_texted', label: 'Called and texted their phone' },
  { key: 'social_media', label: 'Checked their social media for clues' },
  { key: 'friends_family', label: 'Called friends and approved family' },
  { key: 'usual_places', label: 'Checked places they usually go' },
  { key: 'hospital_school', label: 'Called the hospital (and school if open)' },
];

// Who must be told. extra = what to type (police file number, worker's name).
export const TELL_STEPS = [
  { key: 'pm', label: 'Program Manager told and gave direction', due: 30 },
  { key: 'worker', label: 'Social worker (or 1-800-663-9122 after hours) told', extra: 'Who you spoke to' },
  { key: 'police', label: 'Police called', extra: 'Police file number', due: 60 },
  { key: 'photo_to_police', label: 'Photo and info sheet given to police (ask them not to say publicly the person is in care)' },
  { key: 'ed', label: 'Executive Director told', due: 120 },
];

export const RETURN_STEPS = [
  { key: 'welcomed', label: 'Welcomed back calmly — no anger, questioning or punishment' },
  { key: 'injury_check', label: 'Checked for injuries and how they are feeling' },
  { key: 'everyone_told', label: 'Told police and everyone who was told that they’re back' },
  { key: 'worker_return', label: 'Told the social worker where they were and why they left (if known)' },
  { key: 'return_interview', label: 'Return interview offered' },
];

export const STEP_LABEL = Object.fromEntries([
  ['started', '🔎 Reported missing'], ['found', '✅ Back / found'], ['closed', '🗂 Closed after debrief'],
  ['sighting', '👀 Sighting or new information'], ['note', '📝 Note'],
  ...[...SEARCH_STEPS, ...TELL_STEPS, ...RETURN_STEPS].map((x) => [x.key, x.label]),
]);
