# Yopmail setup (email verification step)

Keycloak sign-up on the Supplier and Company portals sends a verification mail. The step `I verify {email} on yopmail`
(`pack.js`, helper in `helpers.js`) opens the yopmail inbox for the test address, finds the "Verify Email Address" mail and
continues the sign-up with its link.

Yopmail sometimes shows a Cloudflare "Verify you are human" check in front of the inbox. **The step never tries to pass
it.** A person ticks it once, in their own Chrome, and the tests reuse that browser.

## One-time setup (per machine)

1. Start Chrome with a debugging port and a dedicated profile:
   ```bash
   node <Automation.Skills>/projects/_projects/probuy/chrome-yopmail.js
   ```
   It finds Chrome on macOS, Windows and Linux (set `CHROME_PATH` if it is installed somewhere unusual), uses the profile
   `~/.yopmail-chrome` (`%USERPROFILE%\.yopmail-chrome` on Windows) and port 9222, and does nothing if that Chrome is already
   running. A repo can wrap it as an npm script, e.g. `npm run chrome:yopmail` in SupplierPortal.Automation. The port is open only while that
   Chrome is running, so repeat this after quitting it or restarting the machine; the profile keeps the Cloudflare tick.
2. In that window open https://yopmail.com, enter any inbox name, and tick the Cloudflare box if it shows.
3. In the repo's `.env` add:
   ```
   YOPMAIL_CDP_URL=http://localhost:9222
   ```
4. Check it (prints whether the human check is showing; never tries to pass it):
   `node -e "fetch('http://localhost:9222/json/version').then(r=>r.text()).then(console.log)"` should answer, and a run of the registration steps should reach the entity number.

## Every run

- Keep that Chrome window open while any test that verifies an email runs. The tests open a new yopmail tab in it, read the
  verify link, close the tab and disconnect; Chrome itself is left open.
- The test's own browser then opens the link, so the sign-up continues in the test's session.
- If Cloudflare shows the box again (clearance expires after a while), tick it in that window and re-run.

## Without `YOPMAIL_CDP_URL`

The step opens yopmail in the test's own browser. If the human check appears it waits up to 3 minutes for a person to tick it,
so run headed (`npx playwright test <spec> --headed`, or `npm run probe -- <steps file> --headed`). Without a person it fails
with "yopmail 'Verify you are human' check was not completed".

## Limits

- Needs a person and a desktop Chrome: it will not work in CI. A mail source that needs no bot check (e.g. reading the mail the
  realm's SMTP provider sent, or a mail catcher on the dev realm) is the route for unattended runs.
- Each run creates a real account on the dev portal with a public `@yopmail.com` address; never use real addresses.
- The helper's pauses are `STEP_DELAY` / `MAIL_DELAY` at the top of `helpers.js`.
