import { auth, db } from './firebase.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';

// This file is loaded as an ES module on every page that needs the navbar.

function initNavbar() {
  // Support both older and newer navbar markup (only some pages contain both).
  const navLinks = document.querySelector('#navLinks');
  const menuToggle = document.querySelector('#menuToggle');

  if (menuToggle && navLinks) {
    menuToggle.addEventListener('click', () => navLinks.classList.toggle('active'));

    document.querySelectorAll('#navLinks a').forEach(link => {
      link.addEventListener('click', () => navLinks.classList.remove('active'));
    });
  } else {
    const hamburger = document.querySelector('.hamburger');
    const mobileMenu = document.querySelector('.mobile-menu');
    const menuOverlay = document.querySelector('.menu-overlay');

    if (hamburger && mobileMenu) {
      hamburger.addEventListener('click', () => {
        mobileMenu.classList.toggle('active');
        hamburger.classList.toggle('active');
        menuOverlay?.classList.toggle('active');
      });

      document.querySelectorAll('.mobile-menu a').forEach(link => {
        link.addEventListener('click', () => {
          mobileMenu.classList.remove('active');
          hamburger.classList.remove('active');
          menuOverlay?.classList.remove('active');
        });
      });

      menuOverlay?.addEventListener('click', () => {
        mobileMenu.classList.remove('active');
        hamburger.classList.remove('active');
        menuOverlay?.classList.remove('active');
      });
    }
  }

  initAuthControls();
  initSideAuth();
  initAuthListener();
  setActiveLink();
}

/*
 * Shared auth button behaviour.
 * The same navbar markup is used on every page, so Login / Register /
 * Logout / Admin are wired once here instead of per page.
 */
function initAuthControls() {
  const wire = (id, handler) => {
    const el = document.getElementById(id);
    if (!el || el.dataset.mduWired === '1') return;
    el.dataset.mduWired = '1';
    el.addEventListener('click', handler);
  };

  // Side auth toggle opens slide-in panel instead of navigating
  wire('sideAuthToggle', () => {
    const panel = document.querySelector('.side-auth-panel');
    const overlay = document.querySelector('.side-auth-overlay');
    const toggle = document.querySelector('.side-auth-toggle');
    if (!panel || !overlay || !toggle) return;
    panel.classList.toggle('open');
    overlay.classList.toggle('open');
    toggle.classList.toggle('active');
  });

  wire('loginBtn', () => { window.location.href = 'login.html'; });
  wire('registerBtn', () => { window.location.href = 'register.html'; });
  wire('adminBtn', () => { window.location.href = 'admin.html'; });
  wire('logoutBtn', () => {
    signOut(auth)
      .then(() => {
        window.location.href = 'index.html';
      })
      .catch(err => console.error('[MathWithMDU] logout error', err));
  });
}

function initAuthListener() {
  onAuthStateChanged(auth, async (user) => {
    const authSection = document.querySelector('#authSection');

    if (!user) {
      updateNavbarLoggedOut(authSection);
      return;
    }

    // Admin access is determined by the server-issued custom claim, not profile data.
    let role = 'user';
    let displayName = user.displayName || user.email || '';

    try {
      const tokenResult = await user.getIdTokenResult();
      role = tokenResult.claims.admin === true ? 'admin' : 'student';
    } catch (err) {
      console.warn('[MathWithMDU] Could not verify navbar role:', err);
    }

    try {
      const userRef = doc(db, 'users', user.uid);
      const snap = await getDoc(userRef);
      if (snap.exists()) displayName = snap.data().name || displayName;
    } catch (err) {
      const msg = String(err?.message || err || '');
      if (!msg.includes('client is offline') && !msg.includes('offline')) {
        console.warn('[MathWithMDU] Profile name fetch failed:', err);
      }
    }

    updateNavbarLoggedIn(authSection, displayName, role);
  });
}

function updateNavbarLoggedIn(authSection, name, role) {
  // If this page uses authSection placeholder, render there.
  if (authSection) {
    // Avoid string-based HTML injection for user-controlled values.
    authSection.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.className = 'user-info';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'glow-text';
    nameSpan.textContent = `👤 ${name ?? ''}`;

    const roleSpan = document.createElement('span');
    roleSpan.className = 'role-badge';
    roleSpan.textContent = String(role ?? 'user').toUpperCase();

    const logoutBtn = document.createElement('button');
    logoutBtn.id = 'logoutBtn';
    logoutBtn.className = 'nav-btn';
    logoutBtn.type = 'button';
    logoutBtn.textContent = 'Logout';

    logoutBtn.addEventListener('click', () => {
      signOut(auth)
        .then(() => {
          window.location.href = 'index.html';
        })
        .catch(err => console.error('[MathWithMDU] logout error', err));
    });

    wrap.append(nameSpan, roleSpan, logoutBtn);
    authSection.appendChild(wrap);
  }


  // Also support pages that have fixed buttons.
  document.querySelectorAll('#loginBtn').forEach(b => b.classList.add('hidden'));
  document.querySelectorAll('#registerBtn').forEach(b => b.classList.add('hidden'));
  document.querySelectorAll('#adminBtn').forEach(b => b.classList.toggle('hidden', role !== 'admin'));
  document.querySelectorAll('#logoutBtn').forEach(b => b.classList.remove('hidden'));
  document.querySelectorAll('.dashboard-link').forEach(b => b.classList.remove('hidden'));

  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = role === 'admin' ? 'block' : 'none';
  });
}


function updateNavbarLoggedOut(authSection) {
  if (authSection) {
    authSection.innerHTML = `
      <a href="login.html" class="nav-btn">Login</a>
      <a href="register.html" class="nav-btn highlight">Sign Up</a>
    `;
  }

  document.querySelectorAll('#loginBtn').forEach(b => b.classList.remove('hidden'));
  document.querySelectorAll('#registerBtn').forEach(b => b.classList.remove('hidden'));
  document.querySelectorAll('#adminBtn').forEach(b => b.classList.add('hidden'));
  document.querySelectorAll('#logoutBtn').forEach(b => b.classList.add('hidden'));
  document.querySelectorAll('.dashboard-link').forEach(b => b.classList.add('hidden'));

  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = 'none';
  });
}


function setActiveLink() {
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';

  document.querySelectorAll('a').forEach(a => {
    const href = a.getAttribute('href');
    if (!href) return;

    // Highlight only exact page matches.
    if (href === currentPage || (href === 'index.html' && currentPage === '')) {
      a.classList.add('active-link');
    }

    // If href contains anchors like index.html#home, also handle.
    if (href.startsWith('index.html') && currentPage === 'index.html') {
      // do not force active-link on every index anchor; dashboard.html does its own.
    }
  });
}

function escapeHtml(value) {
  // Correct HTML escaping (defense-in-depth).
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}




function initSideAuth() {
  const toggle = document.querySelector('.side-auth-toggle');
  const panel = document.querySelector('.side-auth-panel');
  const overlay = document.querySelector('.side-auth-overlay');
  const loginTab = document.querySelector('.side-auth-tab[data-tab="login"]');
  const registerTab = document.querySelector('.side-auth-tab[data-tab="register"]');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');

  if (!toggle || !panel || !overlay) return;

  // Toggle panel open/close
  toggle.addEventListener('click', () => {
    panel.classList.toggle('open');
    overlay.classList.toggle('open');
    toggle.classList.toggle('active');
  });

  // Close on overlay click
  overlay.addEventListener('click', () => {
    panel.classList.remove('open');
    overlay.classList.remove('open');
    toggle.classList.remove('active');
  });

  // Close on escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel.classList.contains('open')) {
      panel.classList.remove('open');
      overlay.classList.remove('open');
      toggle.classList.remove('active');
    }
  });

  // Tab switching
  if (loginTab) {
    loginTab.addEventListener('click', () => {
      document.querySelectorAll('.side-auth-tab').forEach(t => t.classList.remove('active'));
      loginTab.classList.add('active');
      if (loginForm) loginForm.style.display = 'block';
      if (registerForm) registerForm.style.display = 'none';
    });
  }
  if (registerTab) {
    registerTab.addEventListener('click', () => {
      document.querySelectorAll('.side-auth-tab').forEach(t => t.classList.remove('active'));
      registerTab.classList.add('active');
      if (registerForm) registerForm.style.display = 'block';
      if (loginForm) loginForm.style.display = 'none';
    });
  }
}

document.addEventListener('DOMContentLoaded', initNavbar);
