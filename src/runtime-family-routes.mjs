// Diagnostic labels only: fixed templates derived from the existing API handlers.
// They never authorize, dispatch or copy caller-supplied family/customer/version IDs.
const routes = [
  [/^\/api\/family-progress\/family-authorization$/, '/api/family-progress/:scope'],
  [/^\/api\/family-progress\/family(?:\/[\w-]+(?:\/(?:authorization|publications\/[\w-]+))?)?$/, '/api/family-progress/:scope'],
  [/^\/api\/family-progress\/customers\/[\w-]+(?:\/options)?$/, '/api/family-progress/:scope'],
  [/^\/api\/family-progress(?:\/[\w-]+(?:\/(?:versions|events))?)?$/, '/api/family-progress/:scope'],
  [/^\/api\/family-requests\/family\/[\w-]+(?:\/(?:context|authorization|[\w-]+(?:\/events)?))?$/, '/api/family-requests/:scope'],
  [/^\/api\/family-requests(?:\/[\w-]+(?:\/events)?)?$/, '/api/family-requests/:scope'],
  [/^\/api\/family-offers\/requests\/[\w-]+$/, '/api/family-offers/:scope'],
  [/^\/api\/family-offers\/family\/[\w-]+(?:\/authorization)?$/, '/api/family-offers/:scope'],
  [/^\/api\/family-offers\/customers\/[\w-]+(?:\/(?:options|source))?$/, '/api/family-offers/:scope'],
  [/^\/api\/family-offers\/selections\/[\w-]+(?:\/admit)?$/, '/api/family-offers/:scope'],
  [/^\/api\/family-offers(?:\/[\w-]+(?:\/(?:versions|events|select))?)?$/, '/api/family-offers/:scope'],
  [/^\/api\/family-bookings\/family\/[\w-]+(?:\/authorization)?$/, '/api/family-bookings/:scope'],
  [/^\/api\/family-bookings\/requests\/[\w-]+(?:\/options)?$/, '/api/family-bookings/:scope'],
  [/^\/api\/family-bookings(?:\/[\w-]+(?:\/(?:versions|events))?)?$/, '/api/family-bookings/:scope'],
  [/^\/api\/family-changes\/publications\/[\w-]+\/(?:options|context|request)$/, '/api/family-changes/:scope'],
  [/^\/api\/family-changes\/requests\/[\w-]+(?:\/(?:authorization|execute))?$/, '/api/family-changes/:scope'],
  [/^\/api\/family-communication\/context\/[\w-]+$/, '/api/family-communication/:scope'],
  [/^\/api\/family-communication\/(?:family|staff)\/[\w-]+\/[\w-]+(?:\/(?:authorization|information|actions(?:\/[\w-]+)?))?$/, '/api/family-communication/:scope'],
  [/^\/api\/family-notifications\/staff\/[\w-]+\/[\w-]+\/sources$/, '/api/family-notifications/:scope/sources'],
  [/^\/api\/family-notifications\/(?:family|staff)\/[\w-]+\/[\w-]+(?:\/[\w-]+(?:\/read\/[\w-]+)?)?$/, '/api/family-notifications/:scope'],
  [/^\/api\/family-training\/(?:practices|reports|reassessments)(?:\/[\w-]+(?:\/(?:versions|events|reports|reviews))?)?$/, '/api/family-training/:scope'],
  [/^\/api\/family-training\/customers\/[\w-]+\/options$/, '/api/family-training/:scope'],
  [/^\/api\/customers\/[\w-]+\/family-training$/, '/api/family-training/:scope']
];

export function familyRouteLabel(path) {
  for (const [pattern, label] of routes) if (pattern.test(path)) return label;
  return null;
}
