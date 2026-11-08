import { auth } from './firebase.js';
import { signInWithEmailAndPassword, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js';
import { getRecaptchaToken, showAlert, showLoading, hideLoading } from './utils.js';

const getEl = (id) => document.getElementById(id);

const loginForm = getEl('loginForm');
const emailEl = getEl('loginEmail');
const passwordEl = getEl('loginPassword');
const submitBtn = getEl('loginSubmit');
const loadingOverlay = getEl('loading');

function setProcessing(isProcessing) {
  if (submitBtn) submitBtn.disabled = isProcessing;
  if (emailEl) emailEl.disabled = isProcessing;
  if (passwordEl) passwordEl.disabled = isProcessing;

  // If your utils showLoading/hideLoading rely on #loading, we still keep consistent behavior.
  if (isProcessing) showLoading('loading');
  else hideLoading('loading');
}

function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

async function handleLogin(e) {
  // Always prevent native submission first (otherwise a failed check
  // reloads the page before validation runs).
  e.preventDefault();

  const email = emailEl?.value?.trim() || '';
  const password = passwordEl?.value || '';

  // Client-side validation
  if (!email) {
    showAlert('Email is required.', 'error');
    return;
  }
  if (!validateEmail(email)) {
    showAlert('Enter a valid email address.', 'error');
    return;
  }
  if (!password) {
    showAlert('Password is required.', 'error');
    return;
  }

  try {
    setProcessing(true);

    // Generate the reCAPTCHA token and WAIT for it before submitting.
    const recaptchaToken = await getRecaptchaToken('login');
    const recaptchaTokenEl = document.getElementById('recaptchaToken');
    if (recaptchaTokenEl) recaptchaTokenEl.value = recaptchaToken;

    // Only block when a site key IS configured but no token was produced.
    const siteKey =
      (window.__ENV__ && window.__ENV__.recaptchaSiteKey) || window.RECAPTCHA_SITE_KEY || '';
    if (siteKey && !recaptchaToken) {
      showAlert('reCAPTCHA verification failed. Please try again.', 'error');
      return;
    }

    await signInWithEmailAndPassword(auth, email, password);

    showAlert('Login successful!', 'success');

    // Redirect after successful login
    window.location.href = 'dashboard.html';
  } catch (err) {
    const msg = err?.message || 'Login failed. Please try again.';
    showAlert(msg, 'error');
  } finally {
    setProcessing(false);
  }
}

function init() {
  if (!loginForm) {
    console.error('[MathWithMDU] loginForm missing');
    return;
  }

  loginForm.addEventListener('submit', handleLogin);

  // If already logged in, redirect away from login page
  onAuthStateChanged(auth, (user) => {
    if (user) window.location.href = 'dashboard.html';
  });

  // Clear loading overlay reference (optional)
  if (loadingOverlay) loadingOverlay.classList.add('hidden');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
