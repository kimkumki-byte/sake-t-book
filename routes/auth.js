// 가입, 로그인, 운영자 로그인, 로그아웃
const bcrypt = require('bcryptjs');
const store = require('../lib/store');
const v = require('../lib/validate');
const { HttpError, handler, send } = require('../lib/http');
const { adminConfig, safeEqual, setSession, clearSession, requireSession } = require('../lib/auth');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = handler(['POST'], async (req, res) => {
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

  if (action === 'login') {
    const nick = String(req.body.nickname || '').trim();
    const pw = String(req.body.password || '');
    const guest = nick ? await store.getGuest(nick) : null;
    // 닉네임이 없어도 같은 시간이 걸리도록 비교를 한 번은 해요
    const ok = await bcrypt.compare(pw, guest ? guest.pw_hash : '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali');
    if (!guest || !ok) {
      await wait(400);
      throw new HttpError(401, '닉네임 또는 비밀번호가 맞지 않아요.');
    }
    setSession(req, res, { role: 'guest', nick: guest.nickname });
    return send(res, 200, { ok: true, role: 'guest', nickname: guest.nickname });
  }

  if (action === 'admin') {
    if (!admin.pw) throw new HttpError(503, '운영자 비밀번호가 서버에 설정되지 않았어요.');
    const id = String(req.body.id || '').trim();
    const pw = String(req.body.password || '');
    const okId = safeEqual(id, admin.id);
    const okPw = safeEqual(pw, admin.pw);
    if (!(okId && okPw)) {
      await wait(400);
      throw new HttpError(401, '아이디 또는 비밀번호가 맞지 않아요.');
    }
    setSession(req, res, { role: 'admin', nick: admin.nick });
    return send(res, 200, { ok: true, role: 'admin', nickname: admin.nick });
  }

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
