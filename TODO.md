# TODO - Firestore Offline Persistence Fix

- [x] Update `firebase.js` to enable Firestore offline persistence using `enableIndexedDbPersistence(db)` with a single guarded init and proper error handling (`failed-precondition`, `unimplemented`).

- [ ] Update `dashboard.js`:
  - [ ] Make `getDoc` for `users/{uid}` safe: never crash offline; fallback to default `trial`.
  - [ ] Make list reads (`getDocs`) offline-friendly: show cached-miss messaging instead of generic refresh errors.
- [ ] Smoke test on localhost:
  - [ ] Online load works.
  - [ ] Toggle offline mode after initial load: app should show cached content or safe fallbacks without throwing.
  - [ ] Open multiple tabs to ensure persistence enable doesn’t break initialization.

