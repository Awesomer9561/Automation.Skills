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
- Each repo has one `.env`: a dev block and a commented-out qa block of portal URLs (`SUPPLIER_URL`, `COMPANY_URL`,
  `ADMIN_URL`; exactly one block uncommented), then one user per portal (`SUPPLIER_EMAIL`/`SUPPLIER_PASSWORD`,
  `COMPANY_EMAIL`/`COMPANY_PASSWORD`, `ADMIN_EMAIL`/`ADMIN_PASSWORD`). Tests and probes run on whatever is set: no
  environment name, no per-env files, no host tables in code.
- Local portals (Vite) run against dev's backend and dev's Keycloak: swap the app's URL line in the dev block for the
  commented localhost one (e.g. `SUPPLIER_URL=http://localhost:5173`).
- Local ports are not fixed: CompanyPortal pins `5173` and SupplierPortal uses Vite's default `5173`, so whichever
  starts second gets `5174`. Confirm a port by the Keycloak realm on its login page (`Supplier-Dev`, `Company-Dev`).

## Layout regions (all three portals)
Probes tag each element with its region; narrow a repeated name with `in the <region>`
(`I click "Orders" in the sidebar`). Words: **sidebar** (side bar, sidenav), **header** (app header, top bar),
**modal** (dialog, popup), **toast** (notification, snackbar), **main** (main content; everything outside the others).
- Header = `<header>`, sidebar = `<aside>` (inside `#layout-sidebar` in Supplier and Company; Admin's has no id), modal =
  Radix `[role=dialog]` (ids `<name>-modal`), toast = ids `toast-<type>-<random>-*`. There is no `<main>` or `<footer>`.
- Nav link ids differ: `sidenav-*` (Supplier, Admin) vs `nav-*` (Company); header ids `header-*` (Supplier, Company) vs
  `topbar-*` (Admin). Steps use labels, so this only matters when reading ids.
- Selectors live in `pack.js` `regions`; a portal whose layout differs overrides them in `steps.config.js`
  (`apps.<app>.regions`).
- *Not yet verified against live portals:* region tags come from the portal source and a synthetic layout; re-probe a
  page and check `npm run gen:ids` shows the expected region before relying on it.

## Writing steps
- QA writes steps by label and button text (`I enter "Abdul" in First name`, `I click "Get OTP"`), probes the steps
  file (`npm run probe -- steps/<name>.txt`), then generates. Ids come from the recorded pages, never from QA.
- *Verified on dev (local build), 2026-10-11:* `steps/supplier_registration.txt` in SupplierPortal.Automation probes
  and generates end to end this way (8 pages; both "Sign up"s and both "Email Address" fields resolve correctly).

## Identity (Keycloak, one realm per portal, e.g. `Supplier-Dev`)
- `pack.js` here gives every repo one login step: `I login as "ADMIN" user` (also `with ... credentials|account`;
  `SUPPLIER`, `COMPANY`, or a named account like `"SUPPLIER_CUSTOM_PLAN"`). The quoted name is the `.env` prefix:
  credentials are `<NAME>_EMAIL` / `<NAME>_PASSWORD`, and its first word is the portal (an `apps` key in the repo's
  `steps.config.js`). It opens that portal, signs in and waits for the login form to go. There is no account list to
  maintain, and no unnamed `I login with <app> user` any more. It is the only pack step: everything else is label
  steps resolved from probed pages (`I click "Orders"`, `I click "Logout"`, `I click {orderNumber}`).
  *Compiled and generated only; not yet run against a live login.*
- *Verified on dev (local build), 2026-10-10:* supplier order cards are `orders-list-<order number, lowercased>`
  (QA specs use `order-card-<number>`); the order details page did not render for the probe account, so its ids
  (`order-details-*`, `accept-order-modal-*`) are still unverified on dev.
- *Verified on dev, supplier, 2026-10-10:* the portal root (`/`) redirects to the Keycloak login page:
  `#login-username-input`, `#login-password-input`, `#login-submit-btn`, sign-up link `#login-sign-up-link`.
  The sign-up form: `#register-first-name-input`, `-last-name-`, `-email-`, `-password-`, `-password-confirm-input`,
  `#register-submit-btn`.
- Start sign-in and sign-up at the portal root, not `/signin`: Keycloak returns to the URL the flow started from.
- *Verified on dev, supplier, 2026-10-10:* no email-verification gate after sign-up; the new user lands straight in the
  registration wizard.

## Registration wizard (supplier; company is similar but not yet probed here)
- Entity (CR) number: 10 digits starting with `70` (`set {cr} to unique "70{unique}"`).
- OTP is a fixed stub on dev: **2024** (`I enter OTP "2024"`, or one box at a time `I enter 2 in OTP field 1`; four
  boxes `#register-otp-0..3`). *Verified 2026-10-10.*
- Documents step takes PDFs from the repo's `documents/` folder.
- *Verified on dev, supplier, 2026-10-10:* wizard order is `/auth` entity number -> OTP -> `/auth/register` basic
  details -> address -> `/auth/upload-documents`. On the documents page the file input
  `#register-docs-new-commercial-document-new-doc-upload-input` is hidden (wait on
  `#register-docs-new-commercial-document-new-doc-upload-btn`, then upload to the input); there is no terms checkbox;
  `#register-docs-submit-btn` ("Agree and Proceed") stays disabled until a file is uploaded. Submitting lands on
  `/dashboard` with "Account is in the verification process".
- *Verified on dev, 2026-10-10:* a supplier account that has not finished registration lands on the wizard (`/auth`,
  `#register-cr-input`), not the dashboard. Dashboard or profile tests need a registered and approved supplier
  account; ask the user for one.
- *Verified 2026-10-10:* the hosted dev build lags the local one (e.g. hosted dev's wizard page has no
  `#auth-logout-btn`). Probe the build you will run against.

## Names in knowledge files
- Never record a person's name (the signed-in user's, or anyone else's). Probes redact the words of the name shown by the
  elements in the config's `identity` list and skip multi-line button text; a repo lists its header's name element there.
- Admin: `apps.admin.identity: ['#topbar-account-name']`. *Supplier and Company: set `identity` to their header's
  account/name element (not yet looked up) before probing, and re-check `knowledge/` for the name.*

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
