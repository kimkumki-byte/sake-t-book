// 사케 한 병의 상세 정보.
// 평균과 다른 사람 리뷰는 "내 평가를 하나라도 저장한 뒤"에만 내려줘요 (화면이 아니라 서버에서 지켜요).
// 같은 사케를 여러 번 기록할 수 있어요: 평균·인원수는 사람마다 가장 최근 리뷰 하나만 1표로 세요.
const store = require('../lib/store');
const core = require('../lib/core');
const { HttpError, handler, send } = require('../lib/http');
const { requireSession, adminConfig } = require('../lib/auth');

module.exports = handler(['GET'], async (req, res) => {
  const me = requireSession(req);
  const id = parseInt(req.query.id, 10);
  if (!Number.isInteger(id)) throw new HttpError(400, '사케를 알 수 없어요.');
  // 사케 정보와 평가를 동시에 가져와요 (기다리는 시간 절반)
  const [sake, rows, wishes] = await Promise.all([store.getSake(id), store.ratingsFor(id), store.listWishes(me.nick)]);
  if (!sake) throw new HttpError(404, '등록되지 않았거나 삭제된 사케예요.');

  const people = core.latestPer(rows); // 사람당 1개 (가장 최근)
  const mineAll = rows.filter((r) => r.nickname === me.nick).sort(core.byLatest);
  const wished = wishes.some((w) => w.sake_id === id);
  const base = { sake, n: people.length, rated: mineAll.length > 0, wished, my: null, mine: [], avg: null, reviews: null };
  if (!mineAll.length) return send(res, 200, base);

  const view = (r) => ({
    id: r.id, v: r.v, t: r.comment || '', stars: r.stars ?? null, drank_on: r.drank_on || null, temp: r.temp || null,
    at: core.createdOf(r),
  });
  const latest = mineAll[0];
  const avg = [0, 1, 2, 3, 4].map((i) => people.reduce((a, r) => a + r.v[i], 0) / people.length);
  // 별점은 별점을 남긴 사람만으로 평균 (예전 평가에는 별점이 없을 수 있어요)
  const starred = core.latestPer(rows.filter((r) => typeof r.stars === 'number'));
  const avg_stars = starred.length ? starred.reduce((a, r) => a + r.stars, 0) / starred.length : null;
  const adminNick = adminConfig().nick;
  const reviews = rows.slice()
    .sort((a, b) => String(core.createdOf(b)).localeCompare(String(core.createdOf(a))) || (b.id || 0) - (a.id || 0))
    .map((r) => ({
      id: r.id, nick: r.nickname, t: r.comment || '', at: core.createdOf(r),
      stars: r.stars ?? null, temp: r.temp || null,
      mine: r.nickname === me.nick, admin: r.nickname === adminNick,
    }));
  return send(res, 200, {
    ...base,
    my: view(latest),           // 비교 차트에 쓰는 내 가장 최근 기록
    mine: mineAll.map(view),    // 내 기록 모두 (최근 마신 순)
    avg,
    avg_stars,
    stars_n: starred.length,
    reviews,
  });
});
