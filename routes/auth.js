// 가입, 로그인, 운영자 로그인, 로그아웃
const bcrypt = require('bcryptjs');
const store = require('../lib/store');
const v = require('../lib/validate');
const { HttpError, handler, send } = require('../lib/http');
const { adminConfig, safeEqual, setSession, clearSession, requireSession } = require('../lib/auth');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- 로그인 시도 제한: 같은 계정에 비밀번호를 5번 틀리면 10분 동안 로그인 막기 ---------- */
const MAX_FAILS = 5;
const LOCK_MS = 10 * 60 * 1000;
const lockKeyOf = (nick) => 'g:' + String(nick).toLowerCase();

// 잠겨 있으면 몇 분 남았는지 알려주고 멈춰요
async function assertNotLocked(key) {
  const f = await store.getLoginFail(key);
  const until = f && f.locked_until ? Date.parse(f.locked_until) : 0;
  if (until > Date.now()) {
    const min = Math.max(1, Math.ceil((until - Date.now()) / 60000));
    throw new HttpError(429, `비밀번호를 ${MAX_FAILS}번 틀려서 잠시 잠겼어요. ${min}분 뒤에 다시 시도해 주세요.`);
  }
  return f;
}

// 틀린 횟수를 하나 올리고, 5번째면 10분 잠가요 (잠금이 풀린 뒤에는 처음부터 다시 세요)
async function recordFail(key, f) {
  const expired = f && f.locked_until && Date.parse(f.locked_until) <= Date.now();
  const fails = (f && !expired ? f.fails : 0) + 1;
  if (fails >= MAX_FAILS) {
    await store.setLoginFail(key, 0, new Date(Date.now() + LOCK_MS).toISOString());
    return true;
  }
  await store.setLoginFail(key, fails, null);
  return false;
}

async function failLogin(key, f, message) {
  const locked = await recordFail(key, f);
  await wait(400);
  if (locked) throw new HttpError(429, `비밀번호를 ${MAX_FAILS}번 틀려서 10분 동안 로그인할 수 없어요.`);
  throw new HttpError(401, message);
}

// 운영자 로그인: 아이디·비밀번호를 서버 환경변수와 비교해요
async function adminLogin(req, res, admin) {
  if (!admin.pw) throw new HttpError(503, '운영자 비밀번호가 서버에 설정되지 않았어요.');
  const id = String(req.body.id || '').trim();
  const pw = String(req.body.password || '');
  const okId = safeEqual(id, admin.id);
  if (!okId) {
    await wait(400);
    throw new HttpError(401, '아이디 또는 비밀번호가 맞지 않아요.');
  }
  const f = await assertNotLocked('admin');
  if (!safeEqual(pw, admin.pw)) return failLogin('admin', f, '아이디 또는 비밀번호가 맞지 않아요.');
  if (f) await store.clearLoginFail('admin');
  setSession(req, res, { role: 'admin', nick: admin.nick });
  return send(res, 200, { ok: true, role: 'admin', nickname: admin.nick });
}

const route = handler(['POST'], async (req, res) => {
  const { action } = req.body;
  const admin = adminConfig();

  if (action === 'logout') {
    clearSession(req, res);
    return send(res, 200, { ok: true });
  }

  if (action === 'signup') {
    const nick = v.nickname(req.body.nickname);
    const pw = v.password(req.body.password);
    const lower = nick.toLowerCase();
    // 운영자 닉네임/아이디는 게스트가 쓸 수 없어요
    if (lower === admin.nick.toLowerCase() || lower === admin.id.toLowerCase()) {
      throw new HttpError(409, '이미 쓰고 있는 닉네임이에요. 다른 닉네임을 써 주세요.');
    }
    const hash = await bcrypt.hash(pw, 10);
    try {
      await store.createGuest(nick, hash);
    } catch (e) {
      if (e.code === 'DUP') throw new HttpError(409, '이미 쓰고 있는 닉네임이에요. 다른 닉네임을 써 주세요.');
      throw e;
    }
    setSession(req, res, { role: 'guest', nick });
    return send(res, 200, { ok: true, role: 'guest', nickname: nick });
  }

  // 로그인은 하나로: 아이디가 정확히 운영자 아이디(ADMIN)면 운영자, 아니면 게스트 닉네임으로 확인해요
  // (게스트는 ADMIN·admin 같은 닉네임으로 가입할 수 없어서 겹치지 않아요)
  if (action === 'login' && String(req.body.nickname || '').trim() === admin.id) {
    req.body = { ...req.body, action: 'admin', id: admin.id };
    return adminLogin(req, res, admin);
  }

  if (action === 'login') {
    const nick = String(req.body.nickname || '').trim();
    const pw = String(req.body.password || '');
    if (!nick) throw new HttpError(401, '닉네임 또는 비밀번호가 맞지 않아요.');
    const key = lockKeyOf(nick);
    const [f, guest] = await Promise.all([assertNotLocked(key), store.getGuest(nick)]);
    // 닉네임이 없어도 같은 시간이 걸리도록 비교를 한 번은 해요
    const ok = await bcrypt.compare(pw, guest ? guest.pw_hash : '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali');
    if (!guest || !ok) return failLogin(key, f, '닉네임 또는 비밀번호가 맞지 않아요.');
    if (f) await store.clearLoginFail(key);
    setSession(req, res, { role: 'guest', nick: guest.nickname });
    return send(res, 200, { ok: true, role: 'guest', nickname: guest.nickname });
  }

  // 예전 운영자 로그인 방식도 그대로 받아요 (이미 열려 있던 화면·앱에서 보낼 수 있어서)
  if (action === 'admin') return adminLogin(req, res, admin);

  /* ---------- 내 계정 (MY) ---------- */
  if (action === 'rename' || action === 'password' || action === 'withdraw') {
    const me = requireSession(req);
    if (me.role !== 'guest') throw new HttpError(403, '운영자 계정 정보는 Vercel 설정에서 바꿔요.');

    if (action === 'rename') {
      const nick = v.nickname(req.body.nickname);
      const lower = nick.toLowerCase();
      if (nick === me.nick) throw new HttpError(400, '지금 쓰는 닉네임과 같아요.');
      if (lower === admin.nick.toLowerCase() || lower === admin.id.toLowerCase()) {
        throw new HttpError(409, '이미 쓰고 있는 닉네임이에요. 다른 닉네임을 써 주세요.');
      }
      try {
        await store.renameGuest(me.nick, nick);
      } catch (e) {
        if (e.code === 'DUP') throw new HttpError(409, '이미 쓰고 있는 닉네임이에요. 다른 닉네임을 써 주세요.');
        throw e;
      }
      setSession(req, res, { role: 'guest', nick });
      return send(res, 200, { ok: true, nickname: nick });
    }

    // 비밀번호 변경·탈퇴는 지금 비밀번호를 한 번 더 확인해요
    const guest = await store.getGuest(me.nick);
    const okPw = guest && (await bcrypt.compare(String(req.body.password || ''), guest.pw_hash));
    if (!okPw) {
      await wait(400);
      throw new HttpError(400, '지금 비밀번호가 맞지 않아요.');
    }

    if (action === 'password') {
      const next = v.password(req.body.newPassword);
      await store.setPassword(me.nick, await bcrypt.hash(next, 10));
      return send(res, 200, { ok: true });
    }

    // withdraw: 내가 쓴 평가·찜·회원 정보를 모두 삭제
    await store.deleteGuest(me.nick);
    clearSession(req, res);
    return send(res, 200, { ok: true });
  }

  throw new HttpError(400, '알 수 없는 요청이에요.');
});

module.exports = route;
module.exports.lockKeyOf = lockKeyOf;
