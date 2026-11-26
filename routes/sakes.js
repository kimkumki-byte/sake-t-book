// 사케 목록 보기(로그인한 모두), 등록·수정·삭제(운영자만)
const store = require('../lib/store');
const core = require('../lib/core');
const v = require('../lib/validate');
const { HttpError, handler, send } = require('../lib/http');
const { requireSession, requireAdmin } = require('../lib/auth');

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

// 화면에서 보낸 값을 검사해서 저장할 형태로 바꿔요
function readFields(b) {
  return {
    name: v.text(b.name, 80, '술 이름', { required: true }),
    rice: v.text(b.rice, 80, '원료'),
    polish: v.numberText(b.polish, '정미율', { min: 0, max: 100 }),
    abv: v.numberText(b.abv, '도수', { min: 0, max: 100 }),
    smv: v.numberText(b.smv, '주도', { min: -100, max: 100 }),
    acid: v.numberText(b.acid, '산도', { min: 0, max: 20 }),
    brewer: v.text(b.brewer, 60, '주조사'),
    origin: v.text(b.origin, 60, '원산지'),
    desc_title: v.text(b.desc_title, 40, '술 설명 제목'),
    desc_body: v.text(b.desc_body, 1000, '술 설명', { multiline: true }),
    tint: v.tint(b.tint),
  };
}

async function readImage(image) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(image));
  if (!m) throw new HttpError(400, '이미지는 JPG, PNG, WEBP만 올릴 수 있어요.');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > MAX_IMAGE_BYTES) throw new HttpError(400, '이미지가 너무 커요. 2MB 이하로 올려 주세요.');
  return store.uploadImage(buf, m[1]);
}

function readId(req) {
  const id = parseInt(req.query.id, 10);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, '사케를 알 수 없어요.');
  return id;
}

module.exports = handler(['GET', 'POST', 'PATCH', 'DELETE'], async (req, res) => {
  if (req.method === 'GET') {
    const me = requireSession(req);
    const [sakes, ratings, wishes] = await Promise.all([store.listSakes(), store.allRatingsLite(), store.listWishes(me.nick)]);
    const wished = new Set(wishes.map((w) => w.sake_id));
    const people = {}; // 사케별 평가한 사람 (여러 번 기록해도 1명)
    const mine = {};   // 내가 평가한 사케 → 가장 최근 기록 + 기록 횟수 + 마신 날짜들
    ratings.forEach((r) => {
      (people[r.sake_id] = people[r.sake_id] || new Set()).add(r.nickname);
      if (r.nickname !== me.nick) return;
      const m = mine[r.sake_id] || (mine[r.sake_id] = { last: null, times: 0, days: [] });
      m.times += 1;
      if (r.drank_on) m.days.push(r.drank_on);
      if (!m.last || core.byLatest(r, m.last) < 0) m.last = r;
    });
    return send(res, 200, {
      sakes: sakes.map((s) => {
        const m = mine[s.id];
        return {
          id: s.id, name: s.name, brewer: s.brewer, origin: s.origin, tint: s.tint, img_url: s.img_url,
          created_at: s.created_at, n: people[s.id] ? people[s.id].size : 0,
          rated: !!m, times: m ? m.times : 0, days: m ? m.days.sort() : [],
          drank_on: m ? m.last.drank_on || null : null, stars: m ? m.last.stars ?? null : null,
          wished: wished.has(s.id),
        };
      }),
    });
  }

  requireAdmin(req);

  // 새로 등록
  if (req.method === 'POST') {
    const row = readFields(req.body);
    row.img_url = req.body.image ? await readImage(req.body.image) : null;
    const sake = await store.createSake(row);
    return send(res, 200, { ok: true, sake });
  }

  // 수정
  // 사진: image(새 사진)가 오면 교체, clearImage가 true면 사진을 빼고 임시 이미지 사용, 둘 다 없으면 기존 사진 유지
  if (req.method === 'PATCH') {
    const id = readId(req);
    const before = await store.getSake(id);
    if (!before) throw new HttpError(404, '등록되지 않았거나 삭제된 사케예요.');
    const row = readFields(req.body);
    let oldImage = null;
    if (req.body.image) {
      row.img_url = await readImage(req.body.image);
      oldImage = before.img_url;
    } else if (req.body.clearImage === true) {
      row.img_url = null;
      oldImage = before.img_url;
    }
    const sake = await store.updateSake(id, row);
    if (!sake) throw new HttpError(404, '등록되지 않았거나 삭제된 사케예요.');
    if (oldImage && oldImage !== sake.img_url) await store.removeImage(oldImage);
    return send(res, 200, { ok: true, sake });
  }

  // 삭제 (평가도 함께 지워져요)
  const id = readId(req);
  const before = await store.getSake(id);
  await store.deleteSake(id);
  if (before && before.img_url) await store.removeImage(before.img_url);
  return send(res, 200, { ok: true });
});
