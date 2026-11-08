# Performance Audit Plan (HTML + JS)

## Information Gathered
- Reviewed all HTML files currently present in repo root: `index.html, dashboard.html, login.html, register.html, plans.html, admin.html, contact.html, privacy.html, terms.html, popia.html, admin-old.html`.
- Reviewed JS files: `dashboard.js, login.js, register.js, navbar.js, theme.js, app.js, firebase.js, plans.js, utils.js, admin.js, auth.js`.
- Notes:
  - `search_files` is unavailable due to missing ripgrep binary in this environment.

## Findings (Performance Hindrances)
1) **reCAPTCHA duplication / extra work**
   - `login.html` and `register.html` run reCAPTCHA on page load and on submit.
   - Both also load external reCAPTCHA script.

2) **Multiple Firebase listeners & extra Firestore reads**
   - `navbar.js`, `dashboard.js`, and `admin.js` each call `onAuthStateChanged` and fetch user docs.

3) **theme.js uses document-wide click listener**
   - Adds a listener on every click; can be attached directly to `#themeToggle`.

4) **dashboard.js uses `innerHTML` for meta line construction**
   - Converts Firestore fields into HTML string (forces HTML parsing). Prefer DOM/text nodes.

5) **console logging in production**
   - `app.js` logs on home load; `plans.js` logs payment response.

## Plan (Code Update at File Level)
### Step 1 — Fix reCAPTCHA execution timing
- **Files:** `login.html`, `register.html`
- Change inline reCAPTCHA bootstrap so it:
  - does NOT call `execute()` on `DOMContentLoaded`.
  - calls `execute()` only when the form is submitted.
  - keeps existing `submit` handler.

### Step 2 — Reduce unnecessary click handling in theme toggle
- **Files:** `theme.js`
- Replace `document.addEventListener('click', ...)` with:
  - `document.getElementById('themeToggle')?.addEventListener('click', ...)`

### Step 3 — Remove innerHTML HTML parsing in dashboard rows
- **Files:** `dashboard.js`
- Replace:
  - `metaEl.innerHTML = 
      `<strong>Grade ...` 
    with DOM nodes (`strong` + text nodes).

### Step 4 — Remove noisy console logs
- **Files:** `app.js`, `plans.js`
- Remove/guard `console.log` statements used for debugging.

### Step 5 (Optional, larger) — Centralize auth/user fetch
- **Files:** `navbar.js`, `dashboard.js`, `admin.js`
- Create a single shared module (e.g., `authProfile.js`) that:
  - listens to `onAuthStateChanged` once,
  - fetches the user document once,
  - caches it for other modules.

## Dependent Files to be edited
- `login.html`
- `register.html`
- `theme.js`
- `dashboard.js`
- `app.js`
- `plans.js`
- (Optional) new shared auth module for Step 5

## Followup Steps
- Run a quick manual verification:
  - Load `login.html` → confirm reCAPTCHA runs only when submitting.
  - Load `register.html` → confirm same.
  - Load `dashboard.html` → confirm lists still render.
  - Toggle theme → confirm works.

## Completion Tracking
- [x] Step 1 (reCAPTCHA on submit only)
- [x] Step 2 (theme toggle listener binding)
- [x] Step 3 (dashboard meta innerHTML removal)
- [x] Step 4 (remove console logs)
- [ ] Step 5 (optional auth centralization)


