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

module.exports = { expectTheme, setLanguage };
