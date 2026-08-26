# Yoto Radio Station Picker 📻

Pick an internet radio station from [radio-browser.info](https://www.radio-browser.info/) and turn it into a
[Yoto](https://yotoplay.com/) MYO card that streams it live. A card can hold several stations — each one becomes
its own track.

Fully static, no backend: both the station directory and Yoto's login/content APIs are designed to be called
directly from browser JavaScript.

**Not affiliated with Yoto Ltd.**

## Getting started

You'll need a client registered at [dashboard.yoto.dev](https://dashboard.yoto.dev/) (no client secret needed —
this flow is designed for a browser-only app):

1. Register a client, with `http://localhost:5173/` as an allowed callback/logout URL for local dev.
2. Scopes: `user:content:manage`, `family:library:view`, and `offline_access`.
3. Copy the client_id into [`js/config.js`](js/config.js).

Then serve the site over HTTP (it uses ES modules, so `file://` won't work). Use `devserver.py` rather than plain
`python -m http.server` — it sends `Cache-Control: no-store` so edited JS/CSS doesn't get stuck in the browser's
cache:

```bash
python devserver.py 5173
```

Open `http://localhost:5173`.

## How it works

- **Station search** — `js/radioBrowser.js` calls `de1.api.radio-browser.info` directly from the browser. Uses
  `url_resolved` (already redirect-resolved) as the stream URL, and `countrycode` rather than a free-text country
  name, since the API's `country` param does a case-sensitive substring match.
- **Auth** — `js/auth.js` implements the PKCE dance: generate a code verifier/challenge, redirect to
  `login.yotoplay.com/authorize`, exchange the returned code for tokens, store them in `localStorage`. Refresh
  tokens are single-use, so a refresh always replaces both tokens.
- **No build step** — plain HTML/CSS/JS with ES modules, no framework, no bundler.

## Privacy

See [`privacy.html`](privacy.html) — short version: no backend, no data collection, tokens live only in your
browser.
