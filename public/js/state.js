// Shared in-memory state for the signed-in session. Nothing here is persisted
// in the browser; the database is the source of truth.
export const S = {
  user: null,          // { id, name, email, role, project_id }
  project: null,       // the open project row
  projects: [],        // admin: project_overview rows (active)
  phases: [],          // project_phases with .steps (project_steps), sorted by position
  forms: {},           // project_step_id -> form_responses row
  uploads: [],         // uploads rows for the open project
  people: {},          // user_id -> profile (whoever RLS lets us see)
  directory: {},       // user_id -> { name, staff } for attribution lines
  settings: {},        // app_settings key -> value
  open: new Set(),     // phase ids expanded in the accordion
  viewOpen: new Set(), // step ids with "View submitted info" expanded
  adminNew: false      // admin Project Setup is in "new project" mode
};

export const isAdmin = () => S.user && S.user.role === 'admin';

// Late-bound callbacks so modules can trigger each other without import cycles.
export const hooks = {
  render() {},
  reloadSettings() {},
  refreshPeople() {},
  reload() {},
  selectProject() {},
  goTab() {},
  adminGo() {}
};
