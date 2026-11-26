// 운영자 전용: 손님 목록·비밀번호 초기화, 전체 데이터 백업
// GET  ?what=guests                → 손님 목록 (닉네임, 가입일, 리뷰 수, 마지막 기록)
// GET  ?what=backup                → 백업용 전체 데이터 (비밀번호는 빼요)
// POST { action: 'reset', nickname } → 그 손님 비밀번호를 임시 비밀번호로 바꾸고, 임시 비밀번호를 한 번만 알려줘요
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const store = require('../lib/store');
const core = require('../lib/core');
const { HttpError, handler, send } = require('../lib/http');
const { requireAdmin } = require('../lib/auth');
const { lockKeyOf } = require('./auth');

// 헷갈리는 글자(0·O·1·l·I)는 빼고 6자리 임시 비밀번호
const ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789';
function tempPassword() {
  const bytes = crypto.randomBytes(6);
  return Array.from(bytes, (b) => ALPHA[b % ALPHA.length]).join('');
}

module.exports = handler(['GET', 'POST'], async (req, res) => {
  requireAdmin(req);

  if (req.method === 'POST') {
    if (req.body.action !== 'reset') throw new HttpError(400, '알 수 없는 요청이에요.');
    const nick = String(req.body.nickname || '').trim();
    const guest = nick ? await store.getGuest(nick) : null;
    if (!guest) throw new HttpError(404, '그런 닉네임의 손님이 없어요.');
    const temp = tempPassword();
    await store.setPassword(guest.nickname, await bcrypt.hash(temp, 10));
    await store.clearLoginFail(lockKeyOf(guest.nickname)); // 잠겨 있었다면 바로 풀어요
    return send(res, 200, { ok: true, nickname: guest.nickname, temp });
  }

  const what = String(req.query.what || '');
  if (what === 'guests') {
    const [guests, ratings] = await Promise.all([store.listGuests(), store.allRatingsLite()]);
    const by = {};
    ratings.forEach((r) => {
      const m = by[r.nickname] || (by[r.nickname] = { n: 0, last: '' });
      m.n += 1;
      const at = core.createdOf(r);
      if (at > m.last) m.last = at;
    });
    return send(res, 200, {
      guests: guests.map((g) => ({
        nickname: g.nickname, created_at: g.created_at,
        reviews: by[g.nickname] ? by[g.nickname].n : 0, last: by[g.nickname] ? by[g.nickname].last : null,
      })),
    });
  }

  if (what === 'backup') {
    const [sakes, ratings, guests, osul, requests] = await Promise.all([
      store.listSakes(), store.allRatings(), store.listGuests(), store.allOsul(), store.listRequests(),
    ]);
    return send(res, 200, { exported_at: new Date().toISOString(), sakes, ratings, guests, osul, requests });
  }

  throw new HttpError(400, '알 수 없는 요청이에요.');
});
