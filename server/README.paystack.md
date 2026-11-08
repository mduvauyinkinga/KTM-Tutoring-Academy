# Paystack Webhook Server (Express + Firebase Admin)

## What it does
- Exposes `POST /api/paystack/webhook`
- Verifies Paystack webhook signature (`x-paystack-signature`)
- Activates or renews access only through Paystack subscription events with a provider-supplied
  `next_payment_date`
- Preserves access through the paid-through date after cancellation or failed renewal
- Enforces paid-through expiry in Firestore security rules
- Uses `webhookEvents/{payload-hash}` and `payments/{reference-hash}` for idempotency

## Setup
1. Install deps:
```bash
cd server
npm install
```

2. Environment variables:
- `PAYSTACK_SECRET_KEY` (Paystack secret key)

Firebase Admin credentials (choose one):
- `FIREBASE_SERVICE_ACCOUNT_JSON` (JSON string of service account) **recommended**
- `PAYSTACK_SECRET_KEY` (required by the webhook and the one-time migration)
- `FIREBASE_STORAGE_BUCKET` (required by protected-content migration)

Optional:
- `PORT` (default 3000)

## Run locally
```bash
cd server
npm start
```
Then point Paystack webhook URL to your HTTPS endpoint (e.g., via ngrok).

## Important notes
- Webhook endpoint must be reachable via HTTPS.
- Never activate plans in the frontend callback; Firestore updates happen only via webhook.
- Supported events: `charge.success`, `subscription.create`, `subscription.disable`,
  `invoice.update`, and `invoice.payment_failed`. Enable all five in the Paystack dashboard.
- The webhook uses Paystack's `next_payment_date`; it never calculates a billing period itself.
- Plan mapping is in `server/billing.js`:
  - 25000 => gold
  - 35000 => platinum
  - 40000 => platinum_star

## Existing paid accounts
Before deploying the new Firestore rules, reconcile existing paid user profiles with Paystack:
```bash
cd server
node syncPaystackSubscriptions.js
node syncPaystackSubscriptions.js --apply
```
The first command is a dry run. The script updates only accounts with one unambiguous Paystack
subscription and a provider-supplied next payment date. Resolve every unmatched or ambiguous paid
account manually before deploying the rules; the script deliberately does not invent an expiry.

## Existing downloadable content
Run the protected-content migration before deploying `storage.rules`:
```bash
node migrateProtectedContent.js
node migrateProtectedContent.js --apply
```
The script marks each object as free/paid-only, revokes Firebase download tokens, and removes
stored `fileURL` values. Existing token URLs stop working, so deploy the updated dashboard before
applying this migration. Configure bucket CORS for the website origin for SDK-based downloads.

## Billing behavior
- `subscription.disable` marks future renewals cancelled but keeps access until the recorded date.
- `invoice.payment_failed` marks the subscription past due but grants no extra time.
- Firestore rules deny paid content once `paidAccessUntil` is at or before server request time.
- A missing provider date on an activation/renewal event is logged and returns HTTP 500 for retry.
- Subscription lifecycle fields are server-written; clients cannot extend their own paid access.
