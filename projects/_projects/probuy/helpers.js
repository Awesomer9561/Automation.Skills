// Page-state helpers behind the probuy pack's theme and language steps. A repo maps them in steps.config.js `helpers`
// by spreading the pack's `helpers` (see pack.js). Plain Playwright page calls, so this needs no @playwright/test.

// The portal marks the active theme with a "light" or "dark" class on <html> (ThemeContext).
async function expectTheme(page, theme) {
    await page.waitForFunction((t) => document.documentElement.classList.contains(t), theme);
}

// The portals save the language on the signed-in user, so a run can start in either language. Waits for the saved
// language to be applied, then switches (the pill toggles to the other language) only if it differs, and waits for the
// save to finish. Ids verified on the Admin Portal (language-switcher-toggle-btn).
async function setLanguage(page, lang, toggleId = 'language-switcher-toggle-btn') {
    const toggle = page.locator(`#${toggleId}`);
    const current = () => page.evaluate(() => document.documentElement.lang);
    await toggle.waitFor({ state: 'visible' });
    await page.waitForLoadState('networkidle');
    if ((await current()) === lang) return;
    await toggle.click();
    await page.waitForFunction((l) => document.documentElement.lang === l, lang);
    await page.waitForLoadState('networkidle');
}


// Verifies a new account's email through yopmail.com (the test email domain), the way a user would: open the inbox,
// open the "Verify Email Address" mail, click its link. Plain Playwright page calls, no @playwright/test import.
//
// Flow (same as CompanyPortal.Automation/utility/yopmail.js): inbox page -> #login + "Check Inbox" -> the mail renders
// in iframe #ifmail -> click the link. The link opens in a new tab (or the same tab, handled too). Afterwards the
// original `page` is sent to the app's root (appUrl), where the verified user's Keycloak session resumes the sign-up,
// so the steps after this one keep using `page`.

const STEP_DELAY = 2000;    // pause between yopmail actions (the Company specs use 2-5s): yopmail is slow and rate limits quick clicks
const MAIL_DELAY = 5000;    // after sign-up, before opening the inbox: time for Keycloak to send the mail
const INBOX_TIMEOUT = 90000;
const CHALLENGE_TIMEOUT = 180000;   // how long a person has to tick yopmail's "Verify you are human" box
const VERIFY_LINK = 'Verify Email Address';

async function openInbox(mail, email) {
    // yopmail is sometimes slow or rate limited: retry the page load until the login box shows
    for (const start = Date.now(); ; ) {
        try {
            await mail.goto('https://yopmail.com/en', { waitUntil: 'domcontentloaded', timeout: 15000 });
            await mail.locator('#login').waitFor({ state: 'visible', timeout: 5000 });
            break;
        } catch (e) {
            if (Date.now() - start > 60000) throw new Error(`yopmail.com did not load: ${e.message}`);
            await mail.waitForTimeout(3000);
        }
    }
    await mail.waitForTimeout(STEP_DELAY);
    await mail.locator('#login').fill(email);
    await mail.waitForTimeout(STEP_DELAY);
    await mail.locator('button[title="Check Inbox @yopmail.com"]').click();
    await mail.waitForTimeout(STEP_DELAY);
}

// yopmail sometimes puts a Cloudflare "Verify you are human" check in front of the inbox. The step does not try to
// pass it: it waits for a person to tick the box (run headed, or set YOPMAIL_CDP_URL to use your own Chrome).
async function waitForHumanCheck(mail) {
    const check = mail.getByText('Verify you are human');
    await mail.waitForTimeout(3000);
    if (!(await check.count())) return;
    console.log('\n>>> yopmail is asking to "Verify you are human". Tick the box in the browser window (run with --headed); waiting up to ' + CHALLENGE_TIMEOUT / 1000 + 's.\n');
    try {
        await check.first().waitFor({ state: 'detached', timeout: CHALLENGE_TIMEOUT });
    } catch {
        throw new Error('yopmail "Verify you are human" check was not completed: run headed and tick the box, or verify the email another way');
    }
}

// Opens the yopmail inbox for `email` on `mail` and returns the "Verify Email Address" link once the mail has arrived.
async function findVerifyLink(mail, email) {
    await openInbox(mail, email);
    await waitForHumanCheck(mail);
    const link = mail.frameLocator('#ifmail').getByRole('link', { name: VERIFY_LINK });
    // the mail can take a few seconds: refresh the inbox until it is open
    for (const start = Date.now(); !(await link.count()); ) {
        if (Date.now() - start > INBOX_TIMEOUT) throw new Error(`no "${VERIFY_LINK}" mail for ${email} after ${INBOX_TIMEOUT / 1000}s`);
        await mail.locator('#refresh').click().catch(() => {});
        await mail.waitForTimeout(4000);
    }
    await mail.waitForTimeout(STEP_DELAY);
    return link;
}

// YOPMAIL_CDP_URL (e.g. http://localhost:9222) = a Chrome the person started with --remote-debugging-port, where they
// already passed yopmail's human check (see rules.md). The inbox is read in a new tab of that browser; the verify link's
// URL is then opened by the test's own page, so the sign-up carries on in the test's session.
async function verifyViaOwnBrowser(page, email, cdpUrl) {
    // the repo's own Playwright (this file lives outside the repo)
    const { chromium } = require(require.resolve('@playwright/test', { paths: [process.cwd()] }));
    const browser = await chromium.connectOverCDP(cdpUrl).catch((e) => {
        throw new Error(`YOPMAIL_CDP_URL=${cdpUrl} is not answering: start the yopmail Chrome first (\`npm run chrome:yopmail\`, see YOPMAIL-SETUP.md). ${e.message.split('\n')[0]}`);
    });
    let href;
    try {
        const context = browser.contexts()[0];
        if (!context) throw new Error(`no browser window found at ${cdpUrl}`);
        const mail = await context.newPage();
        try {
            href = await (await findVerifyLink(mail, email)).getAttribute('href');
        } finally {
            await mail.close();
        }
    } finally {
        await browser.close();   // only disconnects: the person's Chrome stays open
    }
    if (!href) throw new Error('the "Verify Email Address" link has no href');
    await page.goto(href, { waitUntil: 'domcontentloaded' });
}

async function verifyEmailOnYopmail(page, email, appUrl) {
    await page.waitForTimeout(MAIL_DELAY);
    if (process.env.YOPMAIL_CDP_URL) {
        await verifyViaOwnBrowser(page, email, process.env.YOPMAIL_CDP_URL);
    } else {
        const context = page.context();
        const mail = await context.newPage();
        try {
            const link = await findVerifyLink(mail, email);
            const [verifyTab] = await Promise.all([
                context.waitForEvent('page', { timeout: 15000 }).catch(() => null),
                link.click(),
            ]);
            const landed = verifyTab || mail;
            await landed.waitForTimeout(STEP_DELAY);
            await landed.waitForLoadState('load', { timeout: 30000 }).catch(() => {});
            await landed.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
            if (verifyTab) await verifyTab.close();
        } finally {
            await mail.close();
        }
        await page.bringToFront();
    }
    await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
}

module.exports = { expectTheme, setLanguage, verifyEmailOnYopmail };
