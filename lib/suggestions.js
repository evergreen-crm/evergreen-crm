// 💡 Suggestions from staff (top bar, every page). Answered by directors in the QA portal (COA PQI / CR).
export const SUGGESTION_KINDS = [
  { key: 'Idea', icon: '💡', hint: 'Something that would make care or work better' },
  { key: 'Concern', icon: '⚠️', hint: 'Something that worries you (if anyone is in danger, use 🆘 or call 911)' },
  { key: 'Compliment', icon: '🌟', hint: 'Someone or something that went well' },
  { key: 'Problem with the CRM', icon: '🛠', hint: 'Something in the CRM that is confusing or not working' },
];
export const SUGGESTION_STATUSES = ['New', 'Reviewing', 'Done', 'Not possible'];
export const kindIcon = (k) => SUGGESTION_KINDS.find((x) => x.key === k)?.icon ?? '💡';
