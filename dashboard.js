import { app, auth, db, storage } from './firebase.js';
import { 
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy,
  doc,
  getDoc
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import { showAlert, showLoading, hideLoading } from './utils.js'; // FIXED: Shared utils - removes local duplication
import { getBlob, ref } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-storage.js';


// Elements
const logoutBtn = document.getElementById('logoutBtn');
if (!logoutBtn) {
  console.warn('[MathWithMDU] dashboard logoutBtn missing - check dashboard.html');
}
const userInfo = document.getElementById('userInfo');
const planBadge = document.getElementById('planBadge');
const lessonsList = document.getElementById('lessonsList');
const papersList = document.getElementById('papersList');
const announcementsList = document.getElementById('announcementsList');
const loading = document.getElementById('loading');
const alertContainer = document.getElementById('alertContainer');

let currentUser = null;
let userPlan = 'trial';
const ADMIN_ROLE_LABEL = 'ADMIN';

function createDownloadLink(path, fileName, label) {
  const link = document.createElement('a');
  link.className = 'download-btn';
  link.href = '#';
  const icon = document.createElement('i');
  icon.className = 'fa-solid fa-file-arrow-down mdu-icon';
  icon.setAttribute('aria-hidden', 'true');
  link.append(icon, document.createTextNode(label));
  link.addEventListener('click', async (event) => {
    event.preventDefault();
    if (!fileName) {
      showAlert('This file is missing its storage reference. Contact support.', 'error');
      return;
    }

    link.setAttribute('aria-busy', 'true');
    try {
      const blob = await getBlob(ref(storage, `${path}/${fileName}`));
      const downloadUrl = URL.createObjectURL(blob);
      const temporaryLink = document.createElement('a');
      temporaryLink.href = downloadUrl;
      temporaryLink.download = fileName;
      temporaryLink.click();
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 60000);
    } catch (error) {
      console.error('[MathWithMDU] Content download failed:', error);
      showAlert('Could not download this file. Check your access and try again.', 'error');
    } finally {
      link.removeAttribute('aria-busy');
    }
  });
  return link;
}

// FIXED: Utils imported above - local functions removed
// Logout is handled centrally in navbar.js (shared across all pages).


// Load content
async function loadLessons() {
  try {
    let q;
    if (userPlan === 'trial') {
      // Fallback: try plan then isFree
      q = query(collection(db, 'lessons'), where('isFree', '==', true), orderBy('createdAt', 'desc'));
    } else {
      q = query(collection(db, 'lessons'), orderBy('createdAt', 'desc'));
    }
    const snapshot = await getDocs(q);
    lessonsList.innerHTML = '';

    if (snapshot.empty) {
      lessonsList.innerHTML = '<p class="lesson-item">No lessons available yet. Check back soon or upgrade your plan!</p>';
      return;
    }

    snapshot.forEach(doc => {
      const data = doc.data();
      const item = document.createElement('div');
      item.className = 'lesson-item';
      // FIX: Avoid innerHTML with untrusted Firestore data (XSS hardening)
      const titleEl = document.createElement('h4');
      titleEl.textContent = data.title || '';

      const metaEl = document.createElement('p');
      const details = [];
      if (data.grade) details.push(`Grade ${data.grade}`);
      if (data.term) details.push(`Term ${data.term}`);
      if (data.week) details.push(`Week ${data.week}`);
      if (data.topic) details.push(data.topic);
      if (details.length) {
        const strong = document.createElement('strong');
        strong.textContent = details.join(' | ');
        metaEl.appendChild(strong);
      }

      const descEl = document.createElement('p');
      descEl.textContent = data.description || '';

      const a = createDownloadLink('lessons', data.fileName, 'Download Lesson');

      item.append(titleEl, metaEl, descEl, a);
      lessonsList.appendChild(item);
    });
  } catch (error) {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    lessonsList.innerHTML = offline
      ? '<p class="lesson-item restricted">You appear to be offline. Showing cached lessons (if available) or retry when back online.</p>'
      : '<p class="lesson-item restricted">Error loading lessons. Try refreshing.</p>';
    console.error('Lessons error:', error);
  }
}

async function loadPapers() {
  try {
    let q;
    if (userPlan === 'trial') {
      q = query(collection(db, 'past_papers'), where('isFree', '==', true), orderBy('createdAt', 'desc'));
    } else {
      q = query(collection(db, 'past_papers'), orderBy('createdAt', 'desc'));
    }
    const snapshot = await getDocs(q);
    papersList.innerHTML = '';


    if (snapshot.empty) {
      papersList.innerHTML = '<p class="lesson-item">No past papers available yet. Check back soon!</p>';
      return;
    }

    snapshot.forEach(doc => {
      const data = doc.data();
      const item = document.createElement('div');
      item.className = 'lesson-item';
      // FIX: Avoid innerHTML with untrusted Firestore data (XSS hardening)
      const titleEl = document.createElement('h4');
      titleEl.textContent = data.title || '';

      const metaEl = document.createElement('p');
      const details = [];
      if (data.grade) details.push(`Grade ${data.grade}`);
      if (data.topic) details.push(data.topic);
      if (details.length) {
        const strong = document.createElement('strong');
        strong.textContent = details.join(' | ');
        metaEl.appendChild(strong);
      }

      const a = createDownloadLink('papers', data.fileName, 'Download Paper');

      item.append(titleEl, metaEl, a);
      papersList.appendChild(item);
    });
  } catch (error) {
    papersList.innerHTML = '<p class="lesson-item restricted">Error loading papers. Try refreshing.</p>';
    console.error('Papers error:', error);
  }
}

async function loadAnnouncements() {
  try {
    const q = query(collection(db, 'announcements'), orderBy('date', 'desc'));
    const snapshot = await getDocs(q);
    announcementsList.innerHTML = '';

    if (snapshot.empty) {
      announcementsList.innerHTML = '<p>No announcements yet. Check WhatsApp for updates!</p>';
      return;
    }

    snapshot.forEach(doc => {
      const data = doc.data();
      const item = document.createElement('div');
      item.className = 'lesson-item';
      // FIX: Avoid innerHTML with untrusted Firestore data (XSS hardening)
      const h4 = document.createElement('h4');
      h4.textContent = data.message || '';
      item.appendChild(h4);

      if (data.meetingLink) {
        const a = document.createElement('a');
        a.className = 'download-btn';
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.href = data.meetingLink;
        a.textContent = 'Join Meeting';
        item.appendChild(a);
      }

      announcementsList.appendChild(item);
    });
  } catch (error) {
    announcementsList.innerHTML = '<p>Error loading announcements.</p>';
    console.error('Announcements error:', error);
  }
}

// Auth listener
onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  showLoading();

  if (!user) {
    window.location.href = 'login.html';
    return;
  }

  if (!userInfo || !planBadge || !lessonsList || !papersList || !announcementsList) {
    hideLoading();
    showAlert('Dashboard failed to load (missing UI elements).', 'error');
    return;
  }


  // POPIA: if the stored consent checkbox is missing/unset, we do not block access,
  // but the Privacy Policy and POPIA pages provide accountability and rights.


  userInfo.textContent = `Hi, ${user.email}`;
  
  // Get user doc safely.
  // - If offline: may succeed from cache or may return missing snapshot.
  // - If network unavailable and cache miss: we must NOT crash; keep default.
  try {
    const userDocRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userDocRef);

    if (userSnap.exists()) {
      const profile = userSnap.data();
      const paidThrough = profile.paidAccessUntil?.toDate?.();
      const hasActivePaidAccess = profile.isPaid === true
        && paidThrough instanceof Date
        && paidThrough.getTime() > Date.now();
      userPlan = hasActivePaidAccess ? (profile.plan || 'trial') : 'trial';
    } else {
      // Cache miss or document truly missing.
      // Keep default 'trial'.
      // (Do not warn loudly; this is expected in offline scenarios.)
    }
  } catch (err) {
    const msg = String(err?.message || err || '');

    // Expected when browser is offline; keep quiet (still defaulting).
    if (msg.includes('client is offline') || msg.includes('offline')) {
      // Keep fallback userPlan = 'trial'
    } else {
      console.warn('[MathWithMDU] Failed to fetch user plan (defaulting):', err);
    }
  }



  planBadge.textContent = `Current Plan: ${userPlan.toUpperCase()}`;
  planBadge.style.background = userPlan === 'trial' ? '#fff3cd' : '#d4edda';

  // Admin label: custom claims live on the ID token, not the user object.
  try {
    const tokenResult = await user.getIdTokenResult(true);
    if (tokenResult?.claims?.admin === true) {
      planBadge.textContent += ` ${ADMIN_ROLE_LABEL}`;
      planBadge.style.background = '#d1ecf1';
    }
  } catch (_) {
    // Claim refresh is cosmetic only; never block the dashboard.
  }

  hideLoading();
  await Promise.all([
    loadLessons(),
    loadPapers(),
    loadAnnouncements()
  ]);
});
