const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const { initFirebaseAdmin } = require('./firebaseAdmin');
const {
  getCustomerEmail,
  getNextPaymentDate,
  getSubscriptionCode,
  isSuccessfulInvoice,
  resolvePlan
} = require('./billing');

const admin = initFirebaseAdmin();
const app = express();
const HANDLED_EVENTS = new Set([
  'charge.success',
  'subscription.create',
  'subscription.disable',
  'invoice.update',
  'invoice.payment_failed'
]);

app.use(cors());

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function toSubscriptionRef(db, subscriptionCode) {
  return db.collection('paystackSubscriptions').doc(sha256(subscriptionCode));
}

async function findUserId(db, subscriptionRef, email) {
  if (subscriptionRef) {
    const subscriptionSnap = await subscriptionRef.get();
    if (subscriptionSnap.exists && subscriptionSnap.data().uid) {
      return subscriptionSnap.data().uid;
    }
  }

  if (!email) return null;

  try {
    const authUser = await admin.auth().getUserByEmail(email);
    return authUser.uid;
  } catch (error) {
    if (error.code === 'auth/user-not-found') return null;
    throw error;
  }
}

function createWebhookError(message) {
  const error = new Error(message);
  error.isWebhookValidationError = true;
  return error;
}

app.post('/api/paystack/webhook', express.raw({ type: '*/*' }), async (req, res) => {
  const paystackSecret = process.env.PAYSTACK_SECRET_KEY;
  if (!paystackSecret) {
    console.error('[Paystack] PAYSTACK_SECRET_KEY is not configured.');
    return res.status(500).send('Webhook configuration error');
  }

  const signature = req.headers['x-paystack-signature'];
  if (typeof signature !== 'string') {
    return res.status(400).send('Missing x-paystack-signature');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
  const expected = crypto
    .createHmac('sha512', paystackSecret)
    .update(rawBody)
    .digest();
  const received = Buffer.from(signature, 'hex');
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
    return res.status(400).send('Invalid signature');
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch (error) {
    console.error('[Paystack] Invalid JSON payload:', error);
    return res.status(400).send('Invalid payload');
  }

  const event = payload.event;
  const data = payload.data;
  if (typeof event !== 'string' || !data || typeof data !== 'object') {
    return res.status(400).send('Invalid payload');
  }
  if (!HANDLED_EVENTS.has(event)) {
    return res.status(200).send('Event ignored');
  }
  if (event === 'invoice.update' && !isSuccessfulInvoice(data)) {
    return res.status(200).send('Invoice update ignored');
  }

  const subscriptionCode = getSubscriptionCode(data);
  const subscriptionRef = subscriptionCode
    ? toSubscriptionRef(admin.firestore(), subscriptionCode)
    : null;
  const nextPaymentDate = getNextPaymentDate(data);
  const plan = resolvePlan(data);
  const email = getCustomerEmail(data);
  const mustActivate = event === 'subscription.create' || event === 'invoice.update';

  if (mustActivate && (!subscriptionCode || !plan || !nextPaymentDate)) {
    console.error('[Paystack] Subscription event missing required plan, code, or next payment date.', {
      event,
      hasSubscriptionCode: Boolean(subscriptionCode),
      hasPlan: Boolean(plan),
      hasNextPaymentDate: Boolean(nextPaymentDate)
    });
    return res.status(500).send('Incomplete subscription event');
  }

  if (event === 'subscription.disable' && !subscriptionCode) {
    console.error('[Paystack] Subscription disable event missing subscription code.');
    return res.status(500).send('Incomplete subscription event');
  }
  if (event === 'invoice.payment_failed' && !subscriptionCode) {
    console.error('[Paystack] Failed invoice event missing subscription code.');
    return res.status(500).send('Incomplete subscription event');
  }
  if (event === 'charge.success' && !data.reference) {
    return res.status(400).send('Missing payment reference');
  }

  const db = admin.firestore();
  let uid;
  try {
    uid = await findUserId(db, subscriptionRef, email);
  } catch (error) {
    console.error('[Paystack] Could not resolve customer account:', error);
    return res.status(500).send('Could not resolve customer account');
  }
  if (!uid) {
    console.error('[Paystack] No MathWithMDU account found for a subscription event.', {
      event,
      hasEmail: Boolean(email),
      hasSubscriptionCode: Boolean(subscriptionCode)
    });
    return res.status(500).send('Customer account not found');
  }

  const eventId = sha256(rawBody);
  const eventRef = db.collection('webhookEvents').doc(eventId);
  const userRef = db.collection('users').doc(uid);
  const paymentReference = event === 'charge.success' ? data.reference : null;
  const paymentRef = paymentReference
    ? db.collection('payments').doc(sha256(String(paymentReference)))
    : null;
  const profileTimestamp = nextPaymentDate
    ? admin.firestore.Timestamp.fromDate(nextPaymentDate)
    : null;

  try {
    const result = await db.runTransaction(async (transaction) => {
      const eventSnap = await transaction.get(eventRef);
      if (eventSnap.exists) return 'duplicate';

      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists) {
        throw createWebhookError('Customer profile not found.');
      }

      const subscriptionSnap = subscriptionRef
        ? await transaction.get(subscriptionRef)
        : null;
      const paymentSnap = paymentRef
        ? await transaction.get(paymentRef)
        : null;

      if (subscriptionSnap?.exists && subscriptionSnap.data().uid !== uid) {
        throw createWebhookError('Subscription customer mapping changed during processing.');
      }

      if (paymentSnap?.exists) {
        transaction.set(eventRef, {
          event,
          status: 'duplicate_payment',
          processedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return 'duplicate';
      }

      const userData = userSnap.data();
      const storedSubscriptionCode = userData.paystackSubscriptionCode;
      const isCurrentSubscription = !storedSubscriptionCode
        || storedSubscriptionCode === subscriptionCode;
      const subscriptionWasCancelled = subscriptionSnap?.exists
        && subscriptionSnap.data().status === 'cancelled';
      let eventStatus = 'processed';

      if (
        subscriptionWasCancelled
        && ['subscription.create', 'invoice.update', 'charge.success'].includes(event)
      ) {
        eventStatus = 'stale_subscription_event';
        if (paymentRef) {
          transaction.set(paymentRef, {
            reference: String(paymentReference),
            event,
            amount: data.amount ?? null,
            customerEmail: email,
            uid,
            status: eventStatus,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
      } else if (event === 'subscription.create' || event === 'invoice.update') {
        const existingPaidThrough = userData.paidAccessUntil?.toDate?.();
        const existingAccessIsCurrent = existingPaidThrough
          && existingPaidThrough.getTime() > Date.now();
        const hasDifferentActiveSubscription = storedSubscriptionCode
          && storedSubscriptionCode !== subscriptionCode
          && existingAccessIsCurrent
          && ['active', 'past_due'].includes(userData.subscriptionStatus);

        if (hasDifferentActiveSubscription) {
          eventStatus = 'multiple_subscriptions_review_required';
        } else {
          transaction.set(userRef, {
            plan,
            isPaid: true,
            trialUsed: true,
            paidAccessUntil: profileTimestamp,
            paystackSubscriptionCode: subscriptionCode,
            subscriptionStatus: 'active',
            paidAt: admin.firestore.FieldValue.serverTimestamp(),
            lastPaymentEvent: event,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        }

        transaction.set(subscriptionRef, {
          subscriptionCode,
          uid,
          email: email || userData.email || null,
          plan,
          status: eventStatus === 'processed' ? 'active' : 'review_required',
          paidAccessUntil: profileTimestamp,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      } else if (event === 'charge.success') {
        if (paymentRef) {
          transaction.set(paymentRef, {
            reference: String(paymentReference),
            event,
            amount: data.amount ?? null,
            customerEmail: email,
            uid,
            status: subscriptionCode && plan && profileTimestamp && isCurrentSubscription
              ? 'processed'
              : 'awaiting_subscription_period_or_review',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }

        if (subscriptionCode && plan && profileTimestamp && isCurrentSubscription) {
          transaction.set(userRef, {
            plan,
            isPaid: true,
            trialUsed: true,
            paidAccessUntil: profileTimestamp,
            paystackSubscriptionCode: subscriptionCode,
            subscriptionStatus: 'active',
            paidAt: admin.firestore.FieldValue.serverTimestamp(),
            lastPaymentEvent: event,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
          transaction.set(subscriptionRef, {
            subscriptionCode,
            uid,
            email: email || userData.email || null,
            plan,
            status: 'active',
            paidAccessUntil: profileTimestamp,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        } else {
          eventStatus = 'awaiting_subscription_period';
        }
      } else if (event === 'subscription.disable' || event === 'invoice.payment_failed') {
        const subscriptionStatus = event === 'subscription.disable' ? 'cancelled' : 'past_due';
        const subscriptionData = {
          subscriptionCode,
          uid,
          email: email || userData.email || null,
          status: subscriptionStatus,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        if (subscriptionSnap?.exists) {
          Object.assign(subscriptionData, {
            plan: subscriptionSnap.data().plan || userData.plan || null,
            paidAccessUntil: subscriptionSnap.data().paidAccessUntil || userData.paidAccessUntil || null
          });
        } else if (userData.paidAccessUntil) {
          subscriptionData.paidAccessUntil = userData.paidAccessUntil;
          subscriptionData.plan = userData.plan || null;
        }
        transaction.set(subscriptionRef, subscriptionData, { merge: true });

        if (isCurrentSubscription) {
          transaction.set(userRef, {
            paystackSubscriptionCode: subscriptionCode,
            subscriptionStatus,
            subscriptionUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        } else {
          eventStatus = 'stale_subscription_event';
        }
      }

      transaction.set(eventRef, {
        event,
        status: eventStatus,
        uid,
        subscriptionCode,
        processedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return eventStatus;
    });

    return res.status(200).send(result === 'duplicate' ? 'Already processed' : 'Webhook processed');
  } catch (error) {
    if (error.isWebhookValidationError) {
      console.error('[Paystack] Subscription event could not be applied:', error.message);
    } else {
      console.error('[Paystack] Webhook processing failed:', error);
    }
    return res.status(500).send('Webhook processing failed');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Webhook server listening on port ${PORT}`);
});
