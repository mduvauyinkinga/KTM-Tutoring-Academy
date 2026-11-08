import { auth, db } from './firebase.js';
import { showAlert } from './utils.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';

import {
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js';

const payBtns = document.querySelectorAll('.payBtn');
const loginBtn = document.getElementById('loginBtn');
const registerBtn = document.getElementById('registerBtn');
const logoutBtn = document.getElementById('logoutBtn');
const dashboardLinks = document.querySelectorAll('.dashboard-link');
const trialBtn = document.getElementById('trialBtn');
const billingNotice = document.getElementById('billingNotice');

// Paystack public key must not be hardcoded.
// Expect it from page/env injection: window.__ENV__.PAYSTACK_KEY
const PAYSTACK_KEY = (typeof window !== 'undefined' &&
  window.__ENV__ && window.__ENV__.PAYSTACK_KEY)
  ? window.__ENV__.PAYSTACK_KEY
  : '';

if (!PAYSTACK_KEY) {
  console.warn('[MathWithMDU] PAYSTACK_KEY missing. Payments will be disabled.');
}

let currentUser = null;
let billingAccessConflict = false;
let billingStatusUnavailable = false;

/*
|--------------------------------------------------------------------------
| PAYSTACK PLAN CODES
|--------------------------------------------------------------------------
*/

const PLAN_CODES = {
  gold: 'PLN_ew6b9ttywkz2n6c',
  platinum: 'PLN_kl0jwr0130gnfm8',
  platinum_star: 'PLN_24up6xyun66xpd2'
};

/*
|--------------------------------------------------------------------------
| AUTH STATE
|--------------------------------------------------------------------------
*/

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  billingAccessConflict = false;
  billingStatusUnavailable = false;

  if (user) {
    payBtns.forEach(btn => {
      btn.disabled = true;
    });
    loginBtn.classList.add('hidden');
    registerBtn.classList.add('hidden');

    logoutBtn.classList.remove('hidden');
    dashboardLinks.forEach(link => link.classList.remove('hidden'));

    trialBtn.textContent = 'Trial Active';
    trialBtn.disabled = true;

    if (billingNotice) {
      billingNotice.textContent = 'Checking your subscription status...';
      billingNotice.hidden = false;
    }

    try {
      const profileSnap = await getDoc(doc(db, 'users', user.uid));
      if (currentUser?.uid !== user.uid) return;
      if (!profileSnap.exists()) {
        throw new Error('Your account profile is missing.');
      }

      const profile = profileSnap.data();
      const paidThrough = profile.paidAccessUntil?.toDate?.();
      const paidPeriodActive = profile.isPaid === true
        && paidThrough instanceof Date
        && paidThrough.getTime() > Date.now();
      const subscriptionStatus = profile.subscriptionStatus;
      billingAccessConflict = paidPeriodActive
        || subscriptionStatus === 'active'
        || subscriptionStatus === 'past_due'
        || (profile.isPaid === true && !paidThrough);

      if (billingNotice) {
        billingNotice.textContent = billingAccessConflict
          ? 'You already have a current or unresolved subscription. Contact us on WhatsApp to change plans or manage renewal before starting another subscription.'
          : '';
        billingNotice.hidden = !billingAccessConflict;
      }
      payBtns.forEach(btn => {
        btn.disabled = billingAccessConflict;
      });
    } catch (error) {
      if (currentUser?.uid !== user.uid) return;
      billingStatusUnavailable = true;
      payBtns.forEach(btn => {
        btn.disabled = true;
      });
      if (billingNotice) {
        billingNotice.textContent = 'We could not verify your subscription status. Refresh the page or contact support before purchasing.';
        billingNotice.hidden = false;
      }
      console.error('[MathWithMDU] Could not verify billing status:', error);
    }

  } else {
    loginBtn.classList.remove('hidden');
    registerBtn.classList.remove('hidden');

    logoutBtn.classList.add('hidden');
    dashboardLinks.forEach(link => link.classList.add('hidden'));

    trialBtn.textContent = 'Start Trial (Register)';
    trialBtn.disabled = false;
    // Trial starts via registration when logged out.
    trialBtn.addEventListener('click', () => {
      window.location.href = 'register.html';
    }, { once: true });

    payBtns.forEach(btn => {
      btn.disabled = true;
    });
    if (billingNotice) {
      billingNotice.textContent = '';
      billingNotice.hidden = true;
    }
  }
});

/*
|--------------------------------------------------------------------------
| LOGOUT is handled centrally in navbar.js (shared across all pages).
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| PAYSTACK PAYMENT
|--------------------------------------------------------------------------
*/

const inFlight = new Map();

payBtns.forEach((btn) => {
  btn.addEventListener('click', (e) => {
    // Prevent double click / duplicate iframes.
    if (inFlight.get(btn)) return;

    /*
    |--------------------------------------------------------------------------
    | CHECK LOGIN
    |--------------------------------------------------------------------------
    */
    if (!currentUser) {
      showAlert('Please login before purchasing a plan.', 'error');
      setTimeout(() => {
        window.location.href = 'login.html';
      }, 1500);
      return;
    }

    if (billingStatusUnavailable) {
      showAlert('We could not verify your current subscription. Please refresh or contact support before purchasing.', 'error');
      return;
    }
    if (billingAccessConflict) {
      showAlert('You already have a current or unresolved subscription. Contact us to manage it before purchasing another plan.', 'error');
      return;
    }

    // Lock UI immediately.
    inFlight.set(btn, true);
    btn.disabled = true;

    const done = () => {
      inFlight.set(btn, false);
      // Keep disabled for the remainder of the flow; re-enable after failures.
      btn.disabled = false;
    };

    /*
    |--------------------------------------------------------------------------
    | GET PLAN DATA
    |--------------------------------------------------------------------------
    */
    const target = e.currentTarget;
    const plan = target?.dataset?.plan;
    const amountRaw = target?.dataset?.amount;
    const amount = Number.parseInt(amountRaw, 10);

    /*
    |--------------------------------------------------------------------------
    | GET PAYSTACK PLAN CODE
    |--------------------------------------------------------------------------
    */
    const planCode = plan ? PLAN_CODES[plan] : null;

    if (!planCode) {
      showAlert('Invalid subscription plan selected.', 'error');
      done();
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      showAlert('Invalid payment amount. Please refresh and try again.', 'error');
      done();
      return;
    }

    /*
    |--------------------------------------------------------------------------
    | CHECK PAYSTACK
    |--------------------------------------------------------------------------
    */
    if (!window.PaystackPop || typeof window.PaystackPop.setup !== 'function') {
      showAlert('Paystack failed to load. Refresh and try again.', 'error');
      done();
      return;
    }

    /*
    |--------------------------------------------------------------------------
    | START PAYMENT
    |--------------------------------------------------------------------------
    */
    let handler;
    try {
      handler = window.PaystackPop.setup({
        key: PAYSTACK_KEY,
        email: currentUser.email,
        amount: amount,
        currency: 'ZAR',

        // Link Paystack subscription plan here.
        plan: planCode,
        ref: 'mathwithmdu_' + Date.now(),

        metadata: {
          custom_fields: [
            {
              display_name: 'Plan',
              variable_name: 'plan',
              value: plan
            }
          ]
        },

        callback: function (response) {
          const ref = response?.reference;
          // Optional: log payment success in dev only.
          if (typeof window !== 'undefined' && window?.__ENV__?.IS_DEV) {
            console.log('Payment successful:', response);
          }

          showAlert(

            `Payment successful! Reference: ${ref || 'N/A'}. Activating your subscription...`,
            'success'
          );

          // Avoid re-enabling in success; redirect soon.
          inFlight.delete(btn);
          btn.disabled = false;

          setTimeout(() => {
            window.location.href = 'dashboard.html';
          }, 2500);
        },

        onClose: function () {
          showAlert('Payment cancelled or not completed.', 'error');
          done();
        }
      });
    } catch (err) {
      console.error('Paystack setup error:', err);
      showAlert('Could not initialize payment. Please try again.', 'error');
      done();
      return;
    }

    /*
    |--------------------------------------------------------------------------
    | OPEN PAYSTACK
    |--------------------------------------------------------------------------
    */
    try {
      handler.openIframe();
    } catch (err) {
      console.error('Paystack openIframe error:', err);
      showAlert('Could not open Paystack payment window. Please try again.', 'error');
      done();
    }
  });
});
