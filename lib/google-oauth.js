// ============================================================
// lib/google-oauth.js — OAuth de Google para la Business Profile API.
// Proyecto GCP: popular-reviews-automation (485278389357), allowlisted
// por Google en julio 2026 (caso 1-2509000040750).
//
// Necesita en .env:
//   GOOGLE_OAUTH_CLIENT_ID     = client ID del OAuth client (tipo Web)
//   GOOGLE_OAUTH_CLIENT_SECRET = secret del mismo client
//   GOOGLE_OAUTH_REDIRECT      = opcional; default
//                                https://grupoajax.es/api/admin/google/oauth/callback
//
// El dueño autoriza UNA vez desde el panel (scope business.manage) con la
// cuenta que administra las fichas. El refresh_token se guarda en
// google-oauth-token.json (excluido de git y del deploy, como ig-token.json)
// y el access_token se renueva solo. Sin env vars, todo queda "no configurado".
// ============================================================
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TOKEN_FILE = path.join(__dirname, '..', 'google-oauth-token.json');
const SCOPE = 'https://www.googleapis.com/auth/business.manage';
const REDIRECT = process.env.GOOGLE_OAUTH_REDIRECT
  || 'https://grupoajax.es/api/admin/google/oauth/callback';

function configurado() {
  return !!(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
}

function conectado() {
  const t = readTokenFile();
  return !!(t && t.refresh_token);
}

function readTokenFile() {
  try {
    if (fs.existsSync(TOKEN_FILE)) return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf-8'));
  } catch (e) { console.error('[Google OAuth] Error leyendo token:', e.message); }
  return null;
}

function writeTokenFile(data) {
  fs.writeFileSync(TOKEN_FILE, JSON.stringify({ ...data, updated_at: new Date().toISOString() }, null, 2));
}

// ---- Estado del flujo (anti-CSRF): un solo state válido, dura 10 min ----
let _pendingState = null;

function authUrl() {
  if (!configurado()) throw new Error('GOOGLE_OAUTH_CLIENT_ID/SECRET no configurados');
  _pendingState = { value: crypto.randomBytes(16).toString('hex'), exp: Date.now() + 10 * 60 * 1000 };
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
    redirect_uri: REDIRECT,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state: _pendingState.value,
  });
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString();
}

function validState(state) {
  const ok = _pendingState && _pendingState.value === state && Date.now() < _pendingState.exp;
  _pendingState = null; // un solo uso
  return !!ok;
}

async function tokenRequest(params) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error('OAuth ' + res.status + ': ' + (data.error_description || data.error || 'error'));
  return data;
}

// ---- Canjea el code del callback y guarda el refresh_token ----
async function exchangeCode(code) {
  const data = await tokenRequest({
    code,
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
    client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    redirect_uri: REDIRECT,
    grant_type: 'authorization_code',
  });
  const prev = readTokenFile() || {};
  writeTokenFile({
    refresh_token: data.refresh_token || prev.refresh_token,
    access_token: data.access_token,
    expires_at: Date.now() + (data.expires_in - 60) * 1000,
  });
  return true;
}

// ---- Access token vigente (renueva solo si venció) ----
async function getAccessToken() {
  const t = readTokenFile();
  if (!t || !t.refresh_token) throw new Error('Google no conectado: autorizar desde el panel');
  if (t.access_token && t.expires_at && Date.now() < t.expires_at) return t.access_token;

  const data = await tokenRequest({
    refresh_token: t.refresh_token,
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
    client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    grant_type: 'refresh_token',
  });
  writeTokenFile({
    refresh_token: t.refresh_token,
    access_token: data.access_token,
    expires_at: Date.now() + (data.expires_in - 60) * 1000,
  });
  return data.access_token;
}

function desconectar() {
  try { if (fs.existsSync(TOKEN_FILE)) fs.unlinkSync(TOKEN_FILE); } catch (_) {}
}

module.exports = { configurado, conectado, authUrl, validState, exchangeCode, getAccessToken, desconectar, REDIRECT };
