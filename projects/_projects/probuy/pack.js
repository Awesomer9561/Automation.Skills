// Steps shared by every ProBuy portal (supplier, company, admin): their Keycloak login pages use the same ids.
// Repos list this file in steps.config.js `packs`. Ids verified by probes on dev, 2026-10-10 (supplier, company).

const { byId } = require('../../../steps-core/intents');

const LOGIN_MS = 60000;

// Credentials per portal follow the .env convention in rules.md: <APP>_EMAIL / <APP>_PASSWORD.
const creds = (app) => ({ email: { env: `${app.toUpperCase()}_EMAIL` }, password: { env: `${app.toUpperCase()}_PASSWORD` } });

module.exports = {
    name: 'probuy',
    phrasings: [
        {
            usage: 'I login with supplier user | sign in as company user | login using admin credentials   (opens that portal and signs in with <APP>_EMAIL / <APP>_PASSWORD from .env)',
            pattern: /^(?:i )?(?:log ?in|sign ?in)(?: as| with| using)? (?:the |a |an )?(\w+)(?: user| account| credentials)?$/i,
            build: (m, ctx) => {
                const app = m[1].toLowerCase();
                const { email, password } = creds(app);
                ctx.addWait(2 * LOGIN_MS);
                return [
                    { op: 'switchApp', app },
                    { op: 'goto', app, path: '/' },
                    { op: 'waitFor', target: byId('#login-username-input'), state: 'visible', timeout: LOGIN_MS },
                    { op: 'fill', target: byId('#login-username-input'), value: email },
                    { op: 'fill', target: byId('#login-password-input'), value: password },
                    { op: 'click', target: byId('#login-submit-btn') },
                    // signed in once Keycloak's form is gone; the landing page differs per account
                    { op: 'waitFor', target: byId('#login-password-input'), state: 'hidden', timeout: LOGIN_MS },
                ];
            },
        },
    ],
};
