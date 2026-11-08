import { auth, db } from './firebase.js';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js';
import { doc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import { getRecaptchaToken, showAlert, showLoading, hideLoading } from './utils.js';

const getEl = (id) => document.getElementById(id);

const registerForm = getEl('registerForm');
const nameEl = getEl('fullName');
const emailEl = getEl('email');
const passwordEl = getEl('password');
const confirmPasswordEl = getEl('confirmPassword');
const gradeEl = getEl('regGrade');
const privacyConsentEl = getEl('privacyConsent');
const submitBtn = getEl('registerSubmit');
let registrationInProgress = false;

function setProcessing(isProcessing) {
  if (submitBtn) submitBtn.disabled = isProcessing;
  if (nameEl) nameEl.disabled = isProcessing;
  if (emailEl) emailEl.disabled = isProcessing;
  if (passwordEl) passwordEl.disabled = isProcessing;
  if (confirmPasswordEl) confirmPasswordEl.disabled = isProcessing;
  if (gradeEl) gradeEl.disabled = isProcessing;
  if (privacyConsentEl) privacyConsentEl.disabled = isProcessing;

  if (isProcessing) showLoading('loading');
  else hideLoading('loading');
}

function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

async function handleRegister(e) {
  e.preventDefault();

  const name = nameEl?.value?.trim() || '';
  const email = emailEl?.value?.trim() || '';
  const password = passwordEl?.value || '';
  const confirmPassword = confirmPasswordEl?.value || '';
  const grade = gradeEl?.value || '';
  const privacyConsentAccepted = privacyConsentEl?.checked ?? false;

  // Validation
  if (!name) {
    showAlert('Full name is required.', 'error');
    return;
  }

  if (!email || !validateEmail(email)) {
    showAlert('Enter a valid email address.', 'error');
    return;
  }

  if (!grade) {
    showAlert('Please select your grade.', 'error');
    return;
  }

  if (!password) {
    showAlert('Password is required.', 'error');
    return;
  }

  const MIN_LEN = 8;
  if (password.length < MIN_LEN) {
    showAlert(`Password must be at least ${MIN_LEN} characters.`, 'error');
    return;
  }

  if (password.length > 72) {
    showAlert('Password is too long. Please use a shorter password.', 'error');
    return;
  }

  // Password confirmation validation
  if (!confirmPassword) {
    showAlert('Please confirm your password.', 'error');
    return;
  }

  if (password !== confirmPassword) {
    showAlert('Passwords do not match.', 'error');
    return;
  }

  // POPIA consent validation (keeps existing flow)
  if (!privacyConsentAccepted) {
    showAlert('Please confirm POPIA consent.', 'error');
    return;
  }

  try {
    setProcessing(true);

    // Generate the reCAPTCHA token and WAIT for it before creating the account.
    const recaptchaToken = await getRecaptchaToken('register');
    const recaptchaTokenEl = document.getElementById('recaptchaToken');
    if (recaptchaTokenEl) recaptchaTokenEl.value = recaptchaToken;

    const siteKey =
      (window.__ENV__ && window.__ENV__.recaptchaSiteKey) || window.RECAPTCHA_SITE_KEY || '';
    if (siteKey && !recaptchaToken) {
      showAlert('reCAPTCHA verification failed. Please try again.', 'error');
      return;
    }

    registrationInProgress = true;
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const uid = userCredential.user.uid;

    try {
      await setDoc(doc(db, 'users', uid), {
        name,
        email,
        grade,
        role: 'student',
        plan: 'trial',
        isPaid: false,
        trialUsed: false,
        privacyConsentAccepted,
        privacyConsentAcceptedAt: serverTimestamp(),
        createdAt: serverTimestamp()
      });
    } catch (profileError) {
      try {
        await deleteUser(userCredential.user);
      } catch (cleanupError) {
        console.error('[MathWithMDU] Could not roll back registration:', cleanupError);
        throw new Error('Your account was created, but profile setup failed. Contact support before signing in.');
      }
      throw profileError;
    }

    showAlert('Trial account created!', 'success');

    window.location.href = 'dashboard.html';
  } catch (err) {
    const msg = err?.message || 'Registration failed. Please try again.';
    showAlert(msg, 'error');
  } finally {
    registrationInProgress = false;
    setProcessing(false);
  }
}

function init() {
  if (!registerForm) {
    console.error('[MathWithMDU] registerForm missing');
    return;
  }

  registerForm.addEventListener('submit', handleRegister);

  // If already logged in, redirect away from register page
  onAuthStateChanged(auth, (user) => {
    if (user && !registrationInProgress) window.location.href = 'dashboard.html';
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
