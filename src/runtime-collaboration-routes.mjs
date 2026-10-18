// Diagnostic labels only: literal allowlisted routes, never caller-supplied IDs.
// These templates do not authorize or dispatch business requests.
const templates = [
  '/api/my-work', '/api/my-work/authorization',
  '/api/my-work/completed/:id/followups', '/api/my-work/completed/:id/followups/authorization',
  '/api/screening-import/preview', '/api/screening-import/authorization',
  '/api/screening-projects', '/api/screening-projects/context', '/api/screening-projects/authorization', '/api/screening-projects/:id',
  '/api/screening-batches/:id', '/api/screening-batches/:id/context', '/api/screening-batches/:id/authorization', '/api/screening-batches/:id/:version',
  '/api/screening-batch-work/:id/:version', '/api/screening-batch-work/:id/:version/authorization',
  '/api/screening-row-links/:id/:version/:row', '/api/screening-row-links/:id/:version/:row/context',
  '/api/screening-row-links/:id/:version/:row/authorization', '/api/screening-row-links/:id/:version/:row/customers',
  '/api/screening-registrations/:id/:version/:row', '/api/screening-registrations/:id/:version/:row/review',
  '/api/staff-handover/employees', '/api/staff-handover/employees/:id/responsibilities',
  '/api/staff-records/employees/:id', '/api/staff-records', '/api/staff-records/:id',
  '/api/staff-records/:id/versions', '/api/staff-records/:id/events',
  '/api/staff-cover/absence/:id', '/api/staff-cover/absence/:id/source', '/api/staff-cover/absence/:id/candidates',
  '/api/staff-cover', '/api/staff-cover/:id', '/api/staff-cover/:id/versions', '/api/staff-cover/:id/events'
];
const routes = templates.map(label => [new RegExp('^' + label.split('/').map(segment =>
  segment === ':row' ? '[0-9]+' : segment.startsWith(':') ? '[\\w-]+' : segment
).join('/') + '$'), label]);

export function collaborationRouteLabel(path) {
  for (const [pattern, label] of routes) if (pattern.test(path)) return label;
  return null;
}
