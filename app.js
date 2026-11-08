import { auth } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js';

/*
  Home page entry point.
  Keep it minimal and safe because this runs on index.html only.
  Auth buttons (login/register/logout/admin) are wired by navbar.js.
*/

document.addEventListener('DOMContentLoaded', () => {

  const loginBtn = document.getElementById('loginBtn');
  const registerBtn = document.getElementById('registerBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const dashboardLinks = document.querySelectorAll('.dashboard-link');

  // Optional: elements may not exist on some pages.
  const safeSetHidden = (el, hidden) => {
    if (!el) return;
    el.classList.toggle('hidden', hidden);
  };

  onAuthStateChanged(auth, (user) => {
    const loggedIn = !!user;

    safeSetHidden(loginBtn, loggedIn);
    safeSetHidden(registerBtn, loggedIn);
    safeSetHidden(logoutBtn, !loggedIn);
    dashboardLinks.forEach(link => link.classList.toggle('hidden', !loggedIn));
  });
});

