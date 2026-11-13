// Careers configuration. Edit this file to open or close positions; no other change is needed.

// Where applications are sent. The form includes a résumé upload, so it needs a form endpoint
// that accepts multipart/form-data POSTs (a form service or your own API). While this is empty,
// the form falls back to opening the applicant's email app and asks them to attach the résumé.
export const APPLY_ENDPOINT = '';

// status: 'open' shows the role with an Apply button; 'filled' lists it as closed.
// Optional for open roles: summary (one or two sentences), type and location.
export const JOBS = [
  { title: 'Senior Full Stack .NET Developer', team: 'Engineering', status: 'filled' },
  { title: 'React Developer', team: 'Engineering', status: 'filled' },
  { title: 'AI Engineer', team: 'AI & Hardware', status: 'filled' },
  { title: 'QA Engineer', team: 'Engineering', status: 'filled' },
  { title: 'Designer', team: 'Apex Studio', status: 'filled' },
  // Example of an open role:
  // { title: 'Senior Full Stack .NET Developer', team: 'Engineering', status: 'open',
  //   type: 'Full-time', location: 'Chicago, IL or remote', summary: 'Build and ship client products end to end.' },
];
