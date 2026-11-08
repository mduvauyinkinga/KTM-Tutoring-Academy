import { auth } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js';

const AUTH_REDIRECT_PATH = 'login.html';
const SESSION_KEY = 'mdu_auth_session';

/**
 * Minimal local marker for UX only (not security).
 * Real auth state is always derived from Firebase.
 */
export function setAuthSessionMarker(user) {
  try {
    const value = user
      ? { uid: user.uid, setAt: Date.now() }
      : { uid: null, setAt: Date.now() };
    localStorage.setItem(SESSION_KEY, JSON.stringify(value));
  } catch (_) {
    // ignore
  }
}

export function readAuthSessionMarker() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

/**
 * Route protection: if the user is not logged in, redirect to login.html.
 *
 * Usage:
 *   import { requireAuth } from './auth.js';
 *   requireAuth();
 */
export function requireAuth(options = {}) {
  const redirectTo = options.redirectTo || AUTH_REDIRECT_PATH;
  onAuthStateChanged(auth, (user) => {
    setAuthSessionMarker(user);

    if (!user) {
      window.location.href = redirectTo;
    }
  });
}

