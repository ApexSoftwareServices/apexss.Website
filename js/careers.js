// Careers configuration. Edit this file to open or close positions; no other change is needed.

// Applications are emailed to this address with the résumé attached.
//
// A web page cannot send an email with an attachment by itself, so the form posts to FormSubmit
// (formsubmit.co), a relay that forwards the answers and the uploaded file to the address below.
// - The first application ever submitted makes FormSubmit send a one-time activation link to this
//   address. Click it once; from then on every application arrives as an email with the résumé attached.
// - After activation FormSubmit also sends a random-looking alias. Paste it here in place of the
//   address to keep the address out of the page source.
// - Files are limited to 10 MB in total per application.
// Leave APPLY_TO empty to fall back to opening the applicant's own email app instead.
export const APPLY_TO = 'info@apexss.com';
export const APPLY_ENDPOINT = APPLY_TO ? `https://formsubmit.co/${APPLY_TO}` : '';

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
