/**
 * assignAdminClaim.js
 *
 * Admin-only script to set Firebase Custom Claims for a user.
 *
 * Usage:
 *   node server/assignAdminClaim.js <uid>
 *
 * Optional:
 *   node server/assignAdminClaim.js <uid> --revoke
 *
 * Credentials:
 *   - FIREBASE_SERVICE_ACCOUNT_JSON: JSON string of a service account
 *   - OR set GOOGLE_APPLICATION_CREDENTIALS to a service account file
 *   - OR run in GCP where Application Default Credentials are available
 */

'use strict';

const { initFirebaseAdmin } = require('./firebaseAdmin');

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.length < 1) return { uid: null, revoke: false };

  const revoke = args.includes('--revoke');
  const uid = args.find((a) => a && !a.startsWith('--'));

  return { uid, revoke };
}

async function main() {
  const { uid, revoke } = parseArgs(process.argv);

  if (!uid) {
    console.error('Missing UID.\nUsage: node server/assignAdminClaim.js <uid> [--revoke]');
    process.exit(1);
  }

  const admin = initFirebaseAdmin();

  try {
    const claims = revoke ? { admin: false } : { admin: true };

    await admin.auth().setCustomUserClaims(uid, claims);

    console.log(
      `[assignAdminClaim] ${revoke ? 'Revoked' : 'Granted'} admin claim for uid=${uid}`
    );
    console.log(
      '[assignAdminClaim] Next step (important): the client must refresh ID token to see changes: auth.currentUser.getIdToken(true)'
    );

    process.exit(0);
  } catch (err) {
    console.error('[assignAdminClaim] Failed to set custom user claims:', err);
    process.exit(2);
  }
}

main();

