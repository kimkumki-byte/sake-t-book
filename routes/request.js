// 사케 요청: 손님이 "이 사케 마셔보고 싶어요"를 운영자에게 알려요
// GET                     → 손님: 내 요청만 / 운영자: 모든 요청
// POST { name, note }     → 요청 남기기 (사케 이름 80자, 메모 200자). 처리 안 된 요청은 한 사람당 20개까지
// PATCH { id, done }      → 운영자: 처리 완료 표시 켜기/끄기
// DELETE ?id=             → 손님: 내 요청만 / 운영자: 아무 요청이나 지우기
const store = require('../lib/store');
const v = require('../lib/validate');
const { HttpError, handler, send } = require('../lib/http');
const { requireSession, assertLive } = require('../lib/auth');

const MAX_OPEN = 20;

function readId(x) {
  const id = parseInt(x, 10);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, '요청을 알 수 없어요.');
  return id;
}

module.exports = handler(['GET', 'POST', 'PATCH', 'DELETE'], async (req, res) => {
  const me = requireSession(req);
  const admin = me.role === 'admin';

  if (req.method === 'GET') {
    return send(res, 200, { requests: await store.listRequests(admin ? null : me.nick) });
  }

  if (req.method === 'POST') {
    const name = v.text(req.body.name, 80, '사케 이름', { required: true });
    const note = v.text(req.body.note, 200, '메모', { multiline: true });
    const [, mine] = await Promise.all([assertLive(me, store), store.listRequests(me.nick)]);
    if (mine.filter((r) => !r.done).length >= MAX_OPEN) {
      throw new HttpError(400, `아직 처리 안 된 요청이 ${MAX_OPEN}개예요. 운영자가 확인한 뒤에 더 남겨 주세요.`);
    }
    const row = await store.createRequest({ nickname: me.nick, name, note });
    return send(res, 200, { ok: true, request: row });
  }

  if (req.method === 'PATCH') {
    if (!admin) throw new HttpError(403, '운영자만 할 수 있어요.');
    const id = readId(req.body.id);
    const row = await store.setRequestDone(id, req.body.done === true);
    if (!row) throw new HttpError(404, '이미 지워진 요청이에요.');
    return send(res, 200, { ok: true, id, done: row.done });
  }

  const id = readId(req.query.id);
  if (!admin) await assertLive(me, store);
  const n = await store.deleteRequest(id, admin ? null : me.nick);
  if (!n) throw new HttpError(404, '이미 지웠거나 내 요청이 아니에요.');
  return send(res, 200, { ok: true });
});
