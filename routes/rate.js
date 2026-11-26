// 평가(리뷰) 저장. 같은 사케를 여러 번 마실 수 있어서 리뷰를 여러 개 남길 수 있어요.
// POST { sakeId, v, comment, drankOn, stars, temp }  → 새 리뷰 추가 (temp: 마신 온도, 비워도 돼요)
// POST { id, sakeId, v, comment, drankOn, stars }    → 내 리뷰(id) 고치기 (처음 쓴 날짜는 그대로)
// DELETE ?id=리뷰번호                                 → 내 리뷰 지우기
// 저장하면서 새로 받은 뱃지와 레벨업을 알려줘요
const store = require('../lib/store');
const core = require('../lib/core');
const v = require('../lib/validate');
const { HttpError, handler, send } = require('../lib/http');
const { requireSession, assertLive } = require('../lib/auth');

function readReviewId(x) {
  const id = parseInt(x, 10);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, '리뷰를 알 수 없어요.');
  return id;
}

module.exports = handler(['POST', 'DELETE'], async (req, res) => {
  const me = requireSession(req);

  if (req.method === 'DELETE') {
    const id = readReviewId(req.query.id);
    await assertLive(me, store);
    const n = await store.deleteRating(id, me.nick);
    if (!n) throw new HttpError(404, '이미 지웠거나 내 리뷰가 아니에요.');
    return send(res, 200, { ok: true });
  }

  const editId = req.body.id == null || req.body.id === '' ? null : readReviewId(req.body.id);
  const sakeId = parseInt(req.body.sakeId, 10);
  if (!Number.isInteger(sakeId)) throw new HttpError(400, '사케를 알 수 없어요.');
  const scores = v.scores(req.body.v);
  const comment = v.text(req.body.comment, 50, '한줄평');
  const drank_on = v.drankOn(req.body.drankOn);
  const stars = v.stars(req.body.stars);
  const temp = v.temp(req.body.temp);
  // 계정 확인과 계산용 데이터 불러오기를 동시에
  const [, sakes, ratings] = await Promise.all([assertLive(me, store), store.listSakes(), store.allRatings()]);
  if (!sakes.some((s) => s.id === sakeId)) throw new HttpError(404, '등록되지 않았거나 삭제된 사케예요.');

  const before = core.profile(me.nick, sakes, ratings);
  const row = { v: scores, comment, drank_on, stars, temp };
  let id;
  let next;
  if (editId) {
    // 내 리뷰이고, 같은 사케의 리뷰여야 고칠 수 있어요
    const old = ratings.find((r) => r.id === editId);
    if (!old || old.nickname !== me.nick || old.sake_id !== sakeId) throw new HttpError(404, '이미 지웠거나 내 리뷰가 아니에요.');
    const saved = await store.updateRating(editId, me.nick, row);
    if (!saved) throw new HttpError(404, '이미 지웠거나 내 리뷰가 아니에요.');
    id = editId;
    next = ratings.map((r) => (r === old ? { ...old, ...row } : r));
  } else {
    id = await store.insertRating({ sake_id: sakeId, nickname: me.nick, ...row });
    const at = new Date().toISOString();
    next = ratings.concat([{ id: id || Infinity, sake_id: sakeId, nickname: me.nick, ...row, created_at: at, updated_at: at }]);
  }
  const after = core.profile(me.nick, sakes, next);

  const had = new Set(before.badges.filter((b) => b.got).map((b) => b.id));
  send(res, 200, {
    ok: true,
    id,
    newBadges: after.badges.filter((b) => b.got && !had.has(b.id)).map((b) => ({ id: b.id, name: b.name })),
    levelUp: after.level.lv > before.level.lv ? { lv: after.level.lv, title: after.level.title } : null,
  });
});
