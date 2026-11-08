const admin = require('firebase-admin');

function initFirebaseAdmin() {
  if (admin.apps.length) return admin;

  // Option A: GOOGLE_APPLICATION_CREDENTIALS env var points to a service account JSON file
  // Option B: FIREBASE_SERVICE_ACCOUNT_JSON contains the JSON content (safer for some deploys)
  // Option C: Use default credentials when running in GCP.

  const svcJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (svcJson) {
    const parsed = JSON.parse(svcJson);
    admin.initializeApp({
      credential: admin.credential.cert(parsed),
    });
    return admin;
  }

  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
  return admin;
}

module.exports = { initFirebaseAdmin };

