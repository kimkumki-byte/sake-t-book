// 사케치북 자체 테스트: 서버 규칙 + 브라우저 화면 흐름
// 실행: npm test
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { createFakeStore } = require('./fake-store');

process.env.SESSION_SECRET = 'test-secret-test-secret-1234';
process.env.ADMIN_PASSWORD = '880825';
delete process.env.ADMIN_ID;
delete process.env.ADMIN_NICK;

const ROOT = path.join(__dirname, '..');
let store;
function freshServer() {
  store = createFakeStore();
  Object.keys(require.cache).forEach((k) => { if (k.startsWith(ROOT) && !k.includes('node_modules') && !k.includes('/tests/')) delete require.cache[k]; });
  require.cache[require.resolve('../lib/store')] = { id: 'store', filename: 'store', loaded: true, exports: store };
  return {
    me: require('../api/me'), auth: require('../api/auth'), sakes: require('../api/sakes'),
    sake: require('../api/sake'), rate: require('../api/rate'),
  };
}

// Vercel 함수에 요청 보내기를 흉내 내요
function call(fn, { method = 'GET', query = {}, body, cookie = '', xrw = true } = {}) {
  return new Promise((resolve) => {
    const headers = { host: 'sake.test', 'x-forwarded-proto': 'https', cookie };
    if (xrw) headers['x-requested-with'] = 'sakechibuk';
    const req = { method, query, body, headers };
    const res = {
      _h: {}, _s: 200,
      setHeader(k, v) { this._h[k.toLowerCase()] = v; },
      status(s) { this._s = s; return this; },
      json(b) { resolve({ status: this._s, body: b, headers: this._h }); },
    };
    fn(req, res);
  });
}
function cookieFrom(r) {
  const sc = r.headers['set-cookie'];
  return sc ? sc.split(';')[0] : '';
}

const results = [];
async function test(name, fn) {
  try { await fn(); results.push([true, name]); }
  catch (e) { results.push([false, name, e]); }
}

const B = (n) => Array(n).fill('가').join('');
const PNG = 'data:image/png;base64,' + Buffer.from('fakepng').toString('base64');

(async () => {
  /* ================= 서버 규칙 ================= */
  let A = freshServer();

  await test('운영자 로그인: ADMIN / 880825 성공, 닉네임은 아무개', async () => {
    const r = await call(A.auth, { method: 'POST', body: { action: 'admin', id: 'ADMIN', password: '880825' } });
    assert.equal(r.status, 200); assert.equal(r.body.role, 'admin'); assert.equal(r.body.nickname, '아무개');
    assert.match(r.headers['set-cookie'], /HttpOnly/); assert.match(r.headers['set-cookie'], /Secure/);
  });
  await test('운영자 로그인: 비밀번호 틀리면 실패', async () => {
    const r = await call(A.auth, { method: 'POST', body: { action: 'admin', id: 'ADMIN', password: '000000' } });
    assert.equal(r.status, 401);
  });
  await test('운영자 로그인: 아이디 소문자(admin)는 실패', async () => {
    const r = await call(A.auth, { method: 'POST', body: { action: 'admin', id: 'admin', password: '880825' } });
    assert.equal(r.status, 401);
  });

  const adm = cookieFrom(await call(A.auth, { method: 'POST', body: { action: 'admin', id: 'ADMIN', password: '880825' } }));

  await test('게스트 가입: 한글 닉네임 가능', async () => {
    const r = await call(A.auth, { method: 'POST', body: { action: 'signup', nickname: '민수', password: '1234' } });
    assert.equal(r.status, 200); assert.equal(r.body.nickname, '민수');
  });
  await test('게스트 가입: 같은 닉네임 중복 불가', async () => {
    const r = await call(A.auth, { method: 'POST', body: { action: 'signup', nickname: '민수', password: '9999' } });
    assert.equal(r.status, 409);
  });
  await test('게스트 가입: 운영자 닉네임(아무개)·아이디(admin) 사용 불가', async () => {
    assert.equal((await call(A.auth, { method: 'POST', body: { action: 'signup', nickname: '아무개', password: '1234' } })).status, 409);
    assert.equal((await call(A.auth, { method: 'POST', body: { action: 'signup', nickname: 'Admin', password: '1234' } })).status, 409);
  });
  await test('게스트 가입: 비밀번호 4자 미만, 닉네임 13자 이상 거절', async () => {
    assert.equal((await call(A.auth, { method: 'POST', body: { action: 'signup', nickname: '짧은비번', password: '123' } })).status, 400);
    assert.equal((await call(A.auth, { method: 'POST', body: { action: 'signup', nickname: B(13), password: '1234' } })).status, 400);
    assert.equal((await call(A.auth, { method: 'POST', body: { action: 'signup', nickname: '   ', password: '1234' } })).status, 400);
  });
  await test('게스트 비밀번호는 암호화되어 저장', async () => {
    const g = store._db.guests.find((x) => x.nickname === '민수');
    assert.notEqual(g.pw_hash, '1234'); assert.match(g.pw_hash, /^\$2[aby]\$/);
  });
  await test('게스트 로그인: 맞으면 성공, 틀리면 실패, 없는 닉네임 실패', async () => {
    assert.equal((await call(A.auth, { method: 'POST', body: { action: 'login', nickname: '민수', password: '1234' } })).status, 200);
    assert.equal((await call(A.auth, { method: 'POST', body: { action: 'login', nickname: '민수', password: '1111' } })).status, 401);
    assert.equal((await call(A.auth, { method: 'POST', body: { action: 'login', nickname: '없는사람', password: '1234' } })).status, 401);
  });

  const g1 = cookieFrom(await call(A.auth, { method: 'POST', body: { action: 'login', nickname: '민수', password: '1234' } }));
  const g2 = cookieFrom(await call(A.auth, { method: 'POST', body: { action: 'signup', nickname: '지은', password: 'abcd' } }));

  await test('로그인 안 하면 목록·상세·평가 모두 막힘', async () => {
    assert.equal((await call(A.sakes, {})).status, 401);
    assert.equal((await call(A.sake, { query: { id: '1' } })).status, 401);
    assert.equal((await call(A.rate, { method: 'POST', body: { stars: 4, sakeId: 1, v: [3, 3, 3, 3, 3] } })).status, 401);
  });
  await test('위조된 쿠키는 로그인으로 인정 안 함', async () => {
    const fake = 'sk=' + Buffer.from('{"role":"admin"}').toString('base64');
    assert.equal((await call(A.sakes, { cookie: fake })).status, 401);
  });
  await test('다른 사이트에서 보낸 요청(표시 헤더 없음) 차단', async () => {
    assert.equal((await call(A.sakes, { method: 'POST', cookie: adm, xrw: false, body: { name: 'x' } })).status, 403);
  });
  await test('게스트는 사케 등록·수정·삭제 불가', async () => {
    assert.equal((await call(A.sakes, { method: 'POST', cookie: g1, body: { name: '몰래 등록' } })).status, 403);
    assert.equal((await call(A.sakes, { method: 'PATCH', cookie: g1, query: { id: '1' }, body: { name: 'x' } })).status, 403);
    assert.equal((await call(A.sakes, { method: 'DELETE', cookie: g1, query: { id: '1' } })).status, 403);
  });

  await test('운영자 사케 등록: 이름만 있어도 등록, 주도·산도 비워도 됨', async () => {
    const r = await call(A.sakes, { method: 'POST', cookie: adm, body: { name: '주욘다이', tint: '#a05a6e' } });
    assert.equal(r.status, 200); assert.equal(r.body.sake.smv, ''); assert.equal(r.body.sake.acid, ''); assert.equal(r.body.sake.img_url, null);
  });
  await test('운영자 사케 등록: 이름 없으면 거절', async () => {
    assert.equal((await call(A.sakes, { method: 'POST', cookie: adm, body: { name: '  ' } })).status, 400);
  });
  await test('운영자 사케 등록: 숫자 칸에 글자 넣으면 거절, +3.0 / -1.5 는 허용', async () => {
    assert.equal((await call(A.sakes, { method: 'POST', cookie: adm, body: { name: 'x', polish: '마흔다섯' } })).status, 400);
    assert.equal((await call(A.sakes, { method: 'POST', cookie: adm, body: { name: 'x', polish: '150' } })).status, 400);
    const r = await call(A.sakes, { method: 'POST', cookie: adm, body: { name: '닷사이 45', rice: '쌀, 쌀누룩', polish: '45', abv: '16', smv: '+3.0', acid: '1.4', brewer: '아사히주조', origin: '야마구치현', image: PNG } });
    assert.equal(r.status, 200); assert.equal(r.body.sake.smv, '+3.0'); assert.ok(r.body.sake.img_url);
    const r2 = await call(A.sakes, { method: 'POST', cookie: adm, body: { name: '마이너스 주도', smv: '-1.5' } });
    assert.equal(r2.status, 200);
  });
  await test('이미지: 이미지가 아닌 파일, 2MB 초과는 거절', async () => {
    assert.equal((await call(A.sakes, { method: 'POST', cookie: adm, body: { name: 'x', image: 'data:text/html;base64,PGgxPg==' } })).status, 400);
    const big = 'data:image/jpeg;base64,' + Buffer.alloc(2.2 * 1024 * 1024).toString('base64');
    assert.equal((await call(A.sakes, { method: 'POST', cookie: adm, body: { name: 'x', image: big } })).status, 400);
  });
  await test('임시 이미지 색은 정해진 형식만 저장 (이상한 값은 기본색)', async () => {
    const r = await call(A.sakes, { method: 'POST', cookie: adm, body: { name: '색 테스트', tint: 'red;"><script>' } });
    assert.equal(r.body.sake.tint, '#4f7cac');
    await call(A.sakes, { method: 'DELETE', cookie: adm, query: { id: String(r.body.sake.id) } });
  });

  const dassai = store._db.sakes.find((s) => s.name === '닷사이 45').id;
  const juyon = store._db.sakes.find((s) => s.name === '주욘다이').id;
  const minus = store._db.sakes.find((s) => s.name === '마이너스 주도').id;

  /* ----- 수정 기능 ----- */
  await test('수정: 운영자가 이름·수치 수정, 사진은 그대로 유지', async () => {
    const before = await store.getSake(dassai);
    const r = await call(A.sakes, { method: 'PATCH', cookie: adm, query: { id: String(dassai) }, body: { name: '닷사이 준마이다이긴조 45', rice: '쌀, 쌀누룩', polish: '45', abv: '16', smv: '+4', acid: '1.1', brewer: '아사히주조', origin: '야마구치현', tint: before.tint } });
    assert.equal(r.status, 200);
    assert.equal(r.body.sake.name, '닷사이 준마이다이긴조 45'); assert.equal(r.body.sake.smv, '+4');
    assert.equal(r.body.sake.img_url, before.img_url);
  });
  await test('수정: 새 사진으로 교체하면 예전 사진은 보관함에서 정리', async () => {
    const old = (await store.getSake(dassai)).img_url;
    const r = await call(A.sakes, { method: 'PATCH', cookie: adm, query: { id: String(dassai) }, body: { name: '닷사이 준마이다이긴조 45', image: PNG } });
    assert.equal(r.status, 200); assert.notEqual(r.body.sake.img_url, old);
    assert.ok(!store._db.images.has(old)); assert.ok(store._db.images.has(r.body.sake.img_url));
  });
  await test('수정: 사진 빼고 임시 이미지로 바꾸기', async () => {
    const old = (await store.getSake(dassai)).img_url;
    const r = await call(A.sakes, { method: 'PATCH', cookie: adm, query: { id: String(dassai) }, body: { name: '닷사이 준마이다이긴조 45', tint: '#6a8f7b', clearImage: true } });
    assert.equal(r.body.sake.img_url, null); assert.equal(r.body.sake.tint, '#6a8f7b'); assert.ok(!store._db.images.has(old));
  });
  await test('수정: 빈 칸으로 고치면 값이 지워짐 (모르는 항목 비우기)', async () => {
    const r = await call(A.sakes, { method: 'PATCH', cookie: adm, query: { id: String(dassai) }, body: { name: '닷사이 준마이다이긴조 45', smv: '', acid: '' } });
    assert.equal(r.body.sake.smv, ''); assert.equal(r.body.sake.acid, '');
  });
  await test('수정: 이름 비우기·잘못된 숫자는 거절하고 기존 값 유지', async () => {
    assert.equal((await call(A.sakes, { method: 'PATCH', cookie: adm, query: { id: String(dassai) }, body: { name: '' } })).status, 400);
    assert.equal((await call(A.sakes, { method: 'PATCH', cookie: adm, query: { id: String(dassai) }, body: { name: 'x', abv: 'abc' } })).status, 400);
    assert.equal((await store.getSake(dassai)).name, '닷사이 준마이다이긴조 45');
  });
  await test('수정: 없는 사케·잘못된 번호는 안내', async () => {
    assert.equal((await call(A.sakes, { method: 'PATCH', cookie: adm, query: { id: '999' }, body: { name: 'x' } })).status, 404);
    assert.equal((await call(A.sakes, { method: 'PATCH', cookie: adm, query: { id: 'abc' }, body: { name: 'x' } })).status, 400);
  });

  /* ----- 만족도 별점 ----- */
  await test('별점: 반 개 단위(0.5~5)만 저장, 0·0.3·2.25·5.5·6·"4"·없음은 거절', async () => {
    const tmp = (await call(A.sakes, { method: 'POST', cookie: adm, body: { name: '반 별 테스트' } })).body.sake.id;
    for (const ok of [0.5, 3.5, 5, 1]) {
      assert.equal((await call(A.rate, { method: 'POST', cookie: g1, body: { sakeId: tmp, v: [3, 3, 3, 3, 3], stars: ok } })).status, 200, String(ok));
      assert.equal(store._db.ratings.find((r) => r.sake_id === tmp && r.nickname === '민수').stars, ok);
    }
    await call(A.sakes, { method: 'DELETE', cookie: adm, query: { id: String(tmp) } });
    for (const s of [undefined, 0, 0.3, 2.25, 5.5, 6, '4', null]) {
      const body = { sakeId: dassai, v: [3, 3, 3, 3, 3] };
      if (s !== undefined) body.stars = s;
      assert.equal((await call(A.rate, { method: 'POST', cookie: g1, body })).status, 400, String(s));
    }
  });
  await test('별점 평균은 별점 있는 평가만으로, 리뷰·목록에 별점 표시', async () => {
    const s = (await call(A.sakes, { method: 'POST', cookie: adm, body: { name: '별점 테스트' } })).body.sake;
    await call(A.rate, { method: 'POST', cookie: g1, body: { sakeId: s.id, v: [3, 3, 3, 3, 3], stars: 5 } });
    await call(A.rate, { method: 'POST', cookie: g2, body: { sakeId: s.id, v: [3, 3, 3, 3, 3], stars: 2 } });
    // 별점 기능 전에 남긴 평가처럼 별점이 없는 평가
    store._db.ratings.push({ sake_id: s.id, nickname: '옛날손님', v: [3, 3, 3, 3, 3], comment: '', drank_on: '2026-09-01', stars: null, updated_at: '2026-09-01T00:00:00Z' });
    const d = (await call(A.sake, { cookie: g1, query: { id: String(s.id) } })).body;
    assert.equal(d.avg_stars, 3.5); assert.equal(d.stars_n, 2); assert.equal(d.n, 3); assert.equal(d.my.stars, 5);
    const byNick = Object.fromEntries(d.reviews.map((r) => [r.nick, r.stars]));
    assert.deepEqual(byNick, { '민수': 5, '지은': 2, '옛날손님': null });
    const before = (await call(A.sake, { cookie: (await call(A.auth, { method: 'POST', body: { action: 'signup', nickname: '아직안마심', password: '1234' } })).headers['set-cookie'].split(';')[0], query: { id: String(s.id) } })).body;
    assert.equal(before.avg_stars, undefined, '평가 전에는 평균 별점도 안 보여야 함');
    const l1 = (await call(A.sakes, { cookie: g1 })).body.sakes.find((x) => x.id === s.id);
    const l2 = (await call(A.sakes, { cookie: g2 })).body.sakes.find((x) => x.id === s.id);
    assert.equal(l1.stars, 5); assert.equal(l2.stars, 2);
    await call(A.rate, { method: 'POST', cookie: g1, body: { sakeId: s.id, v: [3, 3, 3, 3, 3], stars: 3 } });
    assert.equal((await call(A.sake, { cookie: g1, query: { id: String(s.id) } })).body.my.stars, 3, '다시 평가하면 별점도 수정');
    await call(A.sakes, { method: 'DELETE', cookie: adm, query: { id: String(s.id) } });
  });

  /* ----- 술 설명 ----- */
  await test('술 설명: 제목·본문 저장, 줄바꿈 유지, 수정·비우기', async () => {
    const r = await call(A.sakes, { method: 'POST', cookie: adm, body: { name: '설명 테스트', desc_title: '멜론 향 가득', desc_body: '첫 줄\r\n둘째 줄\t탭' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.sake.desc_title, '멜론 향 가득'); assert.equal(r.body.sake.desc_body, '첫 줄\n둘째 줄 탭');
    const id = String(r.body.sake.id);
    const d = await call(A.sake, { cookie: g1, query: { id } });
    assert.equal(d.body.sake.desc_title, '멜론 향 가득'); assert.equal(d.body.sake.desc_body, '첫 줄\n둘째 줄 탭');
    const u = await call(A.sakes, { method: 'PATCH', cookie: adm, query: { id }, body: { name: '설명 테스트', desc_title: '', desc_body: '' } });
    assert.equal(u.body.sake.desc_title, ''); assert.equal(u.body.sake.desc_body, '');
    await call(A.sakes, { method: 'DELETE', cookie: adm, query: { id } });
  });
  await test('술 설명: 제목 41자·본문 1001자는 거절, 40자·1000자는 OK', async () => {
    assert.equal((await call(A.sakes, { method: 'POST', cookie: adm, body: { name: 'x', desc_title: B(41) } })).status, 400);
    assert.equal((await call(A.sakes, { method: 'POST', cookie: adm, body: { name: 'x', desc_body: B(1001) } })).status, 400);
    const r = await call(A.sakes, { method: 'POST', cookie: adm, body: { name: 'x', desc_title: B(40), desc_body: B(1000) } });
    assert.equal(r.status, 200);
    await call(A.sakes, { method: 'DELETE', cookie: adm, query: { id: String(r.body.sake.id) } });
  });

  /* ----- 평가 ----- */
  await test('평가 전에는 평균·리뷰가 서버에서부터 안 내려옴', async () => {
    await call(A.rate, { method: 'POST', cookie: g2, body: { stars: 4, sakeId: dassai, v: [4, 3, 2, 2, 4], comment: '과일향이 확' } });
    const r = await call(A.sake, { cookie: g1, query: { id: String(dassai) } });
    assert.equal(r.status, 200); assert.equal(r.body.rated, false); assert.equal(r.body.n, 1);
    assert.equal(r.body.avg, null); assert.equal(r.body.reviews, null);
  });
  await test('평가: 점수는 5개 모두 1~5 정수만', async () => {
    for (const v of [[0, 3, 3, 3, 3], [6, 3, 3, 3, 3], [3, 3, 3, 3], [3.5, 3, 3, 3, 3], ['3', 3, 3, 3, 3], null]) {
      assert.equal((await call(A.rate, { method: 'POST', cookie: g1, body: { stars: 4, sakeId: dassai, v } })).status, 400, JSON.stringify(v));
    }
  });
  await test('평가: 한줄평 50자까지 OK, 51자 거절 (한글 기준)', async () => {
    assert.equal((await call(A.rate, { method: 'POST', cookie: g1, body: { stars: 4, sakeId: juyon, v: [3, 3, 3, 3, 3], comment: B(51) } })).status, 400);
    assert.equal((await call(A.rate, { method: 'POST', cookie: g1, body: { stars: 4, sakeId: juyon, v: [3, 3, 3, 3, 3], comment: B(50) } })).status, 200);
  });
  await test('평가: 없는 사케에는 평가 불가', async () => {
    assert.equal((await call(A.rate, { method: 'POST', cookie: g1, body: { stars: 4, sakeId: 999, v: [3, 3, 3, 3, 3] } })).status, 404);
  });
  await test('평가 후: 평균·리뷰 공개, 평균 계산 정확', async () => {
    await call(A.rate, { method: 'POST', cookie: g1, body: { stars: 4, sakeId: dassai, v: [2, 3, 4, 3, 5], comment: '깔끔' } });
    const r = await call(A.sake, { cookie: g1, query: { id: String(dassai) } });
    assert.equal(r.body.rated, true); assert.equal(r.body.n, 2);
    assert.deepEqual(r.body.avg, [3, 3, 3, 2.5, 4.5]);
    assert.deepEqual(r.body.my.v, [2, 3, 4, 3, 5]);
    assert.equal(r.body.reviews.length, 2);
    const mine = r.body.reviews.find((x) => x.mine);
    assert.equal(mine.nick, '민수'); assert.equal(mine.t, '깔끔'); assert.ok(mine.at);
    assert.deepEqual(Object.keys(mine).sort(), ['admin', 'at', 'mine', 'nick', 'stars', 't'], '리뷰에는 맛 점수는 안 나가고 만족도 별점만');
  });
  await test('다시 평가하면 새로 쌓이지 않고 수정됨', async () => {
    await call(A.rate, { method: 'POST', cookie: g1, body: { stars: 4, sakeId: dassai, v: [3, 3, 3, 3, 3], comment: '다시 마셔보니 보통' } });
    const r = await call(A.sake, { cookie: g1, query: { id: String(dassai) } });
    assert.equal(r.body.n, 2); assert.equal(r.body.my.t, '다시 마셔보니 보통');
  });
  await test('운영자도 평가 가능, 리뷰에 운영자 표시', async () => {
    const w = await call(A.rate, { method: 'POST', cookie: adm, body: { stars: 4, sakeId: dassai, v: [3, 3, 2, 3, 4], comment: '운영자 추천' } });
    assert.equal(w.status, 200);
    const r = await call(A.sake, { cookie: g2, query: { id: String(dassai) } });
    const a = r.body.reviews.find((x) => x.nick === '아무개');
    assert.ok(a && a.admin === true);
    assert.ok(r.body.reviews.filter((x) => x.nick !== '아무개').every((x) => x.admin === false));
  });
  await test('목록: 참여 인원과 내 평가 여부가 사람별로 맞게 표시', async () => {
    const r1 = await call(A.sakes, { cookie: g1 });
    const d1 = r1.body.sakes.find((s) => s.id === dassai), j1 = r1.body.sakes.find((s) => s.id === juyon);
    assert.equal(d1.n, 3); assert.equal(d1.rated, true); assert.equal(j1.rated, true);
    const r2 = await call(A.sakes, { cookie: g2 });
    assert.equal(r2.body.sakes.find((s) => s.id === juyon).rated, false);
    assert.equal(r2.body.sakes.find((s) => s.id === minus).n, 0);
  });

  /* ----- 마신 날짜 ----- */
  await test('마신 날짜: 비우면 오늘(한국 시간), 고른 날짜는 그대로 저장', async () => {
    const v = require('../lib/validate');
    const s = (await call(A.sakes, { method: 'POST', cookie: adm, body: { name: '날짜 테스트' } })).body.sake;
    await call(A.rate, { method: 'POST', cookie: g1, body: { stars: 4, sakeId: s.id, v: [3, 3, 3, 3, 3] } });
    assert.equal(store._db.ratings.find((r) => r.sake_id === s.id).drank_on, v.todayKST());
    await call(A.rate, { method: 'POST', cookie: g1, body: { stars: 4, sakeId: s.id, v: [3, 3, 3, 3, 3], drankOn: '2026-09-15' } });
    assert.equal(store._db.ratings.find((r) => r.sake_id === s.id).drank_on, '2026-09-15');
    const list = (await call(A.sakes, { cookie: g1 })).body.sakes.find((x) => x.id === s.id);
    assert.equal(list.drank_on, '2026-09-15');
    const other = (await call(A.sakes, { cookie: g2 })).body.sakes.find((x) => x.id === s.id);
    assert.equal(other.drank_on, null, '다른 사람 목록에는 내 마신 날짜가 안 보여야 함');
    const det = await call(A.sake, { cookie: g1, query: { id: String(s.id) } });
    assert.equal(det.body.my.drank_on, '2026-09-15');
    await call(A.sakes, { method: 'DELETE', cookie: adm, query: { id: String(s.id) } });
  });
  await test('마신 날짜: 없는 날짜·형식 오류·미래·너무 옛날은 거절', async () => {
    for (const d of ['2026-02-30', '2026/09/01', '어제', '2999-01-01', '1999-12-31']) {
      assert.equal((await call(A.rate, { method: 'POST', cookie: g1, body: { stars: 4, sakeId: dassai, v: [3, 3, 3, 3, 3], drankOn: d } })).status, 400, d);
    }
  });
  await test('사케 삭제하면 그 평가도 함께 삭제', async () => {
    assert.equal((await call(A.sakes, { method: 'DELETE', cookie: adm, query: { id: String(juyon) } })).status, 200);
    assert.ok(!store._db.ratings.some((x) => x.sake_id === juyon));
    assert.equal((await call(A.sake, { cookie: g1, query: { id: String(juyon) } })).status, 404);
  });
  await test('로그아웃하면 쿠키가 지워짐', async () => {
    const r = await call(A.auth, { method: 'POST', body: { action: 'logout' } });
    assert.match(r.headers['set-cookie'], /Max-Age=0/);
  });
  await test('운영자 비밀번호 설정이 없으면 운영자 로그인 자체가 막힘', async () => {
    const saved = process.env.ADMIN_PASSWORD; delete process.env.ADMIN_PASSWORD;
    const r = await call(A.auth, { method: 'POST', body: { action: 'admin', id: 'ADMIN', password: '' } });
    process.env.ADMIN_PASSWORD = saved;
    assert.equal(r.status, 503);
  });
  await test('허용하지 않은 요청 방식(PUT 등)은 거절', async () => {
    assert.equal((await call(A.rate, { method: 'GET', cookie: g1 })).status, 405);
    assert.equal((await call(A.sakes, { method: 'PUT', cookie: adm })).status, 405);
  });

  /* ================= 화면 흐름 (가상 브라우저) ================= */
  const { JSDOM } = require('jsdom');
  const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8').replace(/<link[^>]*>/g, '').replace(/<script src="\/app.js"><\/script>/, '');
  const appJs = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');

  A = freshServer();
  const routes = { '/api/me': A.me, '/api/auth': A.auth, '/api/sakes': A.sakes, '/api/sake': A.sake, '/api/rate': A.rate };

  function browser() {
    const dom = new JSDOM(html, { url: 'https://sake.test/', runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window;
    let jar = '';
    const errors = [];
    w.addEventListener('error', (e) => errors.push(e.message));
    w.scrollTo = () => {};
    w.fetch = async (url, init = {}) => {
      const u = new URL(url, 'https://sake.test');
      const fn = routes[u.pathname];
      if (!fn) return { ok: false, status: 404, json: async () => ({}) };
      const r = await call(fn, {
        method: init.method || 'GET', query: Object.fromEntries(u.searchParams), cookie: jar,
        body: init.body ? JSON.parse(init.body) : undefined, xrw: (init.headers || {})['X-Requested-With'] === 'sakechibuk',
      });
      const c = r.headers['set-cookie'];
      if (c) jar = /Max-Age=0/.test(c) ? '' : c.split(';')[0];
      return { ok: r.status < 400, status: r.status, json: async () => r.body };
    };
    w.eval(appJs);
    const $ = (s) => w.document.querySelector(s);
    const $$ = (s) => Array.from(w.document.querySelectorAll(s));
    const text = () => w.document.getElementById('app').textContent;
    const settle = () => new Promise((r) => setTimeout(r, 25));
    const click = async (el) => { assert.ok(el, '누를 버튼이 화면에 없음'); el.click(); await settle(); await settle(); };
    const type = (sel, v) => { const el = $(sel); assert.ok(el, sel + ' 입력칸 없음'); el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
    const submit = async (sel) => { $(sel).dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await settle(); await settle(); };
    const btn = (label) => $$('button').find((b) => b.textContent.trim() === label);
    return { w, $, $$, text, settle, click, type, submit, btn, errors };
  }

  // 1) 운영자: 등록 → 수정 → 평가
  const op = browser();
  await op.settle();
  await test('[화면] 첫 화면에 사케치북 이름과 소개 문구, 체험용 문구 없음', async () => {
    assert.match(op.text(), /사케치북/); assert.match(op.text(), /기억력 한계를 극복하기 위한 사케 기록장/);
    assert.doesNotMatch(op.text(), /체험용|예시 데이터|민수|1234/);
  });
  await test('[화면] 운영자 로그인 → 첫 화면은 사케 목록, "관리"로 관리 화면', async () => {
    await op.click(op.btn('운영자 로그인'));
    op.type('#oid', 'ADMIN'); op.type('#opw', '880825');
    await op.submit('#opform');
    assert.ok(op.w.location.hash === '#/' || op.w.location.hash === '', '운영자 첫 화면은 사케 목록');
    assert.ok(op.$('.viewtabs') || /아직 등록된 사케가 없어요/.test(op.text()));
    assert.match(op.text(), /아무개/); assert.ok(op.$('.top .chip.op'));
    assert.match(op.text(), /관리 화면에서 첫 사케를 등록해 주세요/);
    await op.click(op.btn('관리'));
    assert.equal(op.w.location.hash, '#/admin');
    assert.match(op.text(), /새 사케 등록/); assert.match(op.text(), /아직 등록된 사케가 없어요/);
    assert.ok(!op.btn('시음하기'), '관리 화면에 시음하기 버튼이 없어야 함');
  });
  await test('[화면] 이름 없이 등록 누르면 안내 문구', async () => {
    await op.submit('#sakeform');
    assert.match(op.text(), /술 이름을 입력해 주세요/);
  });
  await test('[화면] 임시 이미지 고르고 사케 등록', async () => {
    await op.click(op.$$('.tmp')[2]);
    assert.equal(op.$$('.tmp')[2].getAttribute('aria-pressed'), 'true');
    op.type('#oname', '쿠보타 만주'); op.type('#orice', '쌀, 쌀누룩'); op.type('#opol', '33'); op.type('#oabv', '15');
    op.type('#osmv', '+1'); op.type('#obr', '아사히주조'); op.type('#oor', '니가타현');
    await op.submit('#sakeform');
    assert.match(op.text(), /등록된 사케 1/); assert.match(op.text(), /쿠보타 만주/);
    assert.equal(op.$('#oname').value, '', '등록 후 폼이 비워져야 함');
    const s = store._db.sakes[0];
    assert.equal(s.tint, '#b08a4a'); assert.equal(s.acid, '');
  });
  await test('[화면] 수정 버튼 → 폼에 기존 값이 채워지고 제목이 "사케 정보 수정"', async () => {
    await op.click(op.btn('수정'));
    await op.settle();
    assert.match(op.text(), /사케 정보 수정/);
    assert.equal(op.$('#oname').value, '쿠보타 만주'); assert.equal(op.$('#opol').value, '33'); assert.equal(op.$('#osmv').value, '+1');
    assert.equal(op.$$('.tmp')[2].getAttribute('aria-pressed'), 'true');
    assert.ok(op.btn('수정 내용 저장'));
  });
  await test('[화면] 값 고쳐서 저장 → 목록과 데이터에 반영, 새로 등록되지 않음', async () => {
    op.type('#oname', '쿠보타 만주 준마이다이긴조'); op.type('#oacid', '1.2'); op.type('#oabv', '');
    await op.submit('#sakeform');
    assert.equal(store._db.sakes.length, 1);
    const s = store._db.sakes[0];
    assert.equal(s.name, '쿠보타 만주 준마이다이긴조'); assert.equal(s.acid, '1.2'); assert.equal(s.abv, ''); assert.equal(s.polish, '33');
    assert.match(op.text(), /새 사케 등록/); assert.match(op.text(), /쿠보타 만주 준마이다이긴조/);
  });
  await test('[화면] 수정 취소하면 빈 등록 폼으로 돌아감', async () => {
    await op.click(op.btn('수정'));
    await op.settle();
    op.type('#oname', '저장 안 할 이름');
    await op.click(op.btn('수정 취소'));
    assert.match(op.text(), /새 사케 등록/); assert.equal(op.$('#oname').value, '');
    assert.equal(store._db.sakes[0].name, '쿠보타 만주 준마이다이긴조');
  });
  await test('[화면] 수정 중 다른 칸 입력값이 임시 이미지 클릭 후에도 유지', async () => {
    await op.click(op.btn('수정'));
    await op.settle();
    op.type('#obr', '아사히주조(주)');
    await op.click(op.$$('.tmp')[0]);
    assert.equal(op.$('#obr').value, '아사히주조(주)');
    await op.click(op.btn('수정 취소'));
  });
  const kubota = store._db.sakes[0].id;
  await test('[화면] 관리 화면에서 로고 → 목록 → 상세에도 "사케 정보 수정" 버튼', async () => {
    await op.click(op.$('.top .brand'));
    assert.equal(op.w.location.hash, '#/');
    assert.match(op.text(), /평가 0\/1/);
    await op.click(op.$('.card'));
    assert.equal(op.w.location.hash, '#/sake/' + kubota);
    assert.match(op.text(), /정미율\s*33%/); assert.match(op.text(), /산도1\.2/); assert.match(op.text(), /도수—/);
    assert.match(op.text(), /낮을수록 단맛/); assert.match(op.text(), /높을수록 신맛/);
    assert.ok(op.btn('사케 정보 수정'));
    assert.match(op.text(), /평균과 리뷰는 평가 후에 열려요/);
  });
  await test('[화면] 상세의 "사케 정보 수정" → 관리 화면 폼에 값이 채워짐', async () => {
    await op.click(op.btn('사케 정보 수정'));
    await op.settle();
    assert.equal(op.w.location.hash, '#/admin');
    assert.equal(op.$('#oname').value, '쿠보타 만주 준마이다이긴조');
    await op.click(op.btn('수정 취소'));
    await op.click(op.$('.top .brand'));
    await op.click(op.$('.card'));
  });
  await test('[화면] 운영자 평가: 슬라이더·한줄평 → 저장 → 비교 차트와 리뷰(운영자 뱃지)', async () => {
    await op.click(op.btn('내 평가 남기기'));
    assert.equal(op.w.location.hash, '#/sake/' + kubota + '/rate');
    const sl = op.$('#sl0'); sl.value = '1'; sl.dispatchEvent(new op.w.Event('input', { bubbles: true }));
    assert.equal(op.$('#w0').textContent, '드라이해요');
    op.type('#cmt', '드라이하고 깔끔');
    assert.equal(op.$('#cnt').textContent, '8 / 50');
    await op.click(op.$('[data-a="star"][data-n="4"]')); await op.click(op.btn('저장하고 결과 보기'));
    await op.settle();
    assert.equal(op.w.location.hash, '#/sake/' + kubota);
    assert.match(op.text(), /내 평가 vs 평균/); assert.match(op.text(), /리뷰 1/);
    assert.ok(op.$('.review.mine .chip.op')); assert.match(op.$('.review').textContent, /드라이하고 깔끔/);
    assert.match(op.$('.review .date').textContent, /^\d+월 \d+일 \d{2}:\d{2}$/);
    assert.equal(op.$$('.review .scores').length, 0, '리뷰에 점수 칩이 없어야 함');
  });

  // 2) 게스트: 가입 → 잠금 → 평가 → 비교
  const gu = browser();
  await gu.settle();
  await test('[화면] 게스트 가입 (한글 닉네임) → 목록', async () => {
    await gu.click(gu.btn('처음이에요'));
    gu.type('#nick', '하늘'); gu.type('#pw', 'sky1');
    await gu.submit('#authform');
    assert.match(gu.text(), /하늘님/); assert.match(gu.text(), /쿠보타 만주 준마이다이긴조/);
    assert.ok(!gu.btn('관리'), '게스트에게 관리 버튼이 보이면 안 됨');
  });
  await test('[화면] 게스트는 평가 전 잠금, 수정 버튼 없음', async () => {
    await gu.click(gu.$('.card'));
    assert.match(gu.text(), /평균과 리뷰는 평가 후에 열려요/); assert.match(gu.text(), /지금 1명이 평가했어요/);
    assert.ok(!gu.btn('사케 정보 수정'));
    assert.doesNotMatch(gu.text(), /드라이하고 깔끔/, '평가 전에 남의 리뷰가 보이면 안 됨');
  });
  await test('[화면] 게스트가 주소로 관리 화면(#/admin)에 들어가도 막힘', async () => {
    gu.w.location.hash = '#/admin'; await gu.settle(); await gu.settle();
    assert.doesNotMatch(gu.text(), /새 사케 등록/);
    gu.w.location.hash = '#/sake/' + kubota; await gu.settle(); await gu.settle();
  });
  await test('[화면] 게스트 평가 후 평균 비교 + 남의 리뷰 공개', async () => {
    await gu.click(gu.btn('내 평가 남기기'));
    const sl = gu.$('#sl0'); sl.value = '5'; sl.dispatchEvent(new gu.w.Event('input', { bubbles: true }));
    gu.type('#cmt', '<b>달다</b>');
    await gu.click(gu.$('[data-a="star"][data-n="4"]')); await gu.click(gu.btn('저장하고 결과 보기'));
    await gu.settle();
    assert.match(gu.text(), /나 포함 2명/); assert.match(gu.text(), /드라이하고 깔끔/);
    // 단맛: 나 5, 평균 (1+5)/2 = 3.0
    const row = gu.$$('.cmp > div')[0].textContent;
    assert.match(row, /단맛/); assert.match(row, /평균보다 높게/); assert.match(row, /5\s*\/\s*3\.0/);
    assert.equal(gu.$('.review.mine p').textContent, '<b>달다</b>', 'HTML 코드가 그대로 글자로 보여야 함 (실행되면 안 됨)');
    assert.ok(!gu.$('.review.mine p b'));
  });
  await test('[화면] 내 평가 수정 → 기존 값이 채워진 상태로 열림', async () => {
    await gu.click(gu.btn('내 평가 수정'));
    assert.equal(gu.$('#sl0').value, '5'); assert.equal(gu.$('#cmt').value, '<b>달다</b>');
    await gu.click(gu.btn('취소'));
  });
  await test('[화면] 목록으로 돌아가면 "평가 완료" 표시', async () => {
    await gu.click(gu.btn('← 목록'));
    assert.match(gu.text(), /\d+월 \d+일 마심/); assert.match(gu.text(), /평가 1\/1/);
  });
  await test('[화면] 로그아웃 → 다시 로그인 (틀린 비번 안내 → 맞는 비번 성공)', async () => {
    await gu.click(gu.btn('나가기'));
    assert.ok(gu.$('#authform'));
    gu.type('#nick', '하늘'); gu.type('#pw', 'wrong');
    await gu.submit('#authform'); await new Promise((r) => setTimeout(r, 500));
    assert.match(gu.text(), /닉네임 또는 비밀번호가 맞지 않아요/);
    gu.type('#pw', 'sky1');
    await gu.submit('#authform');
    assert.match(gu.text(), /하늘님/);
  });
  await test('[화면] 로그아웃 후 입장 화면은 항상 "로그인" 탭', async () => {
    await gu.click(gu.btn('나가기'));
    assert.equal(gu.$('.tabs [aria-selected="true"]').textContent, '로그인');
    gu.type('#nick', '하늘'); gu.type('#pw', 'sky1');
    await gu.submit('#authform');
  });
  await test('[화면] 운영자가 사케를 지우면 게스트 상세에서 안내', async () => {
    gu.w.location.hash = '#/sake/' + kubota; await gu.settle(); await gu.settle();
    await call(A.sakes, { method: 'DELETE', cookie: cookieFrom(await call(A.auth, { method: 'POST', body: { action: 'admin', id: 'ADMIN', password: '880825' } })), query: { id: String(kubota) } });
    gu.w.location.hash = '#/'; await gu.settle(); await gu.settle();
    gu.w.location.hash = '#/sake/' + kubota; await gu.settle(); await gu.settle();
    assert.match(gu.text(), /삭제된 사케/);
  });
  await test('[화면] 운영자 삭제는 두 번 눌러야 실행 (취소 가능)', async () => {
    await op.click(op.btn('← 목록'));
    await op.click(op.btn('관리'));
    await op.settle();
    op.type('#oname', '삭제 테스트');
    await op.submit('#sakeform');
    await op.click(op.btn('삭제'));
    assert.ok(op.btn('정말 삭제')); assert.match(op.text(), /평가와 리뷰도 모두 지워져요/);
    await op.click(op.btn('취소'));
    assert.equal(store._db.sakes.length, 1);
    await op.click(op.btn('삭제')); await op.click(op.btn('정말 삭제'));
    assert.equal(store._db.sakes.length, 0);
  });
  await test('[화면] 화면 스크립트 오류 없음', async () => {
    assert.deepEqual([...op.errors, ...gu.errors], []);
  });


  /* ================= 분류·검색·캘린더 (가상 브라우저) ================= */
  A = freshServer();
  routes['/api/me'] = A.me; routes['/api/auth'] = A.auth; routes['/api/sakes'] = A.sakes; routes['/api/sake'] = A.sake; routes['/api/rate'] = A.rate;
  {
    const ac = cookieFrom(await call(A.auth, { method: 'POST', body: { action: 'admin', id: 'ADMIN', password: '880825' } }));
    const mk = async (b) => (await call(A.sakes, { method: 'POST', cookie: ac, body: b })).body.sake.id;
    const s1 = await mk({ name: '닷사이 준마이다이긴조 45', brewer: '아사히주조', origin: '야마구치현', desc_title: '화려한 과일향의 준마이다이긴조', desc_body: '멜론과 백도 향이 먼저 올라와요.\n차게 마시면 가장 좋아요.' });
    const s2 = await mk({ name: '쿠보타 만주', brewer: '아사히주조', origin: '니가타현' });
    const s3 = await mk({ name: '핫카이산 특별본양조', brewer: '핫카이양조', origin: '니가타현' });
    const s4 = await mk({ name: '주욘다이 혼마루', brewer: '타카기주조', origin: '야마가타현' });
    const gc = cookieFrom(await call(A.auth, { method: 'POST', body: { action: 'signup', nickname: '바다', password: 'sea1' } }));
    await call(A.rate, { method: 'POST', cookie: gc, body: { stars: 4, sakeId: s1, v: [4, 3, 2, 2, 4], drankOn: '2026-09-15' } });
    await call(A.rate, { method: 'POST', cookie: gc, body: { stars: 4, sakeId: s3, v: [2, 2, 4, 4, 3], drankOn: '2026-09-15' } });
    await call(A.rate, { method: 'POST', cookie: gc, body: { stars: 4, sakeId: s2, v: [2, 3, 3, 3, 3], drankOn: '2026-09-03' } });

    const b = browser();
    await b.settle();
    b.type('#nick', '바다'); b.type('#pw', 'sea1');
    await b.submit('#authform');
    const names = () => b.$$('#results .card h3').map((x) => x.textContent);

    await test('[분류] 탭에 개수 표시: 전체 4 · 마신 사케 3 · 평가할 사케 1', async () => {
      const tabs = b.$$('.filters button').map((x) => x.textContent.replace(/\s+/g, ' ').trim());
      assert.deepEqual(tabs, ['전체 4', '마신 사케 3', '평가할 사케 1']);
    });
    await test('[분류] "평가할 사케" 탭 → 아직 안 마신 사케만', async () => {
      await b.click(b.$$('.filters button')[2]);
      assert.deepEqual(names(), ['주욘다이 혼마루']);
    });
    await test('[분류] "마신 사케" 탭 → 마신 사케만, 카드에 마신 날짜', async () => {
      await b.click(b.$$('.filters button')[1]);
      assert.equal(names().length, 3); assert.ok(!names().includes('주욘다이 혼마루'));
      assert.match(b.$('#results').textContent, /9월 15일 마심/); assert.match(b.$('#results').textContent, /9월 3일 마심/);
    });
    await test('[정렬] 최근 마신순 / 이름순', async () => {
      const sel = b.$('#sort'); sel.value = 'drank'; sel.dispatchEvent(new b.w.Event('change', { bubbles: true })); await b.settle();
      assert.equal(names()[2], '쿠보타 만주', '9월 3일이 마지막');
      sel.value = 'name'; sel.dispatchEvent(new b.w.Event('change', { bubbles: true })); await b.settle();
      assert.deepEqual(names(), ['닷사이 준마이다이긴조 45', '쿠보타 만주', '핫카이산 특별본양조']);
    });
    await test('[검색] 이름으로 찾기 (입력 중에도 입력칸이 유지됨)', async () => {
      await b.click(b.$$('.filters button')[0]);
      const q = b.$('#q');
      q.value = '쿠보'; q.dispatchEvent(new b.w.Event('input', { bubbles: true })); await b.settle();
      assert.deepEqual(names(), ['쿠보타 만주']);
      assert.equal(b.$('#q'), q, '검색할 때 입력칸이 새로 그려지면 글자 입력이 끊김');
      assert.match(b.$('#results').textContent, /검색 결과 1개/);
      assert.ok(!b.$('#qclear').hidden, '입력하면 지우기(×) 버튼이 보여야 함');
    });
    await test('[검색] 양조장으로 찾기: "아사히" → 아사히주조 2병', async () => {
      await b.click(b.$$('.toolbar .seg button').find((x) => x.textContent === '양조장'));
      const q = b.$('#q');
      q.value = '아사히'; q.dispatchEvent(new b.w.Event('input', { bubbles: true })); await b.settle();
      assert.equal(names().length, 2); assert.ok(names().every((n) => /닷사이|쿠보타/.test(n)));
    });
    await test('[검색] 이름 범위에서 양조장 이름으로 찾으면 결과 없음 + 지우기', async () => {
      await b.click(b.$$('.toolbar .seg button').find((x) => x.textContent === '이름'));
      assert.match(b.$('#results').textContent, /"아사히"에 맞는 사케가 없어요/);
      await b.click(b.btn('검색어 지우기'));
      assert.equal(names().length, 4); assert.equal(b.$('#q').value, '');
    });
    await test('[검색] 전체 범위는 원산지도 찾음 ("니가타" → 2병)', async () => {
      await b.click(b.$$('.toolbar .seg button').find((x) => x.textContent === '전체'));
      const q = b.$('#q'); q.value = '니가타'; q.dispatchEvent(new b.w.Event('input', { bubbles: true })); await b.settle();
      assert.equal(names().length, 2);
      await b.click(b.$('.searchbox .clear'));
    });
    await test('[상세] 양조장 이름 누르면 그 양조장 사케 모아보기', async () => {
      await b.click(b.$$('#results .card').find((c) => /쿠보타/.test(c.textContent)));
      await b.click(b.$('.inlink'));
      assert.equal(b.w.location.hash, '#/');
      assert.equal(b.$('#q').value, '아사히주조');
      assert.equal(names().length, 2);
      await b.click(b.$('.searchbox .clear'));
    });
    await test('[상세] "더 보기" 문구 없이 양조장 · 원산지가 각각 링크', async () => {
      await b.click(b.$$('#results .card').find((c) => /닷사이/.test(c.textContent)));
      const links = b.$$('.inlink').map((x) => x.textContent);
      assert.deepEqual(links, ['아사히주조', '야마구치현']);
      assert.doesNotMatch(b.text(), /더 보기/);
    });
    await test('[상세] 술 설명: 제목(h3, 굵은 큰 글씨)과 본문(줄바꿈 유지)으로 나뉨', async () => {
      const t = b.$('.desc .desc-title'), body = b.$('.desc .desc-body');
      assert.ok(t && body);
      assert.equal(t.tagName, 'H3'); assert.equal(t.textContent, '화려한 과일향의 준마이다이긴조');
      assert.equal(body.textContent, '멜론과 백도 향이 먼저 올라와요.\n차게 마시면 가장 좋아요.');
      const order = Array.from(b.$('#app').children).map((x) => x.className);
      assert.ok(order.indexOf('desc') > order.indexOf('spec'), '설명은 정보표 아래에');
    });
    await test('[상세] 원산지 누르면 그 원산지 사케 모아보기 (검색 범위 "원산지")', async () => {
      await b.click(b.$$('.inlink')[1]);
      assert.equal(b.w.location.hash, '#/');
      assert.equal(b.$('#q').value, '야마구치현');
      assert.equal(b.$('.toolbar .seg button[aria-pressed="true"]').textContent, '원산지');
      assert.deepEqual(names(), ['닷사이 준마이다이긴조 45']);
      assert.equal(b.$('#q').placeholder, '원산지로 찾기');
    });
    await test('[검색] 원산지 범위로 직접 찾기 ("니가타" → 2병)', async () => {
      const q = b.$('#q'); q.value = '니가타'; q.dispatchEvent(new b.w.Event('input', { bubbles: true })); await b.settle();
      assert.equal(names().length, 2);
      await b.click(b.$('.searchbox .clear'));
      await b.click(b.$$('.toolbar .seg button').find((x) => x.textContent === '전체'));
    });
    await test('[상세] 설명이 없는 사케는 설명 칸이 안 보임', async () => {
      await b.click(b.$$('#results .card').find((c) => /쿠보타/.test(c.textContent)));
      assert.equal(b.$('.desc'), null);
    });
    await test('[로고] 상세 화면에도 상단 로고 줄이 있고, 누르면 홈 목록으로', async () => {
      assert.ok(b.$('.top .brand .seal img'));
      await b.click(b.$('.top .brand'));
      assert.equal(b.w.location.hash, '#/');
      assert.ok(b.$('#results'));
    });
    await test('[로고] "사케치북" 글자를 눌러도 홈으로, 검색어·분류 초기화', async () => {
      await b.click(b.$$('.filters button')[1]);
      const q = b.$('#q'); q.value = '쿠보'; q.dispatchEvent(new b.w.Event('input', { bubbles: true })); await b.settle();
      await b.click(b.$('.top .brand h1'));
      assert.equal(b.$('#q').value, '');
      assert.equal(b.$('.filters button[aria-selected="true"]').textContent.replace(/\s+\d+$/, ''), '전체');
      assert.equal(names().length, 4);
    });
    await test('[로고] 평가 화면에서 로고 누르면 홈으로', async () => {
      await b.click(b.$$('#results .card').find((c) => /주욘다이/.test(c.textContent)));
      await b.click(b.btn('내 평가 남기기'));
      assert.match(b.w.location.hash, /\/rate$/);
      await b.click(b.$('.top .brand'));
      assert.equal(b.w.location.hash, '#/');
    });
    await test('[캘린더] "마신 날짜별" → 이번 달 달력과 요일 표시', async () => {
      await b.click(b.btn('마신 날짜별'));
      const now = new Date();
      assert.match(b.$('.calhead').textContent, new RegExp(now.getFullYear() + '년 ' + (now.getMonth() + 1) + '월'));
      assert.equal(b.$$('.calgrid .wd').map((x) => x.textContent).join(''), '일월화수목금토');
      assert.equal(b.$$('.day').length, new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate());
      assert.ok(b.$('.day.today'));
    });
    await test('[캘린더] 2026년 9월로 이동 → 15일 밑에 2, 3일 밑에 1', async () => {
      const now = new Date();
      let diff = (now.getFullYear() - 2026) * 12 + now.getMonth() - 8;
      while (diff-- > 0) await b.click(b.$('[data-a="month"][data-d="-1"]'));
      assert.match(b.$('.calhead').textContent, /2026년 9월/);
      assert.match(b.$('.calhead').textContent, /이번 달 3병 평가/);
      const cell = (d) => b.$('.day[data-d="2026-09-' + d + '"]');
      assert.equal(cell('15').querySelector('.dc').textContent, '2');
      assert.equal(cell('03').querySelector('.dc').textContent, '1');
      assert.equal(cell('04').querySelector('.dc').textContent, '');
      assert.ok(cell('15').classList.contains('has')); assert.ok(!cell('04').classList.contains('has'));
      // 2026-09-01은 화요일 → 앞에 빈칸 2개
      assert.equal(b.$('.calgrid').children[7 + 2], cell('01'));
    });
    await test('[캘린더] 날짜 안 고르면 그 달 전체를 날짜별로 모아서 보여줌', async () => {
      assert.match(b.text(), /9월에 마신 사케 3/);
      const groups = b.$$('.daygroup .dg').map((x) => x.textContent);
      assert.deepEqual(groups, ['9월 15일 (화) · 2병', '9월 3일 (목) · 1병']);
    });
    await test('[캘린더] 15일 누르면 그날 마신 2병만, 다시 누르면 해제', async () => {
      await b.click(b.$('.day[data-d="2026-09-15"]'));
      assert.match(b.text(), /9월 15일 \(화\) 마신 사케 2/);
      const minis = b.$$('.mini b').map((x) => x.textContent);
      assert.deepEqual(minis.sort(), ['닷사이 준마이다이긴조 45', '핫카이산 특별본양조']);
      await b.click(b.$('.day[data-d="2026-09-15"]'));
      assert.match(b.text(), /9월에 마신 사케 3/);
    });
    await test('[캘린더] 빈 날 누르면 안내, 사케 누르면 상세로', async () => {
      await b.click(b.$('.day[data-d="2026-09-20"]'));
      assert.match(b.text(), /이 날은 평가한 사케가 없어요/);
      await b.click(b.$('.day[data-d="2026-09-03"]'));
      await b.click(b.$('.mini'));
      assert.match(b.w.location.hash, /^#\/sake\/\d+$/);
      assert.match(b.text(), /9월 3일 \(목\)에 마셨어요/);
    });
    await test('[마신 날짜] 평가 화면 기본값은 오늘, 미래 날짜는 막힘', async () => {
      await b.click(b.btn('← 목록'));
      await b.click(b.btn('목록'));
      await b.click(b.$$('.filters button')[2]);
      await b.click(b.$('#results .card'));
      await b.click(b.btn('내 평가 남기기'));
      const di = b.$('#drank');
      const now = new Date(), z = (x) => String(x).padStart(2, '0');
      const today = now.getFullYear() + '-' + z(now.getMonth() + 1) + '-' + z(now.getDate());
      assert.equal(di.value, today); assert.equal(di.max, today);
      assert.match(b.$('#drankText').textContent, /^\d{4}년 \d{1,2}월 \d{1,2}일 \([일월화수목금토]\)$/);
      di.value = '2999-01-01'; di.dispatchEvent(new b.w.Event('input', { bubbles: true }));
      await b.click(b.$('[data-a="star"][data-n="4"]')); await b.click(b.btn('저장하고 결과 보기'));
      assert.match(b.$('#rateerr').textContent, /미래 날짜/);
      assert.ok(!b.$('#rateerr').hidden);
    });
    await test('[마신 날짜] 날짜 바꿔 저장 → 상세와 캘린더에 반영', async () => {
      const di = b.$('#drank'); di.value = '2026-09-03'; di.dispatchEvent(new b.w.Event('input', { bubbles: true }));
      assert.equal(b.$('#drankText').textContent, '2026년 9월 3일 (목)', '빈 괄호 없이 요일까지');
      await b.click(b.$('[data-a="star"][data-n="4"]')); await b.click(b.btn('저장하고 결과 보기')); await b.settle();
      assert.match(b.text(), /9월 3일 \(목\)에 마셨어요/);
      await b.click(b.btn('← 목록'));
      await b.click(b.btn('마신 날짜별'));
      if (b.btn('오늘로')) await b.click(b.btn('오늘로'));
      const now = new Date(); let diff = (now.getFullYear() - 2026) * 12 + now.getMonth() - 8;
      while (diff-- > 0) await b.click(b.$('[data-a="month"][data-d="-1"]'));
      assert.equal(b.$('.day[data-d="2026-09-03"] .dc').textContent, '2');
      await b.click(b.btn('오늘로'));
      assert.match(b.$('.calhead').textContent, new RegExp((new Date().getMonth() + 1) + '월'));
    });
    await test('[마신 날짜] "오늘" 버튼, 기존 평가 수정 시 저장된 날짜가 채워짐', async () => {
      await b.click(b.btn('목록'));
      await b.click(b.$$('.filters button')[1]);
      await b.click(b.$$('#results .card').find((c) => /쿠보타/.test(c.textContent)));
      await b.click(b.btn('내 평가 수정'));
      assert.equal(b.$('#drank').value, '2026-09-03');
      await b.click(b.btn('오늘'));
      assert.notEqual(b.$('#drank').value, '2026-09-03');
      await b.click(b.btn('취소'));
    });
    const s5 = await mk({ name: '야마가타 마사무네', brewer: '미토베주조', origin: '야마가타현' });
    const gc2 = cookieFrom(await call(A.auth, { method: 'POST', body: { action: 'signup', nickname: '산', password: 'mnt1' } }));
    await call(A.rate, { method: 'POST', cookie: gc2, body: { sakeId: s5, v: [3, 3, 3, 3, 3], stars: 5, comment: '최고' } });
    await test('[별점] 별점을 안 고르면 저장 안 되고 안내', async () => {
      b.w.location.hash = '#/sake/' + s5 + '/rate'; await b.settle(); await b.settle(); await b.settle();
      assert.equal(b.$$('.starpick .st').length, 5);
      assert.match(b.$('#swd').textContent, /별을 눌러 골라 주세요/);
      assert.equal(b.$$('.starpick .hz').length, 10, '별마다 왼쪽(반 개)·오른쪽(한 개) 버튼');
      await b.click(b.btn('저장하고 결과 보기'));
      assert.match(b.$('#rateerr').textContent, /만족도 별점을 골라 주세요/);
      assert.match(b.w.location.hash, /\/rate$/);
    });
    await test('[별점] 별 2개 누르면 2개 칠해지고 "아쉬웠어요", 저장', async () => {
      await b.click(b.$('[data-a="star"][data-n="2"]'));
      assert.equal(b.$$('.starpick .st.on').length, 2);
      assert.equal(b.$('[data-a="star"][data-n="2"]').getAttribute('aria-checked'), 'true');
      assert.equal(b.$('#swd').textContent, '2점 · 아쉬웠어요');
      assert.ok(b.$('#rateerr').hidden);
      await b.click(b.btn('저장하고 결과 보기')); await b.settle();
      assert.equal(b.w.location.hash, '#/sake/' + s5);
    });
    await test('[별점] 내 만족도 vs 평균 만족도, 리뷰 닉네임 옆 별점', async () => {
      const sat = b.$('.satis').textContent;
      assert.match(sat, /내 만족도\s*★+\s*2/); assert.match(sat, /평균 만족도 \(2명\)/); assert.match(sat, /3\.5/);
      assert.equal(b.$$('.satis .stars')[1].querySelectorAll('.st.half').length, 1, '3.5점은 반 별');
      const rv = b.$$('.review').map((r) => [r.querySelector('.head b').textContent, r.querySelectorAll('.stars.sm .st.on').length]);
      assert.deepEqual(rv, [['바다', 2], ['산', 5]]);
      const head = b.$$('.review')[1].querySelector('.head');
      assert.ok(head.querySelector('b').compareDocumentPosition(head.querySelector('.stars')) & 4, '별점은 닉네임 뒤에');
    });
    await test('[별점] 다시 평가 열면 저장한 별점이 채워져 있음', async () => {
      await b.click(b.btn('내 평가 수정'));
      assert.equal(b.$$('.starpick .st.on').length, 2);
      await b.click(b.btn('취소'));
    });
    await test('[별점] 목록 카드에 내 별점, "내 별점순" 정렬', async () => {
      await b.click(b.$('.top .brand'));
      const card = b.$$('#results .card').find((c) => /야마가타/.test(c.textContent));
      assert.match(card.querySelector('.mystar').textContent, /★ 2/);
      const sel = b.$('#sort'); sel.value = 'stars'; sel.dispatchEvent(new b.w.Event('change', { bubbles: true })); await b.settle();
      assert.equal(names()[names().length - 1], '야마가타 마사무네', '별 2개는 별 4개들보다 뒤');
    });
    await test('[별점] 반 개: 별 4개째 왼쪽 절반 → 3.5점, 저장하면 리뷰·카드에 반 별', async () => {
      await b.click(b.$$('#results .card').find((c) => /야마가타/.test(c.textContent)));
      await b.click(b.btn('내 평가 수정'));
      await b.click(b.$('[data-a="star"][data-n="3.5"]'));
      assert.equal(b.$$('.starpick .st.on').length, 3); assert.equal(b.$$('.starpick .st.half').length, 1);
      assert.equal(b.$('.starpick .st.half').getAttribute('data-k'), '4');
      assert.equal(b.$('#swd').textContent, '3.5점 · 좋았어요');
      assert.equal(b.$('[data-a="star"][data-n="3.5"]').getAttribute('aria-checked'), 'true');
      await b.click(b.btn('저장하고 결과 보기')); await b.settle();
      assert.match(b.$('.satis').textContent, /내 만족도\s*★+\s*3\.5/);
      const mine = b.$('.review.mine .stars.sm');
      assert.equal(mine.querySelectorAll('.st.on').length, 3); assert.equal(mine.querySelectorAll('.st.half').length, 1);
      assert.match(b.$('.satis').textContent, /4\.3|4\.25/, '평균 (3.5+5)/2 = 4.25');
      await b.click(b.$('.top .brand'));
      assert.match(b.$$('#results .card').find((c) => /야마가타/.test(c.textContent)).querySelector('.mystar').textContent, /★ 3\.5/);
      await b.click(b.$$('#results .card').find((c) => /야마가타/.test(c.textContent)));
      await b.click(b.btn('내 평가 수정'));
      assert.equal(b.$$('.starpick .st.half').length, 1, '다시 열어도 반 별 유지');
      await b.click(b.btn('취소'));
      await b.click(b.$('.top .brand'));
    });
    await test('[이전/다음] 목록 순서대로 이동, 처음·마지막 표시, 위쪽 작은 버튼도 동작', async () => {
      const sel = b.$('#sort'); sel.value = 'name'; sel.dispatchEvent(new b.w.Event('change', { bubbles: true })); await b.settle();
      const order = names();
      await b.click(b.$$('#results .card')[0]);
      assert.match(b.$('.pmini').textContent, new RegExp('1 / ' + order.length));
      assert.ok(b.$('.pmini [aria-label="이전 술"]').disabled);
      assert.match(b.$('.pager .pg.prev').textContent, /처음이에요/);
      assert.match(b.$('.pager .pg.next').textContent, new RegExp(order[1]));
      await b.click(b.$('.pager .pg.next')); await b.settle();
      assert.equal(b.$('.name').textContent, order[1]);
      assert.match(b.$('.pmini').textContent, new RegExp('2 / ' + order.length));
      await b.click(b.$('.pmini [aria-label="이전 술"]')); await b.settle();
      assert.equal(b.$('.name').textContent, order[0]);
      for (let i = 1; i < order.length; i++) { await b.click(b.$('.pmini [aria-label="다음 술"]')); await b.settle(); }
      assert.equal(b.$('.name').textContent, order[order.length - 1]);
      assert.ok(b.$('.pmini [aria-label="다음 술"]').disabled);
      assert.match(b.$('.pager .pg.next').textContent, /마지막이에요/);
    });
    await test('[이전/다음] 검색 결과 안에서만 이동 ("아사히" 양조장 검색 → 2병)', async () => {
      await b.click(b.$('.top .brand'));
      await b.click(b.$$('.toolbar .seg button').find((x) => x.textContent === '양조장'));
      const q = b.$('#q'); q.value = '아사히'; q.dispatchEvent(new b.w.Event('input', { bubbles: true })); await b.settle();
      await b.click(b.$$('#results .card')[0]);
      assert.match(b.$('.pmini').textContent, /1 \/ 2/);
      await b.click(b.$('.top .brand'));
    });
    await test('[이전/다음] 주소로 바로 들어와도 이전/다음이 보임', async () => {
      const b2 = browser(); await b2.settle();
      b2.type('#nick', '바다'); b2.type('#pw', 'sea1'); await b2.submit('#authform');
      b2.w.location.hash = '#/sake/' + s2; await b2.settle(); await b2.settle(); await b2.settle();
      assert.ok(b2.$('.pager')); assert.ok(b2.$('.pmini'));
      assert.deepEqual(b2.errors, []);
    });
    await test('[관리] 운영자 목록 검색', async () => {
      const o = browser(); await o.settle();
      await o.click(o.btn('운영자 로그인'));
      o.type('#oid', 'ADMIN'); o.type('#opw', '880825'); await o.submit('#opform');
      await o.click(o.btn('관리'));
      const q = o.$('#aq'); q.value = '핫카이'; q.dispatchEvent(new o.w.Event('input', { bubbles: true })); await o.settle();
      assert.deepEqual(o.$$('#alist .oprow b').map((x) => x.textContent), ['핫카이산 특별본양조']);
      assert.equal(o.$('#aq'), q);
      assert.deepEqual(o.errors, []);
    });
    await test('[관리] 등록·수정 폼에 술 설명 제목/본문 칸, 저장하면 반영', async () => {
      const o = browser(); await o.settle();
      await o.click(o.btn('운영자 로그인'));
      o.type('#oid', 'ADMIN'); o.type('#opw', '880825'); await o.submit('#opform');
      await o.click(o.btn('관리'));
      assert.ok(o.$('#odt')); assert.equal(o.$('#odb').tagName, 'TEXTAREA');
      assert.equal(o.$('#odt').maxLength, 40); assert.equal(o.$('#odb').maxLength, 1000);
      const row = o.$$('#alist .oprow').find((r) => /핫카이산/.test(r.textContent));
      await o.click(Array.from(row.querySelectorAll('button')).find((x) => x.textContent === '수정'));
      await o.settle();
      assert.equal(o.$('#odt').value, ''); assert.equal(o.$('#odb').value, '');
      o.type('#odt', '데워 마셔도 좋은 일상주'); o.type('#odb', '깔끔하고 드라이해요.\n안주와 두루 잘 맞아요.');
      await o.submit('#sakeform');
      const s = store._db.sakes.find((x) => /핫카이산/.test(x.name));
      assert.equal(s.desc_title, '데워 마셔도 좋은 일상주'); assert.equal(s.desc_body, '깔끔하고 드라이해요.\n안주와 두루 잘 맞아요.');
      await o.click(Array.from(o.$$('#alist .oprow').find((r) => /핫카이산/.test(r.textContent)).querySelectorAll('button')).find((x) => x.textContent === '수정'));
      await o.settle();
      assert.equal(o.$('#odt').value, '데워 마셔도 좋은 일상주', '수정 폼에 저장된 설명이 채워져야 함');
      o.type('#odt', '바꾸지 않을 값');
      await o.click(o.btn('수정 취소'));
      assert.equal(o.$('#odt').value, '');
      assert.deepEqual(o.errors, []);
    });
    await test('[화면] 분류·검색·캘린더 중 스크립트 오류 없음', async () => { assert.deepEqual(b.errors, []); });
  }

  /* ================= 배포 파일 점검 ================= */
  await test('[배포] 예시 데이터·임시 계정·운영자 비밀번호가 코드에 없음', async () => {
    const files = ['public/app.js', 'public/index.html', 'public/style.css', 'api/auth.js', 'lib/auth.js', 'supabase/schema.sql'];
    files.forEach((f) => {
      const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
      assert.doesNotMatch(t, /880825/, f + ' 에 비밀번호');
      assert.doesNotMatch(t, /민수|지은|도현|서윤|체험용/, f + ' 에 예시 데이터');
    });
  });

  /* ================= 결과 ================= */
  const fail = results.filter((r) => !r[0]);
  results.forEach(([ok, name, e]) => console.log((ok ? '  ✓ ' : '  ✗ ') + name + (ok ? '' : '\n      → ' + (e && e.message))));
  console.log(`\n${results.length - fail.length} / ${results.length} 통과`);
  process.exit(fail.length ? 1 : 0);
})();
