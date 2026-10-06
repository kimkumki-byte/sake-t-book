// 평가 저장 (같은 사람이 같은 사케를 다시 평가하면 수정돼요). 마신 날짜·만족도 별점도 함께 저장
const store = require('../lib/store');
const v = require('../lib/validate');
const { HttpError, handler, send } = require('../lib/http');
const { requireSession } = require('../lib/auth');

module.exports = handler(['POST'], async (req, res) => {
  const me = requireSession(req);
  const sakeId = parseInt(req.body.sakeId, 10);
  if (!Number.isInteger(sakeId)) throw new HttpError(400, '사케를 알 수 없어요.');
  const scores = v.scores(req.body.v);
  const comment = v.text(req.body.comment, 50, '한줄평');
  const drank_on = v.drankOn(req.body.drankOn);
  const stars = v.stars(req.body.stars);
  if (!(await store.getSake(sakeId))) throw new HttpError(404, '등록되지 않았거나 삭제된 사케예요.');
  await store.upsertRating({ sake_id: sakeId, nickname: me.nick, v: scores, comment, drank_on, stars });
  send(res, 200, { ok: true });
});
