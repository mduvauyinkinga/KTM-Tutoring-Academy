import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-storage.js';

/* =========================
   FIREBASE CONFIG (SAFE)
   =========================
   Priority:
   1. window.__ENV__.firebaseConfig (recommended for production)
   2. fallback local config (dev only)
*/

const firebaseConfig =
  (typeof window !== 'undefined' &&
    window.__ENV__ &&
    window.__ENV__.firebaseConfig)
    ? window.__ENV__.firebaseConfig
    : {
        apiKey: 'AIzaSyDJyh2rEHrp461pdUCVapZ81-YWyv9di38',
        authDomain: 'mathwithmdu.firebaseapp.com',
        projectId: 'mathwithmdu',
        storageBucket: 'mathwithmdu.firebasestorage.app',
        messagingSenderId: '23891407297',
        appId: '1:23891407297:web:c19e0b87025c3f51c0bf40',
        measurementId: 'G-0414TYTBRK'
      };

if (!firebaseConfig || !firebaseConfig.apiKey) {
  console.error('[MathWithMDU] Firebase config missing or invalid.');
}

/* =========================
   INIT FIREBASE APP
   ========================= */

export const app = initializeApp(firebaseConfig);

/* =========================
   SERVICES
   ========================= */

export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});
export const storage = getStorage(app);
