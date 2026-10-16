// 오술(오늘 마실 술): 운영자가 날짜별로 사케와 순서를 정하면, 그날 그 사케만 모아서 보여줘요.
// GET  ?date=YYYY-MM-DD        → 그날의 오술 (모두 볼 수 있어요. 미리 정해 둔 미래 날짜도)
// GET  ?manage=1&date=…        → 운영자 편성용: 그날의 순서와 편성된 날짜 목록
// PUT  { date, ids: [사케 번호…] } → 운영자: 그날의 오술을 이 순서로 통째로 저장 (빈 목록이면 비우기)
const store = require('../lib/store');
const v = require('../lib/validate');
const { HttpError, handler, send } = require('../lib/http');
const { requireSession, requireAdmin } = require('../lib/auth');

const MAX_ITEMS = 30;

function byDay(rows) {
  const m = new Map();
  rows.forEach((r) => {
    if (!m.has(r.day)) m.set(r.day, []);
    m.get(r.day).push(r);
  });
  m.forEach((list) => list.sort((a, b) => a.pos - b.pos));
  return m;
}

module.exports = handler(['GET', 'PUT'], async (req, res) => {
  if (req.method === 'PUT') {
    requireAdmin(req);
    const day = v.day(req.body.date);
    const raw = req.body.ids;
    if (!Array.isArray(raw)) throw new HttpError(400, '사케 목록을 다시 확인해 주세요.');
    if (raw.length > MAX_ITEMS) throw new HttpError(400, `오술은 하루 ${MAX_ITEMS}병까지 정할 수 있어요.`);
    const ids = raw.map((x) => Number(x));
    if (ids.some((x) => !Number.isInteger(x) || x < 1)) throw new HttpError(400, '사케 목록을 다시 확인해 주세요.');
    if (new Set(ids).size !== ids.length) throw new HttpError(400, '같은 사케가 두 번 들어 있어요.');
    const sakes = await store.listSakes();
    const known = new Set(sakes.map((s) => s.id));
    if (ids.some((x) => !known.has(x))) throw new HttpError(404, '등록되지 않았거나 삭제된 사케가 있어요.');
    await store.setOsul(day, ids);
    return send(res, 200, { ok: true, date: day, ids });
  }

  const me = requireSession(req);
  const today = v.todayKST();
  const day = v.day(req.query.date);

  if (req.query.manage) {
    if (me.role !== 'admin') throw new HttpError(403, '운영자만 할 수 있어요.');
    const m = byDay(await store.allOsul());
    const dates = [];
    m.forEach((list, d) => dates.push({ date: d, count: list.length }));
    return send(res, 200, { date: day, today, ids: (m.get(day) || []).map((r) => r.sake_id), dates });
  }

  const [rows, sakes, ratings] = await Promise.all([store.allOsul(), store.listSakes(), store.allRatingsLite()]);
  const m = byDay(rows);
  const days = Array.from(m.keys()).sort();
  const prev = days.filter((d) => d < day).pop() || null;
  const next = days.find((d) => d > day) || null;

  const sakeMap = new Map(sakes.map((s) => [s.id, s]));
  const counts = {};
  const mine = {};
  ratings.forEach((r) => {
    counts[r.sake_id] = (counts[r.sake_id] || 0) + 1;
    if (r.nickname === me.nick) mine[r.sake_id] = r;
  });
  const items = (m.get(day) || []).map((r) => sakeMap.get(r.sake_id)).filter(Boolean).map((s) => ({
    id: s.id, name: s.name, brewer: s.brewer, origin: s.origin, tint: s.tint, img_url: s.img_url,
    n: counts[s.id] || 0, rated: !!mine[s.id],
    drank_on: mine[s.id] ? mine[s.id].drank_on || null : null,
    stars: mine[s.id] ? (mine[s.id].stars ?? null) : null,
  }));
  return send(res, 200, { date: day, today, items, prev, next });
});
