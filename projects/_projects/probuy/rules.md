---
project: probuy
configured: 2026-10-10
repos: SupplierPortal.Automation, CompanyPortal.Automation (playwright-automation), AdminPortal.Automation
---

# ProBuy automation rules

Shared by every ProBuy automation repo (`.crossrepo.json` `"project": "probuy"`). A repo's own
`projects/<repo-folder>/rules.md` overrides anything here. Lines marked *verified* were proven by a probe or run on
the date given; everything else is a convention.

## Locators
- Element **ids only**. ProBuy apps never use `data-testid`; do not ask for or add one.
- An element the test needs that has no id is a product gap: report it to the user (with the page and element) instead of
  falling back to text or CSS. Text targets (`"..."`, `/regex/`) are for assertions and waits on messages only.
- English UI for now. Steps may hold English text; keep locale-specific text out of ids so Arabic can be added later.

## Environments
- **dev is the source of truth** for page knowledge and the default; `qa` exists too.
- Each repo has one `.env` with a dev block and a commented-out qa block (`TEST_ENV` plus the portal URLs, e.g.
  `SUPPLIER_URL`, `COMPANY_URL`); exactly one block is uncommented. No per-env files, no host tables in code.
- Local portals (Vite) run against dev's backend and dev's Keycloak: swap the app's URL line in the dev block for the
  commented localhost one (e.g. `SUPPLIER_URL=http://localhost:5173`); `TEST_ENV` stays `dev`.

## Identity (Keycloak, one realm per portal, e.g. `Supplier-Dev`)
- *Verified on dev, supplier, 2026-10-10:* the portal root (`/`) redirects to the Keycloak login page:
  `#login-username-input`, `#login-password-input`, `#login-submit-btn`, sign-up link `#login-sign-up-link`.
  The sign-up form: `#register-first-name-input`, `-last-name-`, `-email-`, `-password-`, `-password-confirm-input`,
  `#register-submit-btn`.
- Start sign-in and sign-up at the portal root, not `/signin`: Keycloak returns to the URL the flow started from.
- *Verified on dev, supplier, 2026-10-10:* no email-verification gate after sign-up; the new user lands straight in the
  registration wizard.

## Registration wizard (supplier; company is similar but not yet probed here)
- Entity (CR) number: 10 digits starting with `70` (`set {cr} to unique "70{unique}"`).
- OTP is a fixed stub on dev: **2024** (`enter otp "2024" in #register-otp`). *Verified 2026-10-10.*
- Documents step takes PDFs from the repo's `documents/` folder.

## Test data
- Emails: `set {email} to unique "test{unique}@yopmail.com"` (yopmail inboxes are public; never use real addresses).
- VAT: 15 digits (`unique "3000000{unique}"`). IBAN `SA0380000000608010167519`. Address: building `102`,
  street `Olaya Street`, district `Al Olaya District`, zip `12211`, additional no. `4532679777`.
- Credentials only through env vars (`set {x} to env NAME`); names are per repo (see its override). Never read or print
  `.env*`.

## Data and safety
- Any test or probe that signs up, registers or creates an order creates real data on the target env: say so before
  running. End a creating test with `record <type> {key}` so it lands in the repo's local ledger.
- Teardown of created data is out of scope for now.
- Commits go through the `/code-reviewer` skill first.
