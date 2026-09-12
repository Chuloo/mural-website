# Mural website

The public website for [Mural](https://mural.chat), an open-source iPhone app for learning through conversation. The app lives separately in [Chuloo/mural](https://github.com/Chuloo/mural).

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

The Apple-logo **Request access** button opens an email form. `/download/` offers the same form and the source installation guide. After Apple approves the beta, replace the access CTA with the verified public TestFlight invitation. Do not advertise available free minutes or purchases until those features are enabled and verified.

The form submits to `https://api.mural.chat/v1/access-requests`. The separate app backend stores the email, request date, consent version and website source in PostgreSQL. It sends no automatic emails and creates no app account. Validation, duplicate handling, admission limits, retention and private export/deletion commands are documented in the [access-request runbook](https://github.com/Chuloo/mural/blob/main/server/docs/access-requests.md). Deploy that backend before publishing the form. No credentials belong in this repository.

Production accepts requests only from `https://mural.chat`; local and Cloudflare preview pages can show the form but cannot submit to the production database. Use a separately configured local API for development submissions. A successful form test should use a disposable test address and remove its database row afterward.

Canonical URLs, social tags and the sitemap use `https://mural.chat`. The privacy and terms pages describe the app using a personal OpenAI API key and the website access list. The operator is Hackmamba Inc., registered in the United States. Update the service providers, billing records and retention periods before launching accounts or payments.

## Assets and licenses

The Allura signature font is self-hosted under its bundled SIL Open Font License. The GitHub mark comes from [GitHub’s Octicons](https://github.com/primer/octicons) under its bundled MIT license. The Apple mark uses the path published in [Apple’s website navigation](https://www.apple.com/). These marks identify their respective destinations and remain their owners’ trademarks. The Open Graph artwork was generated for Mural. The website source uses the [MIT License](LICENSE).
