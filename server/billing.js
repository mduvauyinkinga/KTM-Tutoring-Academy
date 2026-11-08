const PLAN_CODES = Object.freeze({
  gold: 'PLN_ew6b9ttywkz2n6c',
  platinum: 'PLN_kl0jwr0130gnfm8',
  platinum_star: 'PLN_24up6xyun66xpd2'
});

const PLAN_AMOUNTS = Object.freeze({
  25000: 'gold',
  35000: 'platinum',
  40000: 'platinum_star'
});

const PLAN_BY_CODE = Object.freeze(
  Object.fromEntries(Object.entries(PLAN_CODES).map(([name, code]) => [code, name]))
);

function getSubscription(data = {}) {
  return data.subscription && typeof data.subscription === 'object'
    ? data.subscription
    : {};
}

function getPlan(data = {}) {
  const subscription = getSubscription(data);
  const invoiceSubscription = data.invoice?.subscription;
  return data.plan || subscription.plan || invoiceSubscription?.plan || data.plan_object || {};
}

function resolvePlan(data = {}) {
  const plan = getPlan(data);
  const planCode = typeof plan === 'string'
    ? plan
    : plan.plan_code || plan.code || data.plan_code;
  if (PLAN_BY_CODE[planCode]) return PLAN_BY_CODE[planCode];

  const amount = Number(data.amount ?? plan.amount ?? getSubscription(data).amount);
  return PLAN_AMOUNTS[amount] || null;
}

function getCustomerEmail(data = {}) {
  const subscription = getSubscription(data);
  const invoiceSubscription = data.invoice?.subscription;
  const email = data.customer?.email
    || data.customer_email
    || subscription.customer?.email
    || invoiceSubscription?.customer?.email
    || data.invoice?.customer?.email;
  return typeof email === 'string' ? email.trim().toLowerCase() : null;
}

function getSubscriptionCode(data = {}) {
  const subscription = getSubscription(data);
  const invoiceSubscription = data.invoice?.subscription;
  const code = data.subscription_code
    || subscription.subscription_code
    || invoiceSubscription?.subscription_code;
  return typeof code === 'string' && code.trim() ? code.trim() : null;
}

function parsePaystackDate(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getNextPaymentDate(data = {}) {
  const subscription = getSubscription(data);
  const invoiceSubscription = data.invoice?.subscription;
  const candidates = [
    data.next_payment_date,
    subscription.next_payment_date,
    invoiceSubscription?.next_payment_date,
    data.invoice?.next_payment_date
  ];

  for (const candidate of candidates) {
    const date = parsePaystackDate(candidate);
    if (date) return date;
  }
  return null;
}

function isSuccessfulInvoice(data = {}) {
  const status = String(data.status || data.invoice?.status || '').toLowerCase();
  return status === 'success' || status === 'paid';
}

module.exports = {
  PLAN_CODES,
  getCustomerEmail,
  getNextPaymentDate,
  getSubscriptionCode,
  isSuccessfulInvoice,
  resolvePlan
};
