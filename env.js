/*
  MathWithMDU runtime environment configuration.
  Loaded as a plain <script> BEFORE any ES modules on pages that need keys.

  In production, replace the values below (or override window.__ENV__ in a
  separate file loaded first). NEVER put secret keys here — only public
  keys (Paystack publishable key, reCAPTCHA site key) belong in the client.
*/
(function () {
  window.__ENV__ = window.__ENV__ || {};

  // Paystack PUBLIC key (pk_test_... or pk_live_...). Payments stay
  // disabled until this is filled in.
  window.__ENV__.PAYSTACK_KEY = window.__ENV__.PAYSTACK_KEY || '';

  // Google reCAPTCHA v3 site key (login + registration).
  window.__ENV__.recaptchaSiteKey =
    window.__ENV__.recaptchaSiteKey || '6LdvgSMtAAAAABQbM0SYGPbaowC7CUzI6Wbb6ICn';

  // Set to true only in development.
  window.__ENV__.IS_DEV = window.__ENV__.IS_DEV === true;
})();
