# Mural website

The public website for [Mural](https://mural.chat), an open-source language app for learning through conversation. The app lives separately in [Chuloo/mural](https://github.com/Chuloo/mural).

## Preview locally

The `dist` directory contains the complete site: HTML, CSS, JavaScript and self-hosted assets. It is source code, not disposable build output. No package installation or build step is needed.

```sh
python3 -m http.server 4173 --directory dist
```

Open `http://localhost:4173`. The orb follows the app’s organic outline and moving warm gradients. The animation control, reduced-motion preference and background-tab detection pause motion.

## Deploy with Cloudflare Pages

Connect this repository in **Workers & Pages → Create application → Pages → Connect to Git**. Use these settings:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Framework | None |
| Build command | Leave empty |
| Build output directory | `dist` |
| Root directory | Repository root |

The live project is `mural-website` ([Cloudflare URL](https://mural-website-cgk.pages.dev)), connected to this repository. Add `mural.chat` through the Pages project’s **Custom domains** panel. Its Cloudflare zone must be active for the apex domain. Preserve existing email DNS records when changing nameservers at the registrar. Each push to `main` publishes the site; other branches can receive preview deployments. In the `mural.chat` zone, the active `Mural: www to canonical domain` Redirect Rule sends both HTTP and HTTPS requests for `www.mural.chat` to `https://mural.chat`, preserving paths and query strings. Domain-level redirects belong in Cloudflare Rules; the Pages `_redirects` file only supports relative source paths.

See [Cloudflare’s Git integration guide](https://developers.cloudflare.com/pages/get-started/git-integration/) and [custom-domain instructions](https://developers.cloudflare.com/pages/configuration/custom-domains/).

## Release details

The homepage and `/download/` offer Android (Google Play), Apple (the iPhone waitlist form), and Github (the source repository). The Apple dialog explains the waitlist, and `/download/` retains the source installation guide. When Apple access opens, replace the waitlist destination with the verified public installation route. Do not advertise available free minutes or purchases until those features are enabled and verified.

The form submits to `https://api.mural.chat/v1/access-requests`. The separate app backend stores the email, request date, consent version and website source in PostgreSQL. It sends no automatic emails and creates no app account. Validation, duplicate handling, admission limits, retention and private export/deletion commands are documented in the [access-request runbook](https://github.com/Chuloo/mural/blob/codex/android-release/services/api/docs/access-requests.md). Deploy that backend before publishing the form. No credentials belong in this repository.

Production accepts requests only from `https://mural.chat`; local and Cloudflare preview pages can show the form but cannot submit to the production database. Use a separately configured local API for development submissions. A successful form test should use a disposable test address and remove its database row afterward.

Canonical URLs, social tags and the sitemap use `https://mural.chat`. The privacy and terms pages describe guest trials, optional accounts, hosted conversations, personal API keys, access requests and conditional purchases. The operator is Hackmamba Inc., registered in the United States. The public account-deletion request path is `/support/#delete-account`. Keep the policies aligned with deployed features, provider processing and retention; purchases are not advertised as active until live checkout is verified.

## Website checkout

`/buy-minutes/` verifies the email already shown in Mural’s Account screen before offering the existing live Stripe packs. The verification code gives 30 minutes of access to checkout and that account’s purchase status. It creates no Mural account and cannot join accounts that share an email. Apple relay addresses are supported. Unknown or ambiguous addresses receive the same code-request message.

Checkout access stays in this tab’s session storage for 30 minutes. The purchase draft and retry key stay in memory while the request is in progress. After opening Stripe, the tab briefly keeps only the account email, order ID and session expiry for a return status check. Cancelling, going back or opening the purchase page restores an editable pack and quantity selection. No token or email is placed in a URL. Returning from Stripe does not establish payment success: an owned server status check confirms whether minutes were added. Fulfillment remains tied to the verified Mural account, independently of the browser reference. `/payment-return/` retains its generic native/Android behavior when there is no web purchase return reference.

The production API accepts only the exact `https://mural.chat` origin on `/v1/web-purchases/*`. Deploy its matching migration, runtime grants, proxy paths and protected email configuration before merging this website. The purchase page and return page use a restrictive CSP, no-referrer policy and no-store caching. The website still deploys directly from `dist` with no build command. The Node package contains test dependencies only.

Run `npm ci --ignore-scripts` and `npm test` for validation tests. `npm run test:browser` uses a fresh headless Chrome session, a local static server and intercepted synthetic API/Stripe responses. It covers mobile verification, native quantity selection, editable cancel/back/reload, same-key request retries, owned return status checks and generic native return behavior. Set `PLAYWRIGHT_CHANNEL=chromium` after installing the Playwright Chromium browser if Chrome is unavailable. These tests send no emails and make no real purchases.

See the backend [website purchase contract](https://github.com/Chuloo/mural/blob/main/services/api/docs/web-purchases.md) for account association, delivery limits, retention and rollout requirements.

## Assets and licenses

The Allura signature font is self-hosted under its bundled SIL Open Font License. The GitHub mark comes from [GitHub’s Octicons](https://github.com/primer/octicons) under its bundled MIT license. The Apple mark uses the path published in [Apple’s website navigation](https://www.apple.com/). These marks identify their respective destinations and remain their owners’ trademarks. The Open Graph artwork was generated for Mural. The website source uses the [MIT License](LICENSE).
