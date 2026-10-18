// Diagnostic labels only: fixed templates derived from the existing late-stage handlers.
// They never authorize, dispatch or copy caller-supplied record, customer or version IDs.
const routes = [
  [/^\/api\/(?:specialty\/(?:protocols|cases|consents)(?:\/[\w-]+(?:\/(?:versions|events|consents))?)?|specialty\/customers\/[\w-]+\/options|customers\/[\w-]+\/specialty-work)$/, '/api/professional/:scope'],
  [/^\/api\/(?:specialty-care(?:\/[\w-]+(?:\/(?:versions|events))?)?|retail\/orders\/[\w-]+\/specialty-care)$/, '/api/professional/:scope'],
  [/^\/api\/(?:specialty-continuity\/(?:cases\/[\w-]+|plans\/[\w-]+(?:\/events)?)|specialty-archives(?:\/[\w-]+)?)$/, '/api/professional/:scope'],
  [/^\/api\/(?:specialty-reviews(?:\/[\w-]+(?:\/(?:versions|events|links))?)?|retail\/orders\/[\w-]+\/specialty-reviews)$/, '/api/professional/:scope'],
  [/^\/api\/(?:specialty-orders|specialty-lots\/[\w-]+(?:\/versions)?|retail\/orders\/[\w-]+\/specialty-trace(?:\/(?:approvals|lots))?)$/, '/api/professional/:scope'],
  [/^\/api\/(?:referrals\/(?:records|cases)(?:\/[\w-]+(?:\/(?:versions|events|contacts))?)?|referrals\/customers\/[\w-]+\/options|customers\/[\w-]+\/referral-work)$/, '/api/professional/:scope'],
  [/^\/api\/(?:contacts\/(?:consents|cases|appointments|attempts)(?:\/[\w-]+(?:\/(?:events|attempts|receipts|appointments))?)?|contacts\/customers\/[\w-]+\/options|customers\/[\w-]+\/contact-work)$/, '/api/professional/:scope'],
  [/^\/api\/(?:longitudinal\/(?:cases|observations|plans)(?:\/[\w-]+(?:\/(?:versions|events|observations|plans))?)?|longitudinal\/customers\/[\w-]+\/options|customers\/[\w-]+\/longitudinal)$/, '/api/professional/:scope'],

  [/^\/api\/(?:suppliers|purchases)(?:\/[\w-]+(?:\/(?:versions|events))?)?$/, '/api/procurement/:scope'],
  [/^\/api\/procurement\/options$/, '/api/procurement/:scope'],
  [/^\/api\/(?:purchase-receipts(?:\/[\w-]+(?:\/(?:versions|events))?)?|purchases\/[\w-]+\/receipts)$/, '/api/procurement/:scope'],
  [/^\/api\/(?:purchase-quality(?:\/[\w-]+(?:\/(?:versions|events))?)?|purchase-receipts\/[\w-]+\/quality)$/, '/api/procurement/:scope'],
  [/^\/api\/(?:supplier-returns(?:\/[\w-]+(?:\/(?:versions|events|handoffs))?)?|purchase-quality\/[\w-]+\/supplier-returns|supplier-return-handoffs\/[\w-]+\/receipts)$/, '/api/procurement/:scope'],
  [/^\/api\/(?:purchase-extra-returns(?:\/[\w-]+(?:\/(?:versions|events|handoffs))?)?|purchase-receipts\/[\w-]+\/extra-returns|purchase-extra-handoffs\/[\w-]+\/receipts)$/, '/api/procurement/:scope'],

  [/^\/api\/(?:inventory-custody(?:\/[\w-]+(?:\/(?:observations|events))?)?|purchase-receipts\/[\w-]+\/custody)$/, '/api/inventory-trace/:scope'],
  [/^\/api\/(?:inventory-reserved(?:\/[\w-]+(?:\/(?:observations|events))?)?|inventory\/reservations\/[\w-]+\/lines\/\d+\/(?:custody|batch-sources))$/, '/api/inventory-trace/:scope'],
  [/^\/api\/(?:inventory\/products\/[\w-]+\/(?:sources|batch-sources)|inventory\/outbounds\/[\w-]+\/batches|purchase-receipts\/[\w-]+\/delivered-batches)$/, '/api/inventory-trace/:scope'],
  [/^\/api\/(?:dispatch\/receipts|fulfillment\/events\/[\w-]+\/dispatch)$/, '/api/inventory-trace/:scope'],

  [/^\/api\/expenses(?:\/context|\/[\w-]+(?:\/(?:versions|events|payments))?)?$/, '/api/financial-review/:scope'],
  [/^\/api\/money-review(?:\/(?:receive|void|refund)\/[\w-]+)?$/, '/api/financial-review/:scope'],
  [/^\/api\/channel-review(?:\/source\/(?:receive|void|refund)\/[\w-]+|\/[\w-]+(?:\/(?:versions|events))?)?$/, '/api/financial-review/:scope']
];

export function lateRouteLabel(path) {
  for (const [pattern, label] of routes) if (pattern.test(path)) return label;
  return null;
}
