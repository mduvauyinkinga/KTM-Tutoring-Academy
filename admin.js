import { auth, db, storage } from './firebase.js';

import {
  ref,
  uploadBytes
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-storage.js';

import {
  collection,
  addDoc,
  serverTimestamp,
  doc,
  getDoc
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';

import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js';

import { showAlert, showLoading, hideLoading } from './utils.js';


// =======================
// TAB SWITCHING
// =======================
const lessonSection = document.getElementById('lessonSection');
const paperSection = document.getElementById('paperSection');

document.getElementById('tabLessons').onclick = () => {
  lessonSection.style.display = 'block';
  paperSection.style.display = 'none';
};

document.getElementById('tabPapers').onclick = () => {
  lessonSection.style.display = 'none';
  paperSection.style.display = 'block';
};


// =======================
// ADMIN SECURITY (FIXED)
// =======================
// Upload handlers stay disabled until the admin custom claim is verified.
let adminVerified = false;

const uploadLessonBtn = document.getElementById('uploadLessonBtn');
const uploadPaperBtn = document.getElementById('uploadPaperBtn');
if (uploadLessonBtn) uploadLessonBtn.disabled = true;
if (uploadPaperBtn) uploadPaperBtn.disabled = true;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = 'login.html';
    return;
  }

  // =======================
  // ADMIN AUTHZ (CUSTOM CLAIM)
  // =======================
  try {
    // Important: force-refresh the ID token so custom claims take effect immediately.
    await auth.currentUser.getIdToken(true);

    const tokenResult = await auth.currentUser.getIdTokenResult(true);
    const isAdmin = tokenResult?.claims?.admin === true;

    if (!isAdmin) {
      showAlert('Access denied: Admins only', 'error');
      window.location.href = 'index.html';
      return;
    }

    adminVerified = true;
    if (uploadLessonBtn) uploadLessonBtn.disabled = false;
    if (uploadPaperBtn) uploadPaperBtn.disabled = false;
  } catch (err) {
    console.error('[MathWithMDU] Admin verification failed:', err);
    showAlert('Admin verification failed. Please re-login.', 'error');
  }
});

function requireVerifiedAdmin() {
  if (!adminVerified) {
    showAlert('Admin access not verified yet.', 'error');
    return false;
  }
  return true;
}


// =======================
// HELPER: FILE NAME
// =======================
function createFileName(file) {
  const timestamp = Date.now();
  const safeName = file.name.replace(/\s/g, '_');
  return `${timestamp}_${safeName}`;
}


// =======================
// UPLOAD LESSON
// =======================
document.getElementById('uploadLessonBtn').onclick = async () => {
  if (!requireVerifiedAdmin()) return;

  const title = document.getElementById('lessonTitle').value;
  const grade = document.getElementById('lessonGrade').value;
  const isFree = document.getElementById('lessonFree')?.checked ?? false;
  const file = document.getElementById('lessonFile').files[0];

  if (!title || !grade || !file) {
    return showAlert('Fill all lesson fields', 'error');
  }

  try {
    showLoading('loading');

    const fileName = createFileName(file);
    const storageRef = ref(storage, `lessons/${fileName}`);

    await uploadBytes(storageRef, file, {
      customMetadata: { isFree: String(isFree) }
    });

    await addDoc(collection(db, 'lessons'), {
      title,
      grade,
      isFree,
      fileName,
      createdAt: serverTimestamp()
    });

    showAlert('Lesson uploaded successfully!', 'success');

  } catch (err) {
    showAlert(err.message, 'error');
  } finally {
    hideLoading('loading');
  }
};


// =======================
// UPLOAD PAPER
// =======================
document.getElementById('uploadPaperBtn').onclick = async () => {
  if (!requireVerifiedAdmin()) return;

  const title = document.getElementById('paperTitle').value;
  const grade = document.getElementById('paperGrade').value;
  const isFree = document.getElementById('paperFree')?.checked ?? false;
  const file = document.getElementById('paperFile').files[0];

  if (!title || !grade || !file) {
    return showAlert('Fill all paper fields', 'error');
  }

  try {
    showLoading('loading');

    const fileName = createFileName(file);
    const storageRef = ref(storage, `papers/${fileName}`);

    await uploadBytes(storageRef, file, {
      customMetadata: { isFree: String(isFree) }
    });

    await addDoc(collection(db, 'past_papers'), {
      title,
      grade,
      isFree,
      fileName,
      createdAt: serverTimestamp()
    });

    showAlert('Paper uploaded successfully!', 'success');

  } catch (err) {
    showAlert(err.message, 'error');
  } finally {
    hideLoading('loading');
  }
};