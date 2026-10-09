// 찜(마셔보고 싶어요) 켜기/끄기
const store = require('../lib/store');
const { HttpError, handler, send } = require('../lib/http');
const { requireSession, assertLive } = require('../lib/auth');

module.exports = handler(['POST'], async (req, res) => {
  const me = requireSession(req);
  const sakeId = parseInt(req.body.sakeId, 10);
  if (!Number.isInteger(sakeId)) throw new HttpError(400, '사케를 알 수 없어요.');
  // 계정 확인과 사케 확인을 동시에 (기다리는 시간 절반)
  const [, sake] = await Promise.all([assertLive(me, store), store.getSake(sakeId)]);
  if (!sake) throw new HttpError(404, '등록되지 않았거나 삭제된 사케예요.');
  const on = req.body.on === true;
  await store.setWish(me.nick, sakeId, on);
  send(res, 200, { ok: true, wished: on });
});
