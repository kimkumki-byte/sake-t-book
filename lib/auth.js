// 로그인 상태(쿠키)와 운영자 설정을 다루는 도우미
const crypto = require('crypto');
const { HttpError } = require('./http');

const COOKIE = 'sk';
const MAX_AGE = 60 * 60 * 24 * 30; // 30일

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new HttpError(500, '서버 설정(SESSION_SECRET)이 아직 안 되어 있어요. 운영자에게 알려 주세요.');
  }
  return s;
}

// 운영자 아이디는 기본값 ADMIN. 비밀번호는 코드에 넣지 않고 서버 환경변수로만 관리해요.
function adminConfig() {
  return {
    id: process.env.ADMIN_ID || 'ADMIN',
    nick: process.env.ADMIN_NICK || '아무개',
    pw: process.env.ADMIN_PASSWORD || '',
  };
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// 로그인 표(JWT, HS256). 예전 jsonwebtoken 라이브러리와 같은 형식이라 기존 로그인이 그대로 유지돼요.
// 라이브러리를 빼서 서버가 처음 깨어나는 시간을 줄였어요.
const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const JWT_HEAD = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));

function signToken(payload, key, maxAge) {
  const now = Math.floor(Date.now() / 1000);
  const body = b64u(JSON.stringify({ ...payload, iat: now, exp: now + maxAge }));
  const sig = b64u(crypto.createHmac('sha256', key).update(JWT_HEAD + '.' + body).digest());
  return JWT_HEAD + '.' + body + '.' + sig;
}

function verifyToken(token, key) {
  const parts = String(token).split('.');
  if (parts.length !== 3) return null;
  let head, body;
  try {
    head = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    body = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  } catch (e) { return null; }
  if (!head || head.alg !== 'HS256' || !body || typeof body !== 'object') return null;
  const want = crypto.createHmac('sha256', key).update(parts[0] + '.' + parts[1]).digest();
  const got = Buffer.from(parts[2], 'base64url');
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
  const now = Math.floor(Date.now() / 1000);
  if (typeof body.exp === 'number' && now >= body.exp) return null;
  if (typeof body.nbf === 'number' && now < body.nbf) return null;
  return body;
}

function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function isSecure(req) {
  const proto = req.headers['x-forwarded-proto'];
  const host = String(req.headers.host || '');
  return proto === 'https' || (!proto && !/^(localhost|127\.)/.test(host));
}

function setSession(req, res, payload) {
  const token = signToken(payload, secret(), MAX_AGE);
  const parts = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${MAX_AGE}`];
  if (isSecure(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSession(req, res) {
  const parts = [`${COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (isSecure(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

// 로그인 안 했으면 null, 했으면 { role: 'guest' | 'admin', nick }
function getSession(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (!token) return null;
  const p = verifyToken(token, secret());
  if (p && (p.role === 'guest' || p.role === 'admin') && typeof p.nick === 'string') {
    return { role: p.role, nick: p.nick };
  }
  return null;
}

function requireSession(req) {
  const s = getSession(req);
  if (!s) throw new HttpError(401, '로그인이 필요해요.');
  return s;
}

// 쓰기 작업 전: 다른 기기에서 탈퇴했거나 닉네임을 바꾼 계정의 예전 로그인은 막아요
async function assertLive(s, store) {
  if (s.role === 'guest' && !(await store.getGuest(s.nick))) {
    throw new HttpError(401, '계정 정보가 바뀌었어요. 다시 로그인해 주세요.');
  }
  return s;
}

async function requireLiveSession(req, store) {
  return assertLive(requireSession(req), store);
}

function requireAdmin(req) {
  const s = requireSession(req);
  if (s.role !== 'admin') throw new HttpError(403, '운영자만 할 수 있어요.');
  return s;
}

module.exports = { signToken, verifyToken, adminConfig, safeEqual, setSession, clearSession, getSession, requireSession, requireLiveSession, assertLive, requireAdmin };
