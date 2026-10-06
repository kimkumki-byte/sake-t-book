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
    home: require('../api/home'), ranking: require('../api/ranking'), my: require('../api/my'), wish: require('../api/wish'),
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
  const routes = {};
  const setRoutes = (X) => { ['me', 'auth', 'sakes', 'sake', 'rate', 'home', 'ranking', 'my', 'wish'].forEach((k) => { routes['/api/' + k] = X[k]; }); };
  setRoutes(A);

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
    const tab = async (label) => { await click($$('.tabbar .tb').find((x) => x.textContent.trim() === label)); await settle(); };
    const logout = async () => { await tab('MY'); await settle(); await click($('[data-a="logout"]')); };
    const toAdmin = async () => { await tab('MY'); await settle(); await click($('[data-h="#/admin"]')); await settle(); };
    return { w, $, $$, text, settle, click, type, submit, btn, tab, logout, toAdmin, errors };
  }

  // 1) 운영자: 등록 → 수정 → 평가
  const op = browser();
  await op.settle();
  await test('[화면] 첫 화면에 사케치북 이름과 소개 문구, 체험용 문구 없음', async () => {
    assert.match(op.text(), /사케치북/); assert.match(op.text(), /기억력 한계를 극복하기 위한 사케 기록장/);
    assert.doesNotMatch(op.text(), /체험용|예시 데이터|민수|1234/);
  });
  await test('[화면] 운영자 로그인 → 첫 화면은 홈, MY의 운영자 메뉴로 관리 화면', async () => {
    await op.click(op.btn('운영자 로그인'));
    op.type('#oid', 'ADMIN'); op.type('#opw', '880825');
    await op.submit('#opform');
    assert.ok(op.w.location.hash === '#/' || op.w.location.hash === '', '운영자 첫 화면은 홈');
    assert.ok(op.$('.lvcard')); assert.ok(op.$('.tabbar'));
    assert.match(op.text(), /아무개/); assert.ok(op.$('.lvcard .chip.op'));
    await op.tab('테이스팅');
    assert.match(op.text(), /관리 화면에서 첫 사케를 등록해 주세요/);
    await op.toAdmin();
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
  await test('[화면] 관리 화면 → 테이스팅 → 상세에도 "사케 정보 수정" 버튼', async () => {
    await op.tab('테이스팅');
    assert.equal(op.w.location.hash, '#/tasting');
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
    await op.tab('테이스팅');
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
    await gu.tab('테이스팅');
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
    await gu.logout();
    assert.ok(gu.$('#authform'));
    gu.type('#nick', '하늘'); gu.type('#pw', 'wrong');
    await gu.submit('#authform'); await new Promise((r) => setTimeout(r, 500));
    assert.match(gu.text(), /닉네임 또는 비밀번호가 맞지 않아요/);
    gu.type('#pw', 'sky1');
    await gu.submit('#authform');
    assert.match(gu.text(), /하늘님/);
  });
  await test('[화면] 로그아웃 후 입장 화면은 항상 "로그인" 탭', async () => {
    await gu.logout();
    assert.equal(gu.$('.tabs [aria-selected="true"]').textContent, '로그인');
    assert.ok(!gu.$('.tabbar'), '로그아웃하면 하단 메뉴가 없어야 함');
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
    await op.toAdmin();
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
  setRoutes(A);
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
    await b.tab('테이스팅');
    const names = () => b.$$('#results .card h3').map((x) => x.textContent);

    await test('[분류] 탭에 개수 표시: 전체 4 · 마신 사케 3 · 평가할 사케 1', async () => {
      const tabs = b.$$('.filters button').map((x) => x.textContent.replace(/\s+/g, ' ').trim());
      assert.deepEqual(tabs, ['전체 4', '마신 사케 3', '평가할 사케 1', '찜 0']);
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
      assert.equal(b.w.location.hash, '#/tasting');
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
      assert.equal(b.w.location.hash, '#/tasting');
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
    await test('[로고] 상세 화면에도 상단 로고 줄이 있고, 누르면 홈으로', async () => {
      assert.ok(b.$('.top .brand .seal img'));
      await b.click(b.$('.top .brand'));
      assert.ok(b.w.location.hash === '#/' || b.w.location.hash === '');
      assert.ok(b.$('.lvcard'));
    });
    await test('[로고] "사케치북" 글자를 눌러도 홈으로, 테이스팅의 검색어는 그대로', async () => {
      await b.tab('테이스팅');
      const q = b.$('#q'); q.value = '쿠보'; q.dispatchEvent(new b.w.Event('input', { bubbles: true })); await b.settle();
      await b.click(b.$('.top .brand h1'));
      assert.ok(b.$('.lvcard'));
      await b.tab('테이스팅');
      assert.equal(b.$('#q').value, '쿠보');
      await b.click(b.$('.searchbox .clear'));
    });
    await test('[하단 메뉴] 평가 입력 화면에서는 숨김, 로고 누르면 홈으로', async () => {
      await b.click(b.$$('#results .card').find((c) => /주욘다이/.test(c.textContent)));
      assert.ok(b.$('.tabbar'), '상세 화면에는 하단 메뉴');
      assert.equal(b.$('.tabbar .tb.on').textContent.trim(), '테이스팅');
      await b.click(b.btn('내 평가 남기기'));
      assert.match(b.w.location.hash, /\/rate$/);
      assert.ok(!b.$('.tabbar'), '평가 입력 화면에는 하단 메뉴가 없어야 함');
      await b.click(b.$('.top .brand'));
      assert.ok(b.w.location.hash === '#/' || b.w.location.hash === '');
      await b.tab('테이스팅');
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
      await b.tab('테이스팅'); await b.click(b.$$('.filters button')[0]);
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
      await b.tab('테이스팅');
      assert.match(b.$$('#results .card').find((c) => /야마가타/.test(c.textContent)).querySelector('.mystar').textContent, /★ 3\.5/);
      await b.click(b.$$('#results .card').find((c) => /야마가타/.test(c.textContent)));
      await b.click(b.btn('내 평가 수정'));
      assert.equal(b.$$('.starpick .st.half').length, 1, '다시 열어도 반 별 유지');
      await b.click(b.btn('취소'));
      await b.tab('테이스팅');
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
      await b.tab('테이스팅');
      await b.click(b.$$('.toolbar .seg button').find((x) => x.textContent === '양조장'));
      const q = b.$('#q'); q.value = '아사히'; q.dispatchEvent(new b.w.Event('input', { bubbles: true })); await b.settle();
      await b.click(b.$$('#results .card')[0]);
      assert.match(b.$('.pmini').textContent, /1 \/ 2/);
      await b.tab('테이스팅');
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
      await o.toAdmin();
      const q = o.$('#aq'); q.value = '핫카이'; q.dispatchEvent(new o.w.Event('input', { bubbles: true })); await o.settle();
      assert.deepEqual(o.$$('#alist .oprow b').map((x) => x.textContent), ['핫카이산 특별본양조']);
      assert.equal(o.$('#aq'), q);
      assert.deepEqual(o.errors, []);
    });
    await test('[관리] 등록·수정 폼에 술 설명 제목/본문 칸, 저장하면 반영', async () => {
      const o = browser(); await o.settle();
      await o.click(o.btn('운영자 로그인'));
      o.type('#oid', 'ADMIN'); o.type('#opw', '880825'); await o.submit('#opform');
      await o.toAdmin();
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

  /* ================= 레벨·뱃지·랭킹·친구 계산 (lib/core) ================= */
  const core = require('../lib/core');
  await test('[레벨] 쌀 → 누룩 → 보통주 → 혼죠조 → 긴죠 → 다이긴죠 → 준마이다이긴죠 → 토우지', async () => {
    assert.deepEqual(core.LEVELS.map((l) => l.title), ['쌀', '누룩', '보통주', '혼죠조', '긴죠', '다이긴죠', '준마이다이긴죠', '토우지']);
    const L = (n) => core.levelOf(n);
    assert.equal(L(0).lv, 1); assert.equal(L(0).title, '쌀'); assert.equal(L(0).next.title, '누룩'); assert.equal(L(0).next.remain, 3);
    assert.equal(L(2).lv, 1); assert.equal(L(2).next.remain, 1);
    assert.deepEqual([3, 6, 10, 15, 25, 40, 60].map((n) => L(n).title), ['누룩', '보통주', '혼죠조', '긴죠', '다이긴죠', '준마이다이긴죠', '토우지']);
    assert.equal(L(59).lv, 7); assert.equal(L(60).lv, 8); assert.equal(L(60).next, null); assert.equal(L(99).progress, 1);
    assert.equal(L(8).progress, 0.5, '보통주(6)→혼죠조(10) 사이 8병은 절반');
  });
  await test('[뱃지] 15개, "완주" 없음, 조건대로 정확히 계산', async () => {
    assert.equal(core.BADGES.length, 15); assert.ok(!core.BADGES.some((b) => b[1] === '완주'));
    const sakes = [
      { id: 1, brewer: '가', origin: 'x', polish: '45', smv: '+6' }, { id: 2, brewer: '가', origin: 'y', polish: '50', smv: '+5' },
      { id: 3, brewer: ' 가 ', origin: 'z', polish: '55', smv: '-1' }, { id: 4, brewer: '나', origin: 'w', polish: '', smv: '' },
      { id: 5, brewer: '다', origin: 'v', polish: '40', smv: '+5.5' }, { id: 6, brewer: '라', origin: 'V', polish: '35', smv: '-3' },
    ];
    const R = (id, sid, nick, stars, comment, d) => ({ id, sake_id: sid, nickname: nick, stars, comment, drank_on: d, v: [3, 3, 3, 3, 3] });
    const ratings = [
      R(1, 1, '남', 4, '', '2026-09-01'),
      R(2, 1, 'me', 5, 'a', '2026-09-05'), R(3, 2, 'me', 2, '', '2026-09-05'), R(4, 3, 'me', 1.5, 'c', '2026-09-05'),
      R(5, 4, 'me', 2, ' ', '2026-09-12'), R(6, 5, 'me', null, '', '2026-09-19'), R(7, 6, 'me', 4, '', '2026-09-26'),
      R(8, 2, '남', 3, '', '2026-09-30'),
    ];
    const p = core.profile('me', sakes, ratings);
    const got = p.badges.filter((b) => b.got).map((b) => b.id).sort();
    assert.deepEqual(got, ['critic3', 'dry3', 'first', 'origin5', 'perfect', 'pioneer3', 'regular3', 'session3', 'weekend5', 'weekly4'].sort());
    const by = Object.fromEntries(p.badges.map((b) => [b.id, b]));
    assert.equal(by.comment10.cur, 2, '공백만 있는 한줄평은 안 셈');
    assert.equal(by.brewer5.cur, 4, '앞뒤 공백만 다른 같은 양조장은 하나로');
    assert.equal(by.origin5.cur, 5, '대소문자만 다른 같은 원산지는 하나로 (x,y,z,w,v)');
    assert.equal(by.polish5.cur, 4); assert.equal(by.sweet3.cur, 2); assert.equal(by.month10.cur, 6);
    assert.equal(by.pioneer3.cur, 3, '목표까지만 표시 (실제 5)');
    assert.equal(p.count, 6); assert.equal(p.level.title, '보통주'); assert.equal(p.avg_stars, 2.9); assert.equal(p.badges_got, 10);
    // 주 사이에 한 주가 비면 연속이 끊김
    const gap = [R(1, 1, 'g', 3, '', '2026-09-07'), R(2, 2, 'g', 3, '', '2026-09-14'), R(3, 3, 'g', 3, '', '2026-09-28'), R(4, 4, 'g', 3, '', '2026-10-05')];
    assert.equal(core.profile('g', sakes, gap).badges.find((b) => b.id === 'weekly4').cur, 2);
  });
  await test('[랭킹] 기간: 주간은 월~일, 월간은 1일~말일, 지난 기간, 미래는 안 됨, 기본은 전체', async () => {
    const r = (p, o, d) => { const x = core.rangeFor(p, o, d); return [x.start, x.end]; };
    assert.deepEqual(r('week', 0, '2026-10-06'), ['2026-10-05', '2026-10-11']);
    assert.deepEqual(r('week', 0, '2026-10-11'), ['2026-10-05', '2026-10-11'], '일요일도 그 주');
    assert.deepEqual(r('week', -1, '2026-10-06'), ['2026-09-28', '2026-10-04']);
    assert.deepEqual(r('month', 0, '2026-10-06'), ['2026-10-01', '2026-10-31']);
    assert.deepEqual(r('month', -1, '2026-10-06'), ['2026-09-01', '2026-09-30']);
    assert.deepEqual(r('month', -10, '2026-10-06'), ['2025-12-01', '2025-12-31']);
    assert.deepEqual(r('month', -8, '2026-10-06'), ['2026-02-01', '2026-02-28']);
    assert.deepEqual(r('day', -1, '2026-10-01'), ['2026-09-30', '2026-09-30']);
    assert.deepEqual(r('day', 3, '2026-10-06'), ['2026-10-06', '2026-10-06'], '미래 기간은 오늘로');
    assert.deepEqual(r('all', -3, '2026-10-06'), [null, null]);
    assert.equal(core.rangeFor('이상한값', 0, '2026-10-06').period, 'all');
  });
  await test('[랭킹] 별점 평균순, 마신 날짜 기준, 별점 없는 평가·평가 없는 사케 제외, 동점은 인원 많은 순', async () => {
    const sakes = [1, 2, 3, 4].map((id) => ({ id, name: '사케' + id }));
    const R = (sid, stars, d) => ({ sake_id: sid, stars, drank_on: d });
    const ratings = [R(1, 4, '2026-10-06'), R(1, 5, '2026-10-07'), R(2, 4.5, '2026-10-06'), R(2, 4.5, '2026-10-05'), R(3, 4.5, '2026-10-06'),
      R(4, null, '2026-10-06'), R(3, 1, '2026-09-30')];
    const wk = core.ranking(sakes, ratings, '2026-10-05', '2026-10-11');
    assert.deepEqual(wk.map((x) => [x.id, x.avg, x.n, x.rank]), [[1, 4.5, 2, 1], [2, 4.5, 2, 2], [3, 4.5, 1, 3]]);
    assert.ok(!wk.some((x) => x.id === 4), '별점 없는 평가만 있는 사케는 제외');
    const all = core.ranking(sakes, ratings, null, null);
    assert.equal(all.find((x) => x.id === 3).avg, 2.75, '전체 기간은 지난 평가까지');
    assert.deepEqual(core.ranking(sakes, ratings, '2026-08-01', '2026-08-31'), [], '평가 없는 기간은 빈 목록');
  });
  await test('[친구] 별점이 비슷한 순, 함께 별점 준 사케 2병 이상만, 일치도 %', async () => {
    const R = (n, sid, s) => ({ nickname: n, sake_id: sid, stars: s });
    const ratings = [R('me', 1, 5), R('me', 2, 3), R('me', 3, 4), R('A', 1, 5), R('A', 2, 3), R('B', 1, 4), R('B', 2, 2), R('B', 3, 2),
      R('C', 1, 5), R('D', 1, null), R('D', 2, 3), R('운영', 1, 5), R('운영', 3, 4)];
    const f = core.similarFriends('me', ratings, '운영', 3);
    assert.deepEqual(f.map((x) => [x.nick, x.match, x.common]), [['운영', 100, 2], ['A', 100, 2], ['B', 70, 3]]);
    assert.equal(f.find((x) => x.nick === '운영').admin, true);
    assert.ok(!f.some((x) => x.nick === 'C' || x.nick === 'D'));
  });

  /* ================= 새 서버 기능 (홈·랭킹·MY·찜·계정) ================= */
  A = freshServer(); setRoutes(A);
  {
    const v = require('../lib/validate');
    const TODAY = v.todayKST();
    const ac = cookieFrom(await call(A.auth, { method: 'POST', body: { action: 'admin', id: 'ADMIN', password: '880825' } }));
    const mk = async (b) => (await call(A.sakes, { method: 'POST', cookie: ac, body: b })).body.sake.id;
    const k1 = await mk({ name: '닷사이 45', brewer: '아사히주조', origin: '야마구치현' });
    const k2 = await mk({ name: '쿠보타 만주', brewer: '아사히주조', origin: '니가타현' });
    const k3 = await mk({ name: '핫카이산', brewer: '핫카이양조', origin: '니가타현' });
    const signup = async (n, pw) => cookieFrom(await call(A.auth, { method: 'POST', body: { action: 'signup', nickname: n, password: pw } }));
    let h1 = await signup('하나', '1234');
    const h2 = await signup('두리', 'abcd');
    const rate = (c, sid, stars, extra) => call(A.rate, { method: 'POST', cookie: c, body: { sakeId: sid, v: [3, 3, 3, 3, 3], stars, drankOn: TODAY, comment: '', ...(extra || {}) } });
    await rate(h2, k1, 4, { comment: '좋아요' });

    await test('[API 랭킹] 내가 안 마신 사케도 평균 별점 공개, 기간 기본값은 전체', async () => {
      const r = (await call(A.ranking, { cookie: h1, query: {} })).body;
      assert.equal(r.period, 'all'); assert.equal(r.items.length, 1); assert.equal(r.items[0].id, k1); assert.equal(r.items[0].avg, 4);
      assert.equal((await call(A.ranking, { cookie: h1, query: { period: 'week' } })).body.items.length, 1);
      assert.equal((await call(A.ranking, { cookie: h1, query: { period: 'week', offset: '-1' } })).body.items.length, 0);
      assert.equal((await call(A.ranking, { query: {} })).status, 401);
    });
    await test('[API 홈] 내 레벨·할 일·새 사케·테이스팅 랭킹 TOP3(전체 기간)·친구 소식 (소식에 별점·한줄평 없음)', async () => {
      const d = (await call(A.home, { cookie: h1 })).body;
      assert.equal(d.me.count, 0); assert.equal(d.me.level.title, '쌀'); assert.equal(d.me.badges_total, 15);
      assert.equal(d.total, 3); assert.equal(d.todo, 3);
      assert.equal(d.fresh.length, 3); assert.ok(d.fresh.every((s) => s.is_new === true));
      assert.equal(d.top.items[0].id, k1); assert.equal(d.week, undefined);
      assert.equal(d.feed.length, 1); assert.deepEqual(Object.keys(d.feed[0]).sort(), ['admin', 'at', 'nick', 'sake']);
      assert.deepEqual(Object.keys(d.feed[0].sake).sort(), ['id', 'name']);
      assert.equal((await call(A.home, { cookie: h2 })).body.feed.length, 0, '내 평가는 친구 소식에 안 나옴');
    });
    await test('[API 평가] 첫 평가 → 새 뱃지 "첫 잔", 3병째 → 레벨 업 "누룩", 같은 사케 다시 평가는 안 셈', async () => {
      const a = (await rate(h1, k1, 5)).body;
      assert.deepEqual(a.newBadges.map((b) => b.name), ['첫 잔', '만점 선언']); assert.equal(a.levelUp, null);
      const b = (await rate(h1, k1, 4.5)).body;
      assert.deepEqual(b.newBadges, []); assert.equal(b.levelUp, null);
      await rate(h1, k2, 4);
      const c = (await rate(h1, k3, 3, { comment: '쉼표, "따옴표"' })).body;
      assert.deepEqual(c.levelUp, { lv: 2, title: '누룩' });
      assert.ok(c.newBadges.some((x) => x.name === '시음회 멤버'), '같은 날 3병');
    });
    await test('[API 찜] 켜기·끄기, 목록·상세·MY에 반영, 없는 사케 404', async () => {
      assert.equal((await call(A.wish, { method: 'POST', cookie: h2, body: { sakeId: k3, on: true } })).body.wished, true);
      await call(A.wish, { method: 'POST', cookie: h2, body: { sakeId: k3, on: true } });
      assert.equal(store._db.wishes.filter((w) => w.nickname === '두리').length, 1, '두 번 눌러도 하나');
      assert.equal((await call(A.sakes, { cookie: h2 })).body.sakes.find((s) => s.id === k3).wished, true);
      assert.equal((await call(A.sakes, { cookie: h1 })).body.sakes.find((s) => s.id === k3).wished, false, '남의 찜은 안 보임');
      assert.equal((await call(A.sake, { cookie: h2, query: { id: String(k3) } })).body.wished, true);
      assert.deepEqual((await call(A.my, { cookie: h2 })).body.wishes.map((w) => w.id), [k3]);
      await call(A.wish, { method: 'POST', cookie: h2, body: { sakeId: k3, on: false } });
      assert.equal((await call(A.my, { cookie: h2 })).body.wishes.length, 0);
      assert.equal((await call(A.wish, { method: 'POST', cookie: h2, body: { sakeId: 999, on: true } })).status, 404);
      assert.equal((await call(A.wish, { method: 'POST', body: { sakeId: k3, on: true } })).status, 401);
    });
    await test('[API MY] 리뷰(최신순)·뱃지 15개·레벨·별점 비슷한 친구', async () => {
      await rate(h2, k2, 4);
      const d = (await call(A.my, { cookie: h1 })).body;
      assert.equal(d.nickname, '하나'); assert.equal(d.count, 3); assert.equal(d.level.title, '누룩'); assert.equal(d.badges.length, 15);
      assert.deepEqual(d.reviews.map((r) => r.sake.name), ['핫카이산', '쿠보타 만주', '닷사이 45']);
      assert.equal(d.reviews[2].stars, 4.5); assert.equal(d.reviews[0].comment, '쉼표, "따옴표"');
      assert.deepEqual(d.friends.map((f) => [f.nick, f.common, f.match]), [['두리', 2, 94]], '|4.5-4|,|4-4| → 평균 0.25 → 94%');
    });
    await test('[계정] 닉네임 변경: 같은 이름·중복·운영자 이름 거절, 성공하면 리뷰·찜도 새 이름', async () => {
      const rn = (c, nickname) => call(A.auth, { method: 'POST', cookie: c, body: { action: 'rename', nickname } });
      assert.equal((await rn(h1, '하나')).status, 400);
      assert.equal((await rn(h1, '두리')).status, 409);
      assert.equal((await rn(h1, '아무개')).status, 409);
      assert.equal((await rn(h1, 'admin')).status, 409);
      assert.equal((await rn(h1, '')).status, 400);
      await call(A.wish, { method: 'POST', cookie: h1, body: { sakeId: k2, on: true } });
      const old = h1;
      const r = await rn(h1, '하나둘');
      assert.equal(r.status, 200); assert.equal(r.body.nickname, '하나둘');
      h1 = cookieFrom(r);
      assert.ok(h1 && h1 !== old, '새 로그인 쿠키');
      assert.equal(store._db.ratings.filter((x) => x.nickname === '하나둘').length, 3);
      assert.equal(store._db.ratings.filter((x) => x.nickname === '하나').length, 0);
      assert.equal(store._db.wishes.filter((x) => x.nickname === '하나둘').length, 1);
      assert.equal((await call(A.my, { cookie: h1 })).body.count, 3);
      assert.equal((await rate(old, k1, 3)).status, 401, '바뀌기 전 쿠키로는 평가 저장 안 됨');
      const rv = (await call(A.sake, { cookie: h2, query: { id: String(k1) } })).body.reviews.map((x) => x.nick).sort();
      assert.deepEqual(rv, ['두리', '하나둘']);
      assert.equal((await call(A.auth, { method: 'POST', body: { action: 'login', nickname: '하나둘', password: '1234' } })).status, 200);
      assert.equal((await call(A.auth, { method: 'POST', body: { action: 'signup', nickname: '하나', password: '9999' } })).status, 200, '예전 닉네임은 다시 쓸 수 있음');
    });
    await test('[계정] 비밀번호 변경: 지금 비번 틀림·새 비번 짧음 거절, 성공하면 새 비번으로만 로그인', async () => {
      const pw = (password, newPassword) => call(A.auth, { method: 'POST', cookie: h1, body: { action: 'password', password, newPassword } });
      assert.equal((await pw('0000', 'newpw')).status, 400);
      assert.equal((await pw('1234', '12')).status, 400);
      assert.equal((await pw('1234', 'newpw')).status, 200);
      assert.equal((await call(A.auth, { method: 'POST', body: { action: 'login', nickname: '하나둘', password: '1234' } })).status, 401);
      assert.equal((await call(A.auth, { method: 'POST', body: { action: 'login', nickname: '하나둘', password: 'newpw' } })).status, 200);
    });
    await test('[계정] 탈퇴: 비번 틀리면 거절, 성공하면 리뷰·찜·계정 삭제, 평균·랭킹에서도 빠짐', async () => {
      const bye = (c, password) => call(A.auth, { method: 'POST', cookie: c, body: { action: 'withdraw', password } });
      assert.equal((await bye(h1, 'wrong')).status, 400);
      assert.equal(store._db.guests.some((g) => g.nickname === '하나둘'), true);
      const r = await bye(h1, 'newpw');
      assert.equal(r.status, 200); assert.match(r.headers['set-cookie'], /Max-Age=0/);
      assert.ok(!store._db.guests.some((g) => g.nickname === '하나둘'));
      assert.equal(store._db.ratings.filter((x) => x.nickname === '하나둘').length, 0);
      assert.equal(store._db.wishes.filter((x) => x.nickname === '하나둘').length, 0);
      const k1d = (await call(A.sake, { cookie: h2, query: { id: String(k1) } })).body;
      assert.equal(k1d.n, 1); assert.equal(k1d.avg_stars, 4);
      assert.equal((await call(A.ranking, { cookie: h2, query: {} })).body.items.find((x) => x.id === k3), undefined, '탈퇴한 사람만 평가한 사케는 랭킹에서 빠짐');
      assert.equal((await rate(h1, k1, 3)).status, 401, '탈퇴한 계정의 예전 쿠키로는 저장 안 됨');
      assert.equal((await call(A.auth, { method: 'POST', body: { action: 'login', nickname: '하나둘', password: 'newpw' } })).status, 401);
    });
    await test('[계정] 운영자는 닉네임·비번 변경·탈퇴 불가 (Vercel 설정에서)', async () => {
      for (const action of ['rename', 'password', 'withdraw']) {
        assert.equal((await call(A.auth, { method: 'POST', cookie: ac, body: { action, nickname: '새이름', password: '880825', newPassword: 'xxxx' } })).status, 403, action);
      }
      assert.equal((await call(A.auth, { method: 'POST', body: { action: 'rename', nickname: 'x' } })).status, 401);
    });
  }

  /* ================= 새 화면 (하단 메뉴·홈·랭킹·MY·찜) ================= */
  A = freshServer(); setRoutes(A);
  {
    const v = require('../lib/validate');
    const TODAY = v.todayKST();
    const ac = cookieFrom(await call(A.auth, { method: 'POST', body: { action: 'admin', id: 'ADMIN', password: '880825' } }));
    const mk = async (b) => (await call(A.sakes, { method: 'POST', cookie: ac, body: b })).body.sake.id;
    const q1 = await mk({ name: '닷사이 45', brewer: '아사히주조', origin: '야마구치현' });
    const q2 = await mk({ name: '쿠보타 만주', brewer: '아사히주조', origin: '니가타현' });
    const q3 = await mk({ name: '핫카이산', brewer: '핫카이양조', origin: '니가타현' });
    await mk({ name: '이소지만 혼조조', brewer: '이소지만주조', origin: '시즈오카현' });
    const sc = cookieFrom(await call(A.auth, { method: 'POST', body: { action: 'signup', nickname: '산', password: 'mnt1' } }));
    const rate = (c, sid, stars, extra) => call(A.rate, { method: 'POST', cookie: c, body: { sakeId: sid, v: [3, 3, 3, 3, 3], stars, drankOn: TODAY, comment: '', ...(extra || {}) } });
    await rate(sc, q1, 5); await rate(sc, q2, 3.5); await rate(sc, q3, 4);

    const u = browser(); await u.settle();
    await u.click(u.btn('처음이에요')); u.type('#nick', '바람'); u.type('#pw', 'wind1'); await u.submit('#authform');
    await u.settle();

    await test('[하단 메뉴] 홈·랭킹·테이스팅·MY, 지금 메뉴 표시', async () => {
      assert.deepEqual(u.$$('.tabbar .tb').map((x) => x.textContent.trim()), ['홈', '랭킹', '테이스팅', 'MY']);
      assert.equal(u.$('.tabbar .tb.on').textContent.trim(), '홈');
      assert.equal(u.$('.tabbar .tb.on').getAttribute('aria-current'), 'page');
      assert.ok(u.w.document.body.classList.contains('has-tabbar'));
    });
    await test('[홈] 레벨 카드·할 일·새 사케(NEW)·테이스팅 랭킹 TOP3·친구 소식', async () => {
      const txt = u.text();
      assert.match(txt, /바람님, 지금까지 0병 평가했어요/); assert.match(txt, /Lv\.1\s*쌀/); assert.match(txt, /다음 레벨 '누룩'까지 3병/);
      assert.match(u.$('.todo').textContent, /아직 안 마신 사케 4병/);
      assert.equal(u.$$('.fcard').length, 4); assert.equal(u.$$('.fcard .newtag').length, 4);
      assert.match(txt, /테이스팅 랭킹 TOP 3/); assert.doesNotMatch(txt, /이번 주 랭킹/);
      assert.deepEqual(u.$$('.rrow .t b').map((x) => x.textContent), ['닷사이 45', '핫카이산', '쿠보타 만주']);
      const feed = u.$$('.fitem .ft').map((x) => x.textContent);
      assert.ok(feed.includes('산님이 핫카이산을 평가했어요'), feed.join('|'));
      assert.ok(feed.includes('산님이 닷사이 45를 평가했어요'), '숫자 5로 끝나면 "를"');
      assert.ok(feed.includes('산님이 쿠보타 만주를 평가했어요'));
      assert.doesNotMatch(u.$('.feed').textContent, /★/, '소식에 별점 없음');
    });
    await test('[홈] TOP3 "전체 ›" → 랭킹 전체 기간', async () => {
      await u.click(u.$('[data-a="ranktop"]')); await u.settle();
      assert.equal(u.w.location.hash, '#/ranking');
      assert.equal(u.$('.rtabs [aria-selected="true"]').textContent, '전체');
      await u.tab('홈'); await u.settle();
    });
    await test('[홈] "평가하러 가기" → 테이스팅의 "평가할 사케"', async () => {
      await u.click(u.$('.todo'));
      assert.equal(u.w.location.hash, '#/tasting');
      assert.match(u.$('.filters [aria-selected="true"]').textContent, /평가할 사케/);
      assert.equal(u.$('.tabbar .tb.on').textContent.trim(), '테이스팅');
    });
    await test('[랭킹] 기본은 전체(기간 이동 없음), 주간은 기간 이름·다음 기간 막힘·지난주는 "평가된 사케가 없어요"', async () => {
      await u.tab('랭킹');
      assert.equal(u.$('.rtabs [aria-selected="true"]').textContent, '전체');
      assert.equal(u.$('.pnav'), null); assert.equal(u.$$('.rrow').length, 3);
      assert.match(u.$$('.rrow')[0].textContent, /5\.0/); assert.match(u.$$('.rrow')[0].textContent, /1명/);
      await u.click(u.$('[data-a="period"][data-p="week"]')); await u.settle();
      assert.match(u.$('#plabel').textContent, /^\d+월 \d+일 ~ \d+월 \d+일$/);
      assert.ok(u.$('[data-a="poffset"][data-d="1"]').disabled);
      assert.equal(u.$$('.rrow').length, 3);
      await u.click(u.$('[data-a="poffset"][data-d="-1"]')); await u.settle();
      assert.match(u.text(), /이 기간에는 평가된 사케가 없어요/);
      assert.ok(!u.$('[data-a="poffset"][data-d="1"]').disabled);
      await u.click(u.$('[data-a="poffset"][data-d="1"]')); await u.settle();
      assert.equal(u.$$('.rrow').length, 3);
    });
    await test('[랭킹] 일간은 오늘 날짜, 월간은 "YYYY년 M월"', async () => {
      await u.click(u.$('[data-a="period"][data-p="day"]')); await u.settle();
      assert.match(u.$('#plabel').textContent, /^\d{4}년 \d+월 \d+일 \([일월화수목금토]\)$/);
      await u.click(u.$('[data-a="period"][data-p="month"]')); await u.settle();
      assert.match(u.$('#plabel').textContent, /^\d{4}년 \d+월$/);
      await u.click(u.$('[data-a="period"][data-p="all"]')); await u.settle();
    });
    await test('[찜] 상세 ♡ 누르면 ♥, 테이스팅 "찜" 탭과 MY에 모이고, 다시 누르면 해제', async () => {
      await u.tab('테이스팅');
      await u.click(u.$$('.filters button')[0]);
      await u.click(u.$$('#results .card').find((c) => /이소지만/.test(c.textContent)));
      const w = u.$('.wish');
      assert.equal(w.getAttribute('aria-pressed'), 'false'); assert.match(w.textContent, /♡/);
      await u.click(w); await u.settle();
      assert.equal(u.$('.wish').getAttribute('aria-pressed'), 'true'); assert.match(u.$('.wish').textContent, /♥/);
      assert.equal(store._db.wishes.length, 1);
      await u.click(u.btn('← 목록'));
      assert.match(u.$$('.filters button')[3].textContent, /찜\s*1/);
      await u.click(u.$$('.filters button')[3]);
      assert.deepEqual(u.$$('#results .card h3').map((x) => x.textContent), ['이소지만 혼조조']);
      await u.tab('MY'); await u.settle();
      assert.match(u.text(), /마셔보고 싶어요 1/);
      await u.click(u.$$('.mini').find((x) => /이소지만/.test(x.textContent)));
      await u.click(u.$('.wish')); await u.settle();
      assert.equal(store._db.wishes.length, 0);
      await u.tab('MY'); await u.settle();
      assert.match(u.text(), /마셔보고 싶어요 0/);
    });
    await test('[평가 → 뱃지] 첫 평가 저장하면 "새 뱃지: 첫 잔" 알림', async () => {
      await u.tab('테이스팅');
      await u.click(u.$$('.filters button')[0]);
      await u.click(u.$$('#results .card').find((c) => /닷사이/.test(c.textContent)));
      await u.click(u.btn('내 평가 남기기'));
      u.type('#cmt', '향이 좋아, 정말 "최고"');
      await u.click(u.$('[data-a="star"][data-n="4.5"]')); await u.click(u.btn('저장하고 결과 보기')); await u.settle();
      assert.match(u.$('#toast').textContent, /새 뱃지: 첫 잔/);
    });
    await test('[MY] 레벨·뱃지 15개(모두 다른 그림, 1개 획득)·올해 리포트·내 리뷰·별점 비슷한 친구', async () => {
      const uc = cookieFrom(await call(A.auth, { method: 'POST', body: { action: 'login', nickname: '바람', password: 'wind1' } }));
      await rate(uc, q2, 3.5);
      await u.tab('MY'); await u.settle();
      assert.match(u.$('.mynick').textContent, /바람/); assert.match(u.text(), /Lv\.1\s*쌀/);
      assert.equal(u.$$('.bdg').length, 15);
      const arts = u.$$('.bdg .bi svg .gl').map((g) => g.innerHTML);
      assert.equal(new Set(arts).size, 15, '뱃지 그림이 모두 달라야 함');
      assert.deepEqual(u.$$('.bdg.got b').map((x) => x.textContent), ['첫 잔']);
      assert.match(u.$('.bdg.got svg').getAttribute('style'), /--bc:#/, '받은 뱃지는 고유 색');
      assert.equal(u.$('.bdg:not(.got) svg').getAttribute('style'), null, '못 받은 뱃지는 회색');
      assert.match(u.$$('.bdg:not(.got)')[0].querySelector('.bst').textContent, /\d+ \/ \d+/);
      assert.match(u.$('.report .rp.big').textContent, /2병/);
      assert.match(u.$('.report').textContent, /가장 높게 준 사케\s*닷사이 45/);
      assert.match(u.$('.report').textContent, /가장 많이 마신 양조장\s*아사히주조\s*2병/);
      assert.equal(u.$$('#myrevs .mrev').length, 2);
      assert.deepEqual(u.$$('.friend b').map((x) => x.textContent), ['산']);
      assert.match(u.$('.friend').textContent, /함께 마신 사케 2병/); assert.match(u.$('.friend').textContent, /일치도 94%/);
      await u.click(u.$('[data-a="mysort"][data-s="stars"]'));
      assert.match(u.$$('#myrevs .mrev')[0].textContent, /닷사이/);
    });
    await test('[MY] 엑셀 저장 파일: 한글 깨짐 방지, 제목 줄, 쉼표·따옴표 처리', async () => {
      const csv = u.w.SKDEBUG.csv();
      assert.equal(csv.charCodeAt(0), 0xfeff);
      const lines = csv.slice(1).split('\r\n');
      assert.equal(lines[0], '사케,양조장,원산지,마신 날짜,만족도 별점,단맛,산미,바디감,알콜감,여운,한줄평,작성일');
      assert.equal(lines.length, 3);
      const dl = lines.find((l) => l.startsWith('닷사이 45'));
      assert.ok(dl.includes(',4.5,'));
      const quoted = '"향이 좋아, 정말 ' + '""최고""' + '"';
      assert.ok(dl.includes(quoted), dl);
      assert.ok(u.btn('내 기록 엑셀로 저장'));
    });
    await test('[MY 계정] 닉네임 변경: 중복이면 안내, 바꾸면 MY·홈에 새 이름', async () => {
      await u.click(u.$('[data-a="acct"][data-k="nick"]'));
      assert.equal(u.$('#newnick').value, '바람');
      u.$('#newnick').value = '산'; await u.submit('#nickform'); await u.settle();
      assert.match(u.text(), /이미 쓰고 있는 닉네임이에요/);
      assert.equal(u.$('#newnick').value, '산', '틀려도 입력한 값 유지');
      u.$('#newnick').value = '바람결'; await u.submit('#nickform'); await u.settle(); await u.settle();
      assert.match(u.$('#toast').textContent, /'바람결'으로 바꿨어요/);
      assert.match(u.$('.mynick').textContent, /바람결/);
      assert.equal(u.$('#newnick'), null, '저장하면 폼이 닫힘');
      await u.tab('홈'); await u.settle();
      assert.match(u.text(), /바람결님, 지금까지 2병/);
    });
    await test('[MY 계정] 비밀번호 변경: 확인 불일치·지금 비번 틀림 안내, 성공 후 새 비번으로 로그인', async () => {
      await u.tab('MY'); await u.settle();
      await u.click(u.$('[data-a="acct"][data-k="pw"]'));
      u.$('#curpw').value = 'wind1'; u.$('#newpw').value = 'breeze'; u.$('#newpw2').value = 'breez'; await u.submit('#pwform');
      assert.match(u.text(), /새 비밀번호가 서로 달라요/);
      u.$('#curpw').value = 'nope'; u.$('#newpw').value = 'breeze'; u.$('#newpw2').value = 'breeze'; await u.submit('#pwform'); await new Promise((r) => setTimeout(r, 500));
      assert.match(u.text(), /지금 비밀번호가 맞지 않아요/);
      u.$('#curpw').value = 'wind1'; u.$('#newpw').value = 'breeze'; u.$('#newpw2').value = 'breeze'; await u.submit('#pwform'); await u.settle(); await u.settle();
      assert.match(u.$('#toast').textContent, /비밀번호를 바꿨어요/);
      await u.logout();
      u.type('#nick', '바람결'); u.type('#pw', 'breeze'); await u.submit('#authform'); await u.settle();
      assert.ok(u.$('.lvcard'));
    });
    await test('[MY 계정] 탈퇴는 두 단계 (비번 → "정말 탈퇴"), 취소 가능, 탈퇴하면 입장 화면', async () => {
      await u.tab('MY'); await u.settle();
      await u.click(u.$('[data-a="acct"][data-k="bye"]'));
      assert.match(u.text(), /내가 쓴 리뷰 2개와 찜이 모두 지워지고/);
      await u.submit('#byeform');
      assert.match(u.text(), /비밀번호를 입력해 주세요/);
      u.$('#byepw').value = 'breeze'; await u.submit('#byeform');
      assert.ok(u.btn('정말 탈퇴')); assert.ok(store._db.guests.some((g) => g.nickname === '바람결'), '아직 탈퇴 전');
      await u.click(u.btn('취소'));
      assert.ok(!u.btn('정말 탈퇴')); assert.ok(u.$('#byepw'));
      u.$('#byepw').value = 'breeze'; await u.submit('#byeform');
      await u.click(u.btn('정말 탈퇴')); await u.settle(); await u.settle();
      assert.ok(!store._db.guests.some((g) => g.nickname === '바람결'));
      assert.equal(store._db.ratings.filter((r) => r.nickname === '바람결').length, 0);
      assert.ok(u.$('#authform')); assert.ok(!u.$('.tabbar'));
      assert.match(u.$('#toast').textContent, /탈퇴했어요/);
    });
    await test('[MY 운영자] 운영자 메뉴 링크, 계정 변경 대신 안내', async () => {
      const o = browser(); await o.settle();
      await o.click(o.btn('운영자 로그인'));
      o.type('#oid', 'ADMIN'); o.type('#opw', '880825'); await o.submit('#opform');
      await o.tab('MY'); await o.settle();
      assert.ok(o.$('[data-h="#/admin"]'));
      assert.match(o.text(), /Vercel 설정/);
      assert.equal(o.$('[data-a="acct"]'), null);
      assert.ok(o.$('.mytop .chip.op'));
      await o.toAdmin();
      assert.equal(o.$('.tabbar .tb.on').textContent.trim(), 'MY');
      assert.ok(o.btn('← MY'));
      assert.deepEqual(o.errors, []);
    });
    await test('[화면] 새 화면들에서 스크립트 오류 없음', async () => { assert.deepEqual(u.errors, []); });
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
