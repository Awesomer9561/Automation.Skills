---
repo: SupplierPortal.Automation
project: probuy
configured: 2026-10-10
---

# SupplierPortal.Automation overrides

Only what differs from or adds to `projects/_projects/probuy/rules.md`.

- Apps: `supplier` (default, `SUPPLIER_URL`), `company` (`COMPANY_URL`) and `admin` (`ADMIN_URL`), from `.env`.
- Local supplier portal: the commented `SUPPLIER_URL` localhost line in `.env`'s dev block (5173 or 5174, see the family rules).
- Credentials: one user per portal (see the family rules); supplier tests use `SUPPLIER_EMAIL` / `SUPPLIER_PASSWORD`.
- *Verified on dev, 2026-10-10:* the account then in `ADMIN_EMAIL` (replaced 2026-10-11) had **not** finished supplier registration on dev. Signing in
  lands on the "Register Your Company" wizard (`/auth`, `#register-cr-input`, `#auth-logout-btn`), not the dashboard.
  Dashboard or profile tests on dev need a registered and approved supplier account; ask the user for one.
- *Verified 2026-10-10:* the hosted dev build lags the local one. On hosted dev the wizard page has no
  `#auth-logout-btn` (only the language button), so a test asserting it passes on localhost:5173 and fails on hosted
  dev. Probe the build you will run against.
- *Verified on dev, 2026-10-10:* wizard order is `/auth` entity number -> OTP -> `/auth/register` basic details ->
  address -> `/auth/upload-documents`. On the documents page the file input `#register-docs-new-commercial-document-new-doc-upload-input`
  is hidden (wait on `#register-docs-new-commercial-document-new-doc-upload-btn`, then `upload` to the input); there is
  no terms checkbox; `#register-docs-submit-btn` ("Agree and Proceed") stays disabled until a file is uploaded.
  Submitting lands on `/dashboard` with "Account is in the verification process".
