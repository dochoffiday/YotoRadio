// Yoto OAuth2 Authorization Code + PKCE flow — browser-only, no client secret.
// https://yoto.dev/authentication/browser-auth/

import { YOTO_CLIENT_ID } from "./config.js";

const AUTHORIZE_URL = "https://login.yotoplay.com/authorize";
const TOKEN_URL = "https://login.yotoplay.com/oauth/token";
// family:library:view is separate from user:content:manage — Yoto's own
// browser-auth tutorial uses it for GET /content/mine, while their content
// API reference claims that same endpoint only needs user:content:view.
// Requesting both since the docs disagree with each other.
const SCOPES = "user:content:manage family:library:view offline_access";

const TOKENS_KEY = "yoto_tokens";
const VERIFIER_KEY = "yoto_pkce_verifier";
const STATE_KEY = "yoto_pkce_state";

function redirectUri() {
  return `${window.location.origin}${window.location.pathname}`;
}

function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function randomString(byteLength) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

async function sha256Base64Url(input) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return base64url(new Uint8Array(digest));
}

export function getTokens() {
  const raw = localStorage.getItem(TOKENS_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function isLoggedIn() {
  return !!getTokens()?.access_token;
}

export function logout() {
  localStorage.removeItem(TOKENS_KEY);
}

function storeTokens({ access_token, refresh_token, expires_in }) {
  localStorage.setItem(TOKENS_KEY, JSON.stringify({
    access_token,
    // A refresh response may omit refresh_token if it didn't rotate; keep the old one only then.
    refresh_token: refresh_token ?? getTokens()?.refresh_token ?? null,
    expires_at: Date.now() + expires_in * 1000,
  }));
}

export async function startLogin() {
  if (!YOTO_CLIENT_ID) {
    throw new Error("Set YOTO_CLIENT_ID in js/config.js before logging in.");
  }
  const verifier = randomString(32);
  const challenge = await sha256Base64Url(verifier);
  const state = randomString(16);

  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);

  const params = new URLSearchParams({
    client_id: YOTO_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: "code",
    code_challenge: challenge,
    code_challenge_method: "S256",
    scope: SCOPES,
    state,
    // Auth0-issued tokens are only valid for /userinfo without this — every
    // yotoplay.com API example includes it. Omitting it is what produced the
    // blanket "explicit deny" on every api.yotoplay.com call.
    audience: "https://api.yotoplay.com",
  });

  window.location.href = `${AUTHORIZE_URL}?${params.toString()}`;
}

// If the URL is a Yoto OAuth callback (?code=...&state=...), exchange the
// code for tokens and strip those params from the URL. Call once on load.
export async function handleRedirectCallback() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code) return;

  const expectedState = sessionStorage.getItem(STATE_KEY);
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);

  url.searchParams.delete("code");
  url.searchParams.delete("state");
  window.history.replaceState({}, "", url.toString());

  if (!verifier || state !== expectedState) {
    throw new Error("Yoto login failed: state mismatch, please try again.");
  }

  await exchangeCode(code, verifier);
}

async function exchangeCode(code, verifier) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: YOTO_CLIENT_ID,
      code_verifier: verifier,
      code,
      redirect_uri: redirectUri(),
    }),
  });
  
  if (!res.ok) {
    throw new Error(`Yoto token exchange failed: ${res.status} ${await res.text()}`);
  }

  storeTokens(await res.json());
}

// Returns a usable access token, refreshing first if it's expired or about
// to expire. Throws (and logs out) if there's nothing to refresh with.
export async function getValidAccessToken() {
  const tokens = getTokens();
  if (!tokens) throw new Error("Not logged in to Yoto.");

  const EXPIRY_BUFFER_MS = 60_000;
  if (tokens.expires_at - Date.now() < EXPIRY_BUFFER_MS) {
    await refreshTokens();
  }
  return getTokens().access_token;
}

// Refresh tokens are single-use — the response always replaces both.
export async function refreshTokens() {
  const tokens = getTokens();
  if (!tokens?.refresh_token) throw new Error("No refresh token available.");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: YOTO_CLIENT_ID,
      refresh_token: tokens.refresh_token,
    }),
  });
  if (!res.ok) {
    logout();
    throw new Error(`Yoto token refresh failed: ${res.status} ${await res.text()}`);
  }
  storeTokens(await res.json());
}
