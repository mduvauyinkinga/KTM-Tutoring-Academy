# Deployment Guide — MathWithMDU

Status after security/readiness audit and fixes (see checklist at bottom).

## Architecture recap
- **Frontend:** static HTML + ES modules, Firebase (Auth/Firestore/Storage) via gstatic CDN.
- **Backend:** `server/index.js` — Paystack webhook (HMAC-SHA512 verified, idempotent).
- **Config:** `env.js` exposes `window.__ENV__` (public keys only) and must load **before** module scripts.

## One-time setup

### 1. Environment keys (`env.js`)
- [ ] Set `window.__ENV__.PAYSTACK_KEY` to your Paystack **publishable** key (`pk_test_...` / `pk_live_...`).
      Until this is set, payment buttons intentionally stay disabled.
- [ ] reCAPTCHA site key is already set (`recaptchaSiteKey`). Rotate if the key was ever exposed.

### 2. Firebase project (`mathwithmdu`)
```bash
npm i -g firebase-tools
firebase login
```
Do not deploy the Firestore or Storage rules until after completing the webhook and hosting
deployment steps below and running the migrations in step 5.

### 3. Admin claim
```powershell
$env:FIREBASE_SERVICE_ACCOUNT_JSON = Get-Content -Raw 'C:\path\to\service-account.json'
node server\assignAdminClaim.js <admin-uid>
```
Admin UI now **disables upload buttons** until the custom claim verifies.

### 4. Webhook server
```powershell
cd server
npm install        # creates package-lock.json (commit it)
$env:PAYSTACK_SECRET_KEY = 'sk_...'
$env:FIREBASE_SERVICE_ACCOUNT_JSON = Get-Content -Raw 'C:\path\to\service-account.json'
npm start
```
- [ ] Host on an HTTPS endpoint (Cloud Run / Render / Railway).
- [ ] In Paystack dashboard set webhook URL: `https://<your-domain>/api/paystack/webhook`
- [ ] Enable `charge.success`, `subscription.create`, `subscription.disable`, `invoice.update`,
      and `invoice.payment_failed` webhook events.
- [ ] Confirm the Storage bucket's CORS allowlist includes the deployed website origin so the
      authenticated browser downloads work.
- [ ] Test with Paystack test events before going live.

### 5. Hosting
Configure the Storage bucket's CORS allowlist for the deployed website origin before enabling
authenticated browser downloads.

```bash
node scripts/build-legal-pages.mjs
firebase deploy --only hosting
```
The build command renders the public legal pages from the shared shell and content sources in
`legal-pages/`. Run it after editing those sources and before deployment.
`firebase.json` already configures security headers (CSP, X-Frame-Options, nosniff,
Referrer-Policy, Permissions-Policy) and excludes `server/`, `magic-mcp/`, `*.md`.

Before deploying the new paid-access rules, reconcile existing accounts and content:
```powershell
cd server
npm install
$env:PAYSTACK_SECRET_KEY = 'sk_...'
$env:FIREBASE_STORAGE_BUCKET = 'mathwithmdu.firebasestorage.app'
$env:FIREBASE_SERVICE_ACCOUNT_JSON = Get-Content -Raw 'C:\path\to\service-account.json'
node syncPaystackSubscriptions.js
node syncPaystackSubscriptions.js --apply
node migrateProtectedContent.js
node migrateProtectedContent.js --apply
cd ..
firebase deploy --only firestore:rules,firestore:indexes,storage
```
Set `PAYSTACK_SECRET_KEY`, `FIREBASE_STORAGE_BUCKET`, and Firebase Admin credentials in the
PowerShell environment before running these commands. Each script's first command is a dry run.
Review the counts and resolve every unmatched record before applying changes or deploying the
rules. Subscription migration does not guess an expiry date. Content migration removes old
Firebase download tokens and stored `fileURL` values so files can only be downloaded through
authenticated Storage rules; existing shared download links will stop working after migration.
- [ ] Deploy `firestore.rules` only after all paid users have a verified period or manual review.
- [ ] Deploy `storage.rules` after every content object has been migrated.
- [ ] Deploy `firestore.indexes.json` (required for trial dashboard queries).

### 6. Version control
```bash
git init
git add .
git commit -m "Initial deploy-ready commit"
```
`.gitignore` excludes secrets, node_modules, and magic-mcp.

### 7. Assets (manual — no network in dev environment)
- [ ] Replace `assets/vendor/font-awesome/all.min.css` (currently a **placeholder**)
      with the real Font Awesome bundle + `assets/vendor/webfonts/`, or switch to a CDN link.
- [ ] Resize `assets/logo - blu-ish.png` (1.4 MB) and `assets/logo - white.png` (1.2 MB)
      to ≤ 50 KB favicon/app-icon sizes.

## Pre-launch smoke test
- [ ] Register → account created with `plan: trial`, consent timestamp stored.
- [ ] Login works (reCAPTCHA token generated on submit, no page reload).
- [ ] Admin claim user: upload lesson + past paper → appears on dashboard.
- [ ] Trial user sees only `isFree: true` content; paid user sees all.
- [ ] Non-admin cannot write to Firestore/Storage (rules enforced).
- [ ] Test-card payment → webhook activates plan → dashboard shows new plan.
- [ ] Replayed webhook returns "Already processed" (idempotency).
- [ ] Offline load shows cached/fallback content without crashing (see TODO.md).

## Known follow-ups
- [ ] Server-side reCAPTCHA token verification (currently client-only; consider
      Firebase App Check for stronger bot protection).
- [ ] Webhook idempotency has a small check-then-write race; wrap in a Firestore
      transaction if duplicate concurrent deliveries become an issue.
- [ ] Complete TODO.md offline-persistence tasks (Step 5 of performance audit too).
