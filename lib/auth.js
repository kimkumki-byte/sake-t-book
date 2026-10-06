// 로그인 상태(쿠키)와 운영자 설정을 다루는 도우미
const jwt = require('jsonwebtoken');
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
  const token = jwt.sign(payload, secret(), { expiresIn: MAX_AGE });
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
  try {
    const p = jwt.verify(token, secret());
    if ((p.role === 'guest' || p.role === 'admin') && typeof p.nick === 'string') {
      return { role: p.role, nick: p.nick };
    }
  } catch (e) {
    if (e instanceof HttpError) throw e;
  }
  return null;
}

function requireSession(req) {
  const s = getSession(req);
  if (!s) throw new HttpError(401, '로그인이 필요해요.');
  return s;
}

function requireAdmin(req) {
  const s = requireSession(req);
  if (s.role !== 'admin') throw new HttpError(403, '운영자만 할 수 있어요.');
  return s;
}

module.exports = { adminConfig, safeEqual, setSession, clearSession, getSession, requireSession, requireAdmin };
