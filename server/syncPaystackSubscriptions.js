const crypto = require('crypto');
const { initFirebaseAdmin } = require('./firebaseAdmin');
const {
  getCustomerEmail,
  getNextPaymentDate,
  getSubscriptionCode,
  resolvePlan
} = require('./billing');

const PAYSTACK_API = 'https://api.paystack.co';
const PAGE_SIZE = 100;
const CURRENT_STATUSES = new Set(['active', 'non-renewing', 'attention', 'cancelled']);

async function fetchSubscriptions(secretKey) {
  const subscriptions = [];
  let page = 1;

  while (page <= 1000) {
    const response = await fetch(
      `${PAYSTACK_API}/subscription?perPage=${PAGE_SIZE}&page=${page}`,
      { headers: { Authorization: `Bearer ${secretKey}` } }
    );
    const result = await response.json();
    if (!response.ok || result.status !== true || !Array.isArray(result.data)) {
      throw new Error(`Paystack subscription listing failed on page ${page}.`);
    }

    subscriptions.push(...result.data);
    const pageCount = Number(result.meta?.pageCount || result.meta?.page_count || 0);
    if ((pageCount && page >= pageCount) || result.data.length < PAGE_SIZE) break;
    page += 1;
  }

  if (page > 1000) {
    throw new Error('Subscription listing exceeded the 1000-page safety limit.');
  }
  return subscriptions;
}

function providerStatus(status) {
  if (status === 'active') return 'active';
  if (status === 'attention') return 'past_due';
  return 'cancelled';
}

async function main() {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) throw new Error('Set PAYSTACK_SECRET_KEY before running this migration.');

  const admin = initFirebaseAdmin();
  const db = admin.firestore();
  const [usersSnapshot, subscriptions] = await Promise.all([
    db.collection('users').where('isPaid', '==', true).get(),
    fetchSubscriptions(secretKey)
  ]);

  const usersByEmail = new Map();
  const missingEmailUsers = [];
  for (const userDoc of usersSnapshot.docs) {
    const email = String(userDoc.data().email || '').trim().toLowerCase();
    if (!email) {
      missingEmailUsers.push(userDoc.id);
      continue;
    }
    const matches = usersByEmail.get(email) || [];
    matches.push(userDoc);
    usersByEmail.set(email, matches);
  }

  const subscriptionsByEmail = new Map();
  for (const subscription of subscriptions) {
    const email = getCustomerEmail(subscription);
    const status = String(subscription.status || '').toLowerCase();
    const paidThrough = getNextPaymentDate(subscription);
    const subscriptionCode = getSubscriptionCode(subscription);
    const plan = resolvePlan(subscription);

    if (!email || !CURRENT_STATUSES.has(status) || !paidThrough || !subscriptionCode || !plan) {
      continue;
    }
    const matches = subscriptionsByEmail.get(email) || [];
    matches.push({ subscription, status, paidThrough, subscriptionCode, plan });
    subscriptionsByEmail.set(email, matches);
  }

  const updates = [];
  const unresolved = [...missingEmailUsers];
  for (const [email, matchingUsers] of usersByEmail) {
    if (matchingUsers.length !== 1) {
      unresolved.push(...matchingUsers.map(user => user.id));
      continue;
    }

    const userDoc = matchingUsers[0];
    const matches = subscriptionsByEmail.get(email) || [];
    if (matches.length !== 1) {
      unresolved.push(userDoc.id);
      continue;
    }

    const match = matches[0];
    updates.push({
      ref: userDoc.ref,
      subscriptionRef: db.collection('paystackSubscriptions').doc(
        crypto.createHash('sha256').update(match.subscriptionCode).digest('hex')
      ),
      email,
      subscriptionCode: match.subscriptionCode,
      fields: {
        plan: match.plan,
        isPaid: true,
        paidAccessUntil: admin.firestore.Timestamp.fromDate(match.paidThrough),
        paystackSubscriptionCode: match.subscriptionCode,
        subscriptionStatus: providerStatus(match.status),
        subscriptionUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
      }
    });
  }

  const apply = process.argv.includes('--apply');
  console.log(`Paid user profiles: ${usersSnapshot.size}`);
  console.log(`Unambiguous Paystack matches: ${updates.length}`);
  console.log(`Profiles requiring manual review: ${unresolved.length}`);

  if (unresolved.length) {
    console.error(`Profiles requiring review: ${unresolved.join(', ')}`);
    console.error('No profile changes were applied. Resolve every profile and run the migration again.');
    process.exitCode = 1;
    return;
  }

  if (!apply) {
    console.log('Dry run only. Re-run with --apply to write matched subscription access dates.');
  } else {
    for (let offset = 0; offset < updates.length; offset += 250) {
      const batch = db.batch();
      for (const update of updates.slice(offset, offset + 250)) {
        batch.set(update.ref, update.fields, { merge: true });
        batch.set(update.subscriptionRef, {
          subscriptionCode: update.subscriptionCode,
          uid: update.ref.id,
          email: update.email,
          plan: update.fields.plan,
          status: update.fields.subscriptionStatus,
          paidAccessUntil: update.fields.paidAccessUntil,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      }
      await batch.commit();
    }
    console.log(`Updated ${updates.length} user profiles.`);
  }

}

main().catch((error) => {
  console.error('Paystack subscription migration failed:', error);
  process.exitCode = 1;
});
