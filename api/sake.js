// 사케 한 병의 상세 정보.
// 평균과 다른 사람 리뷰는 "내 평가를 저장한 뒤"에만 내려줘요 (화면이 아니라 서버에서 지켜요).
const store = require('../lib/store');
const { HttpError, handler, send } = require('../lib/http');
const { requireSession, adminConfig } = require('../lib/auth');

module.exports = handler(['GET'], async (req, res) => {
  const me = requireSession(req);
  const id = parseInt(req.query.id, 10);
  if (!Number.isInteger(id)) throw new HttpError(400, '사케를 알 수 없어요.');
  // 사케 정보와 평가를 동시에 가져와요 (기다리는 시간 절반)
  const [sake, rows, wishes] = await Promise.all([store.getSake(id), store.ratingsFor(id), store.listWishes(me.nick)]);
  if (!sake) throw new HttpError(404, '등록되지 않았거나 삭제된 사케예요.');

  const mine = rows.find((r) => r.nickname === me.nick) || null;
  const wished = wishes.some((w) => w.sake_id === id);
  const base = { sake, n: rows.length, rated: !!mine, wished, my: null, avg: null, reviews: null };
  if (!mine) return send(res, 200, base);

  const avg = [0, 1, 2, 3, 4].map((i) => rows.reduce((a, r) => a + r.v[i], 0) / rows.length);
  // 별점은 별점을 남긴 사람만으로 평균 (예전 평가에는 별점이 없을 수 있어요)
  const starred = rows.filter((r) => typeof r.stars === 'number');
  const avg_stars = starred.length ? starred.reduce((a, r) => a + r.stars, 0) / starred.length : null;
  const adminNick = adminConfig().nick;
  return send(res, 200, {
    ...base,
    my: { v: mine.v, t: mine.comment || '', at: mine.updated_at, drank_on: mine.drank_on, stars: mine.stars ?? null },
    avg,
    avg_stars,
    stars_n: starred.length,
    reviews: rows.map((r) => ({
      nick: r.nickname, t: r.comment || '', at: r.updated_at, stars: r.stars ?? null,
      mine: r.nickname === me.nick, admin: r.nickname === adminNick,
    })),
  });
});
