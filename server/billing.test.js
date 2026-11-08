const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getCustomerEmail,
  getNextPaymentDate,
  getSubscriptionCode,
  isSuccessfulInvoice,
  resolvePlan
} = require('./billing');

test('resolves plans by Paystack plan code and verified amount', () => {
  assert.equal(resolvePlan({ plan: { plan_code: 'PLN_ew6b9ttywkz2n6c' } }), 'gold');
  assert.equal(resolvePlan({ amount: 35000 }), 'platinum');
  assert.equal(resolvePlan({ plan: { plan_code: 'PLN_unknown' }, amount: 40000 }), 'platinum_star');
  assert.equal(resolvePlan({ amount: 1 }), null);
});

test('reads subscription identity and customer details from supported event shapes', () => {
  const data = {
    subscription: {
      subscription_code: 'SUB_test',
      customer: { email: ' Learner@Example.com ' }
    }
  };
  assert.equal(getSubscriptionCode(data), 'SUB_test');
  assert.equal(getCustomerEmail(data), 'learner@example.com');
});

test('uses Paystack next payment dates without inventing a billing period', () => {
  assert.equal(
    getNextPaymentDate({ subscription: { next_payment_date: '2026-12-04T00:00:00.000Z' } }).toISOString(),
    '2026-12-04T00:00:00.000Z'
  );
  assert.equal(getNextPaymentDate({}), null);
  assert.equal(getNextPaymentDate({ next_payment_date: 'not-a-date' }), null);
});

test('only treats paid invoice updates as successful renewals', () => {
  assert.equal(isSuccessfulInvoice({ status: 'success' }), true);
  assert.equal(isSuccessfulInvoice({ status: 'paid' }), true);
  assert.equal(isSuccessfulInvoice({ status: 'failed' }), false);
});
