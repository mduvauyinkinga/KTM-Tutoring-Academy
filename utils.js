// Shared utilities for MathWithMDU - prevents duplication
// FIXED: Centralized alert/loading/modals - removes 4x duplicate showAlert functions

// DOM helper - assumes alertContainer ID exists or falls back to body
export function showAlert(message, type = 'success', containerId = 'alertContainer') {
  const container = document.getElementById(containerId) || document.body;
  const alert = document.createElement('div');
  alert.className = `alert alert-${type}`;
  alert.textContent = message; // FIXED: textContent prevents XSS
  container.appendChild(alert);
  setTimeout(() => {
    if (alert.parentNode) alert.remove();
  }, 5000);
  return alert; // Return for manual dismiss if needed
}

// Loading spinner toggle
export function showLoading(loadingId = 'loading') {
  const loading = document.getElementById(loadingId);
  if (loading) loading.classList.remove('hidden');
}

export function hideLoading(loadingId = 'loading') {
  const loading = document.getElementById(loadingId);
  if (loading) loading.classList.add('hidden');
}

let recaptchaScriptPromise;

async function loadRecaptcha(siteKey) {
  if (window.grecaptcha?.execute) return;

  if (!recaptchaScriptPromise) {
    recaptchaScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timeout = setTimeout(() => {
        script.removeEventListener('load', onLoad);
        script.removeEventListener('error', onError);
        script.remove();
        reject(new Error('reCAPTCHA failed to load.'));
      }, 10000);
      const onLoad = () => {
        clearTimeout(timeout);
        resolve();
      };
      const onError = () => {
        clearTimeout(timeout);
        script.remove();
        reject(new Error('reCAPTCHA failed to load.'));
      };

      script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
      script.async = true;
      script.addEventListener('load', onLoad, { once: true });
      script.addEventListener('error', onError, { once: true });
      document.head.appendChild(script);
    });
  }

  try {
    await recaptchaScriptPromise;
  } catch (error) {
    recaptchaScriptPromise = undefined;
    throw error;
  }
}

export async function getRecaptchaToken(action) {
  const siteKey =
    (window.__ENV__ && window.__ENV__.recaptchaSiteKey) ||
    window.RECAPTCHA_SITE_KEY ||
    '';
  if (!siteKey) return '';

  await loadRecaptcha(siteKey);
  if (!window.grecaptcha?.execute || !window.grecaptcha?.ready) {
    throw new Error('reCAPTCHA is unavailable. Please try again.');
  }

  return new Promise((resolve, reject) => {
    window.grecaptcha.ready(() => {
      window.grecaptcha.execute(siteKey, { action }).then(resolve).catch(reject);
    });
  });
}

// Modal helpers (app.js only)
export function showModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('hidden');
}

export function hideModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('hidden');
}
