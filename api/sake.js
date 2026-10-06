// 사케 한 병의 상세 정보.
// 평균과 다른 사람 리뷰는 "내 평가를 저장한 뒤"에만 내려줘요 (화면이 아니라 서버에서 지켜요).
const store = require('../lib/store');
const { HttpError, handler, send } = require('../lib/http');
const { requireSession, adminConfig } = require('../lib/auth');

module.exports = handler(['GET'], async (req, res) => {
  const me = requireSession(req);
  const id = parseInt(req.query.id, 10);
  if (!Number.isInteger(id)) throw new HttpError(400, '사케를 알 수 없어요.');
  const sake = await store.getSake(id);
  if (!sake) throw new HttpError(404, '등록되지 않았거나 삭제된 사케예요.');

  const rows = await store.ratingsFor(id);
  const mine = rows.find((r) => r.nickname === me.nick) || null;
  const base = { sake, n: rows.length, rated: !!mine, my: null, avg: null, reviews: null };
  if (!mine) return send(res, 200, base);

  const avg = [0, 1, 2, 3, 4].map((i) => rows.reduce((a, r) => a + r.v[i], 0) / rows.length);
  const adminNick = adminConfig().nick;
  return send(res, 200, {
    ...base,
    my: { v: mine.v, t: mine.comment || '', at: mine.updated_at, drank_on: mine.drank_on },
    avg,
    reviews: rows.map((r) => ({
      nick: r.nickname, t: r.comment || '', at: r.updated_at,
      mine: r.nickname === me.nick, admin: r.nickname === adminNick,
    })),
  });
});
