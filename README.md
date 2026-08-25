# Yoto Radio Station Picker 📻

Pick an internet radio station from [radio-browser.info](https://www.radio-browser.info/) and turn it into a
[Yoto](https://yotoplay.com/) MYO card that streams it live. A card can hold several stations — each one becomes
its own track.

Fully static, no backend: both the station directory and Yoto's login/content APIs are designed to be called
directly from browser JavaScript.

**Not affiliated with Yoto Ltd.**

## Status

- ✅ Station search (name / country / tag) against radio-browser.info
- ✅ Filters out HLS-only streams and unmapped codecs (Yoto needs a direct mp3/aac stream)
- ✅ Multi-station card builder (add, reorder, remove)
- ✅ Yoto login (OAuth2 Authorization Code + PKCE, no client secret)
- ⏳ Actually creating the card (`POST /content`) — not wired up yet, "Create Yoto Card" is a placeholder until this
  lands

## Getting started

You'll need a client registered at [dashboard.yoto.dev](https://dashboard.yoto.dev/) (no client secret needed —
this flow is designed for a browser-only app):

1. Register a client, with `http://localhost:5173/` as an allowed callback/logout URL for local dev.
2. Scopes: `user:content:manage` and `offline_access`.
3. Copy the client_id into [`js/config.js`](js/config.js).

Then serve the site over HTTP (it uses ES modules, so `file://` won't work):

```bash
python -m http.server 5173
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

## Deployment

Targets GitHub Pages as a static site. Because it's a project page (not a root user/org page), all asset
references are relative so the app works under a subpath.

## Privacy

See [`privacy.html`](privacy.html) — short version: no backend, no data collection, tokens live only in your
browser.
