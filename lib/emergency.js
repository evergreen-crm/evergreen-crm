// The 🆘 emergency button: what each kind of emergency means and the first steps (Staff Rules Handbook, sections 10–11).
export const EMERGENCIES = [
  { key: 'Medical', icon: '🚑', label: 'Medical emergency', call911: true,
    steps: ['Call 911 if anyone is seriously hurt, not breathing, unconscious or has taken too much of a drug.', 'Give first aid; use naloxone for a suspected opioid overdose.', 'Stay with the person. Send someone to meet the ambulance if you can.', 'Write the incident report before the end of your shift.'] },
  { key: 'Missing youth', icon: '🔎', label: 'Missing youth / person',
    steps: ['Start the missing log now — note the time they were last seen and what they wore.', 'Search like a parent for 30 minutes at most: call and text them, check the house and yard, friends, usual places.', 'In immediate danger (late, cold, drugs or alcohol, upset, suicide risk, exploitation, young): call 911 first.', 'No plan or not found: call the social worker or PCS 1-800-663-9122 (option 1). Police if no direction after 1 hour.', 'Your Program Manager has been alerted.'] },
  { key: 'Violence', icon: '⚠️', label: 'Violence / I’m not safe', call911: true,
    steps: ['Get yourself and others to a safe place. Leave the area if you need to.', 'Call 911 if anyone is in danger.', 'Use NVCI de-escalation only if it is safe to do so.', 'Your Program Coordinator and Manager have been alerted with your location.'] },
  { key: 'Fire', icon: '🔥', label: 'Fire or gas leak', call911: true,
    steps: ['Get everyone out using the nearest safe exit. Do not stop for belongings.', 'Call 911 from outside.', 'Count everyone at the meeting point.', 'Do not go back inside.'] },
  { key: 'Police', icon: '🚓', label: 'Police are here / needed',
    steps: ['Stay calm and cooperate. Ask for the officer’s name and file number.', 'Do not share youth information beyond what is needed — call your Program Manager.', 'Write the incident report before the end of your shift.'] },
  { key: 'Abuse disclosure', icon: '🛡', label: 'A youth told me about abuse',
    steps: ['Listen calmly. Don’t ask leading questions or promise secrecy.', 'Report it yourself, right away: call the social worker or PCS 1-800-663-9122.', 'Write down their exact words and the time.', 'Your Program Manager has been alerted.'] },
  { key: 'Other', icon: '🆘', label: 'Other emergency',
    steps: ['Keep everyone safe first. Call 911 if anyone is in danger.', 'Your Program Coordinator and Manager have been alerted.', 'Write an incident report before the end of your shift.'] },
];
export const emergencyByKey = (k) => EMERGENCIES.find((e) => e.key === k) ?? EMERGENCIES[EMERGENCIES.length - 1];
