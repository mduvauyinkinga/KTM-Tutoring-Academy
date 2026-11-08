# Paystack webhook implementation checklist

- [ ] Create backend Node/Express server in `server/`
  - [ ] Add `server/package.json`
  - [ ] Add Firebase Admin init (service account / env-based)
  - [ ] Add webhook route `POST /api/paystack/webhook`
  - [ ] Verify Paystack webhook signature using `PAYSTACK_SECRET_KEY`
  - [ ] Parse event + reference + customer + amount
  - [ ] Map amount/cents to plan (`gold`, `platinum`, `platinum_star`)
  - [ ] Update Firestore `users/{uid}` with verified payment data
  - [ ] Store `payments/{reference}` record for idempotency

- [ ] Update frontend `plans.js`
  - [ ] Generate/store `reference`
  - [ ] (Optional but recommended) write `orders/{reference}` pending record
  - [ ] Change Paystack callback to only show status (do NOT activate plan)

- [x] Update/verify Firestore rules (if needed)
  - [x] Webhook uses Firebase Admin SDK (privileged server credentials), which bypasses rules for server writes

- [x] Add local dev/test instructions
  - [x] How to run webhook locally
  - [x] How to test with Paystack test events (see README)


