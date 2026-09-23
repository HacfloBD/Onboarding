// "Completed by ..." / "Last updated by ..." / "Uploaded by ..." lines, shown
// to customers and admins alike. Names come from people_directory().
import { S } from './state.js';

export function fmtDay(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Who did it, in plain words. onBehalf adds "on behalf of your team".
export function actorPhrase(userId, onBehalf) {
  const d = S.directory[userId];
  if (onBehalf) return d && d.staff ? `FLO (${d.name}) on behalf of your team` : 'FLO on behalf of your team';
  if (!d) return userId ? 'a former user' : 'FLO';
  return d.staff ? `FLO (${d.name})` : d.name;
}

export function completedLine(step) {
  if (!step.done) return '';
  const when = fmtDay(step.completed_at);
  return `Completed by ${actorPhrase(step.completed_by, step.completed_on_behalf)}${when ? ', ' + when : ''}`;
}

export function formLine(row) {
  if (!row || !row.updated_by) return '';
  const when = fmtDay(row.updated_at);
  return `Last updated by ${actorPhrase(row.updated_by, row.last_edit_on_behalf)}${when ? ', ' + when : ''}`;
}

export function uploaderPhrase(u) {
  if (u.on_behalf) return 'FLO on behalf of your team';
  return actorPhrase(u.uploaded_by, false);
}
