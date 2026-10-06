// 평가 저장 (같은 사람이 같은 사케를 다시 평가하면 수정돼요). 마신 날짜·만족도 별점도 함께 저장
// 저장하면서 새로 받은 뱃지와 레벨업을 알려줘요
const store = require('../lib/store');
const core = require('../lib/core');
const v = require('../lib/validate');
const { HttpError, handler, send } = require('../lib/http');
const { requireLiveSession } = require('../lib/auth');

module.exports = handler(['POST'], async (req, res) => {
  const me = await requireLiveSession(req, store);
  const sakeId = parseInt(req.body.sakeId, 10);
  if (!Number.isInteger(sakeId)) throw new HttpError(400, '사케를 알 수 없어요.');
  const scores = v.scores(req.body.v);
  const comment = v.text(req.body.comment, 50, '한줄평');
  const drank_on = v.drankOn(req.body.drankOn);
  const stars = v.stars(req.body.stars);
  const [sakes, ratings] = await Promise.all([store.listSakes(), store.allRatings()]);
  if (!sakes.some((s) => s.id === sakeId)) throw new HttpError(404, '등록되지 않았거나 삭제된 사케예요.');

  const before = core.profile(me.nick, sakes, ratings);
  await store.upsertRating({ sake_id: sakeId, nickname: me.nick, v: scores, comment, drank_on, stars });

  // 방금 저장한 평가를 반영해서 다시 계산
  const old = ratings.find((r) => r.sake_id === sakeId && r.nickname === me.nick);
  const maxId = ratings.reduce((m, r) => Math.max(m, r.id || 0), 0);
  const next = ratings.filter((r) => r !== old);
  next.push({ id: old ? old.id : maxId + 1, sake_id: sakeId, nickname: me.nick, v: scores, comment, drank_on, stars, updated_at: new Date().toISOString() });
  const after = core.profile(me.nick, sakes, next);

  const had = new Set(before.badges.filter((b) => b.got).map((b) => b.id));
  send(res, 200, {
    ok: true,
    newBadges: after.badges.filter((b) => b.got && !had.has(b.id)).map((b) => ({ id: b.id, name: b.name })),
    levelUp: after.level.lv > before.level.lv ? { lv: after.level.lv, title: after.level.title } : null,
  });
});
