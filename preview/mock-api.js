/* 데모 전용: 서버 대신 브라우저 안에서 흉내 내는 가짜 API (새로고침하면 처음으로)
   레벨·뱃지·랭킹·홈·MY 계산은 실제 서버와 같은 lib/core.js(SKCORE)를 그대로 써요.
   실제 서버(routes/)에 기능을 추가하면 여기에도 같은 동작을 추가해야 데모에서 보여요. */
(function () {
  var C = window.SKCORE;
  var ADMIN_NICK = '아무개';
  var now = new Date();
  function z(x) { return (x < 10 ? '0' : '') + x; }
  function ymd(d) { return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()); }
  function ago(n) { var d = new Date(now); d.setDate(d.getDate() - n); return ymd(d); }
  function isoAgo(days, hour, min) { var d = new Date(now); d.setDate(d.getDate() - days); d.setHours(hour, min || 0, 0, 0); if (d > now) d = new Date(now.getTime() - 60000 * (min || 5)); return d.toISOString(); }
  function today() { return ymd(new Date()); }

  var S = function (id, name, brewer, origin, polish, abv, smv, acid, tint, days, img, dt, db) {
    return { id: id, name: name, rice: '쌀, 쌀누룩', polish: polish, abv: abv, smv: smv, acid: acid, brewer: brewer, origin: origin, tint: tint, img_url: img || null, desc_title: dt || '', desc_body: db || '', created_at: isoAgo(days, 10) };
  };
  var db = {
    guests: { '예시손님': '1234', '산': '1234', '바다': '1234', '하늘': '1234' },
    sakes: [
      S(1, '닷사이 준마이다이긴조 45', '아사히주조', '야마구치현', '45', '16', '+4', '1.1', '#4f7cac', 60, window.__DASSAI__, '화려한 과일향의 준마이다이긴조', '멜론과 백도 향이 먼저 올라오고, 끝맛은 깔끔하게 사라져요.\n차갑게(8~10도) 마실 때 향이 가장 좋아요.'),
      S(2, '쿠보타 만주', '아사히주조', '니가타현', '33', '15', '+1', '1.2', '#6a8f7b', 55),
      S(3, '핫카이산 특별본양조', '핫카이양조', '니가타현', '55', '15.5', '+5', '1.1', '#b08a4a', 50),
      S(4, '주욘다이 혼마루', '타카기주조', '야마가타현', '55', '15', '', '', '#a05a6e', 40),
      S(5, '쿠보타 센쥬', '아사히주조', '니가타현', '55', '15', '+5', '1.0', '#6b6fb0', 30),
      S(6, '하쿠카이산 준마이긴조', '핫카이양조', '니가타현', '45', '15.5', '+6', '1.2', '#4f7cac', 20),
      S(7, '다카시미즈 준마이', '아키타주류', '아키타현', '60', '15', '-2', '1.6', '#6a8f7b', 6),
      S(8, '이소지만 혼조조', '이소지만주조', '시즈오카현', '60', '15.5', '+3', '1.3', '#b08a4a', 2)
    ],
    ratings: [], wishes: [], rseq: 0, sseq: 8,
    joined: {}, fails: {}, qseq: 0,
    // 사케 요청 예시
    requests: [
      { id: 1, nickname: '바다', name: '쥬욘다이 본마루', note: '친구가 정말 맛있대요. 다음 오술에 꼭!', done: false, created_at: isoAgo(2, 21) },
      { id: 2, nickname: '예시손님', name: '아라마사 No.6', note: '', done: true, created_at: isoAgo(9, 20) }
    ],
    // 오술 예시: 오늘 3병(이소지만 → 다카시미즈 → 하쿠카이산), 어제 2병
    osul: [
      { day: ymd(new Date()), sake_id: 8, pos: 1 }, { day: ymd(new Date()), sake_id: 7, pos: 2 }, { day: ymd(new Date()), sake_id: 6, pos: 3 },
      { day: ago(1), sake_id: 5, pos: 1 }, { day: ago(1), sake_id: 4, pos: 2 }
    ]
  };
  function R(sake, nick, stars, v, comment, drankAgo, updDays, hour, min) {
    var at = isoAgo(updDays, hour, min);
    db.ratings.push({ id: ++db.rseq, sake_id: sake, nickname: nick, stars: stars, v: v, comment: comment || '', drank_on: ago(drankAgo), created_at: at, updated_at: at });
  }
  // 예전 기록 (친구들)
  R(1, '산', 5, [4, 3, 2, 2, 5], '향이 미쳤어요', 45, 45, 20); R(2, '산', 4, [2, 3, 3, 3, 3], '', 40, 40, 21);
  R(3, '산', 3.5, [2, 2, 4, 4, 3], '데우면 좋음', 33, 33, 22); R(1, '바다', 4.5, [4, 2, 2, 3, 4], '디저트랑 최고', 44, 44, 19);
  R(2, '바다', 4, [2, 3, 4, 3, 3], '', 38, 38, 20); R(4, '바다', 4.5, [3, 3, 3, 2, 4], '균형이 좋아요', 25, 25, 21);
  R(1, '하늘', 4, [4, 3, 2, 2, 4], '', 44, 44, 21); R(3, '하늘', 3, [1, 2, 3, 4, 2], '', 30, 30, 20);
  R(5, '하늘', 3.5, [2, 2, 3, 3, 3], '편하게 마시기 좋음', 12, 12, 19); R(4, ADMIN_NICK, 5, [3, 3, 3, 2, 4], '운영자 추천!', 26, 26, 21);
  // 이번 주·최근
  R(6, '산', 4.5, [3, 3, 2, 3, 4], '깔끔하고 시원해요', 1, 0, 9, 10); R(6, '바다', 4, [3, 2, 2, 3, 3], '', 2, 1, 22);
  R(5, '바다', 3.5, [2, 2, 3, 3, 3], '', 3, 2, 21); R(7, '하늘', 4, [2, 4, 3, 2, 3], '산미가 매력', 1, 0, 8, 30);
  R(2, '하늘', 4.5, [2, 3, 3, 3, 4], '', 4, 3, 20); R(7, '산', 3, [1, 4, 3, 3, 2], '', 2, 2, 22);
  // 나 (예시손님): 6병 + 닷사이 한 번 더 = 리뷰 7개 → Lv.3 보통주
  R(1, '예시손님', 5, [4, 3, 2, 2, 4], '과일향이 확 올라오고 끝이 깔끔해요', 44, 44, 21);
  R(2, '예시손님', 4, [2, 3, 3, 3, 3], '드라이하고 균형이 좋아요', 38, 38, 21);
  R(3, '예시손님', 3, [2, 2, 4, 4, 3], '톡 쏘는 느낌, 담백해요', 30, 30, 21);
  R(4, '예시손님', 4.5, [3, 3, 3, 2, 4], '', 25, 25, 22);
  R(5, '예시손님', 3.5, [2, 2, 3, 3, 3], '편한 식중주', 12, 12, 20);
  R(6, '예시손님', 4, [3, 3, 2, 3, 4], '', 2, 2, 23);
  R(1, '예시손님', 4.5, [4, 3, 2, 2, 5], '두 번째 잔, 이번엔 조금 더 차갑게', 5, 5, 21);
  R(1, '예시손님', 4, [3, 3, 3, 3, 4], '데워 보니 단맛이 줄고 여운이 길어요', 1, 1, 20);
  // 마신 온도 예시
  db.ratings.forEach(function (r) {
    if (r.nickname !== '예시손님') return;
    if (r.sake_id === 1) r.temp = r.comment.indexOf('데워') >= 0 ? 'warm' : r.comment.indexOf('차갑게') >= 0 ? 'cold' : 'room';
    if (r.sake_id === 3) r.temp = 'hot';
  });
  Object.keys(db.guests).forEach(function (n, i) { db.joined[n] = isoAgo(60 - i * 5, 19); });
  // 고친 리뷰 예시 (처음 쓴 날짜는 그대로 보여요)
  db.ratings.filter(function (r) { return r.sake_id === 2 && r.nickname === '예시손님'; })[0].updated_at = isoAgo(3, 20);
  db.wishes.push({ nickname: '예시손님', sake_id: 8, created_at: isoAgo(1, 12) });
  // 찜 7개 → MY '마셔보고 싶어요'가 5개 + 2개로 페이지가 나뉘는 예시
  [7, 6, 5, 4, 3, 2].forEach(function (id, i) { db.wishes.push({ nickname: '예시손님', sake_id: id, created_at: isoAgo(2 + i, 12) }); });
  // PC에서 데모를 열어도 MY의 '홈 화면에 추가' 버튼이 보이게 안드로이드 폰인 척해요 (데모 전용)
  if (!/iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '')) {
    try { Object.defineProperty(navigator, 'userAgent', { get: function () { return 'Mozilla/5.0 (Linux; Android 14) 사케치북 데모'; } }); } catch (e) { /* 무시 */ }
  }

  var me = null;
  function copy(o) { return JSON.parse(JSON.stringify(o)); }
  function res(status, body) { return Promise.resolve({ ok: status < 400, status: status, json: function () { return Promise.resolve(copy(body)); } }); }
  function err(status, m) { return res(status, { error: m }); }
  function sake(id) { return db.sakes.filter(function (s) { return s.id === id; })[0]; }
  function wishesOf(n) { return db.wishes.filter(function (w) { return w.nickname === n; }).sort(function (a, b) { return b.created_at.localeCompare(a.created_at); }); }
  // 사케별 평가한 사람 수 (여러 번 기록해도 1명)
  function people(sid) { var m = {}; db.ratings.forEach(function (r) { if (r.sake_id === sid) m[r.nickname] = 1; }); return Object.keys(m).length; }
  function guestKey(n) { var k = Object.keys(db.guests).filter(function (x) { return x.toLowerCase() === String(n).toLowerCase(); }); return k[0] || null; }

  window.fetch = function (url, init) {
    init = init || {};
    var u = new URL(url, location.href), m = init.method || 'GET', b = init.body ? JSON.parse(init.body) : {};
    // 윈도우에서 파일을 바로 열면(file:///C:/...) 주소가 "/C:/api/me"처럼 바뀌어서, "/api/..." 부분만 떼어 써요
    var id = parseInt(u.searchParams.get('id'), 10), path = u.pathname.replace(/^.*(\/api\/[^/]*)$/, '$1');

    if (path === '/api/me') return res(200, { role: me && me.role, nickname: me && me.nick, adminNick: ADMIN_NICK });

    if (path === '/api/auth') {
      var a = b.action;
      if (a === 'logout') { me = null; return res(200, { ok: true }); }
      // 로그인 하나로: 아이디가 ADMIN이면 운영자
      if (a === 'login' && String(b.nickname || '').trim() === 'ADMIN') { a = 'admin'; b.id = 'ADMIN'; }
      if (a === 'admin') {
        if (b.id !== 'ADMIN' || !b.password) return err(401, '아이디 또는 비밀번호가 맞지 않아요.');
        me = { role: 'admin', nick: ADMIN_NICK }; return res(200, { role: 'admin', nickname: ADMIN_NICK });
      }
      var n = String(b.nickname || '').trim();
      if (a === 'signup') {
        if (!n) return err(400, '닉네임을(를) 입력해 주세요.');
        if (String(b.password || '').length < 4) return err(400, '비밀번호는 4자 이상이에요.');
        if (n === ADMIN_NICK || n.toLowerCase() === 'admin' || guestKey(n)) return err(409, '이미 쓰고 있는 닉네임이에요. 다른 닉네임을 써 주세요.');
        db.guests[n] = b.password; db.joined[n] = new Date().toISOString(); me = { role: 'guest', nick: n }; return res(200, { role: 'guest', nickname: n });
      }
      if (a === 'login') {
        // 로그인 시도 제한: 5번 틀리면 10분 잠금 (실제 서버와 같아요)
        var lk = 'g:' + n.toLowerCase(), lf = db.fails[lk];
        if (lf && lf.until > Date.now()) return err(429, '비밀번호를 5번 틀려서 잠시 잠겼어요. ' + Math.max(1, Math.ceil((lf.until - Date.now()) / 60000)) + '분 뒤에 다시 시도해 주세요.');
        var k = guestKey(n);
        if (!k || db.guests[k] !== b.password) {
          lf = db.fails[lk] = { n: (lf && !lf.until ? lf.n : 0) + 1, until: 0 };
          if (lf.n >= 5) { db.fails[lk] = { n: 0, until: Date.now() + 600000 }; return err(429, '비밀번호를 5번 틀려서 10분 동안 로그인할 수 없어요.'); }
          return err(401, '닉네임 또는 비밀번호가 맞지 않아요.');
        }
        delete db.fails[lk];
        me = { role: 'guest', nick: k }; return res(200, { role: 'guest', nickname: k });
      }
      if (!me) return err(401, '로그인이 필요해요.');
      if (me.role !== 'guest') return err(403, '운영자 계정 정보는 Vercel 설정에서 바꿔요.');
      if (a === 'rename') {
        if (!n) return err(400, '닉네임을(를) 입력해 주세요.');
        if (n === me.nick) return err(400, '지금 쓰는 닉네임과 같아요.');
        if (n === ADMIN_NICK || n.toLowerCase() === 'admin' || (guestKey(n) && guestKey(n) !== me.nick)) return err(409, '이미 쓰고 있는 닉네임이에요. 다른 닉네임을 써 주세요.');
        db.guests[n] = db.guests[me.nick]; delete db.guests[me.nick];
        db.ratings.forEach(function (r) { if (r.nickname === me.nick) r.nickname = n; });
        db.wishes.forEach(function (w) { if (w.nickname === me.nick) w.nickname = n; });
        db.requests.forEach(function (q) { if (q.nickname === me.nick) q.nickname = n; });
        me.nick = n; return res(200, { ok: true, nickname: n });
      }
      if (db.guests[me.nick] !== b.password) return err(400, '지금 비밀번호가 맞지 않아요.');
      if (a === 'password') {
        if (String(b.newPassword || '').length < 4) return err(400, '비밀번호는 4자 이상이에요.');
        db.guests[me.nick] = b.newPassword; return res(200, { ok: true });
      }
      if (a === 'withdraw') {
        var gone = me.nick;
        db.ratings = db.ratings.filter(function (r) { return r.nickname !== gone; });
        db.wishes = db.wishes.filter(function (w) { return w.nickname !== gone; });
        db.requests = db.requests.filter(function (q) { return q.nickname !== gone; });
        delete db.guests[gone]; me = null; return res(200, { ok: true });
      }
      return err(400, '알 수 없는 요청이에요.');
    }

    if (!me) return err(401, '로그인이 필요해요.');

    if (path === '/api/osul') {
      var td = today();
      var days = {};
      db.osul.forEach(function (o) { if (sake(o.sake_id)) (days[o.day] = days[o.day] || []).push(o); });
      Object.keys(days).forEach(function (k) { days[k].sort(function (a, c) { return a.pos - c.pos; }); });
      var dd = u.searchParams.get('date') || td;
      if (m === 'PUT') {
        if (me.role !== 'admin') return err(403, '운영자만 할 수 있어요.');
        db.osul = db.osul.filter(function (o) { return o.day !== b.date; });
        b.ids.forEach(function (x, i) { db.osul.push({ day: b.date, sake_id: x, pos: i + 1 }); });
        return res(200, { ok: true, date: b.date, ids: b.ids });
      }
      if (u.searchParams.get('manage')) {
        return res(200, { date: dd, today: td, ids: (days[dd] || []).map(function (o) { return o.sake_id; }),
          dates: Object.keys(days).sort().map(function (k) { return { date: k, count: days[k].length }; }) });
      }
      var vis = Object.keys(days).sort();
      var items = (days[dd] || []).map(function (o) {
        var s2 = sake(o.sake_id), mineAll = db.ratings.filter(function (r) { return r.sake_id === s2.id && r.nickname === me.nick; }).sort(C.byLatest), mine = mineAll[0];
        return { id: s2.id, name: s2.name, brewer: s2.brewer, origin: s2.origin, tint: s2.tint, img_url: s2.img_url,
          n: people(s2.id), rated: !!mine, times: mineAll.length,
          drank_on: mine ? mine.drank_on : null, stars: mine ? mine.stars : null };
      });
      return res(200, { date: dd, today: td, items: items, prev: vis.filter(function (k) { return k < dd; }).pop() || null,
        next: vis.filter(function (k) { return k > dd; })[0] || null });
    }
    if (path === '/api/home') return res(200, C.buildHome(me.nick, db.sakes, db.ratings, ADMIN_NICK, today(), db.osul));

    // 운영자: 손님 목록·비밀번호 초기화·백업
    if (path === '/api/admin') {
      if (me.role !== 'admin') return err(403, '운영자만 할 수 있어요.');
      if (m === 'POST') {
        var gk = guestKey(String(b.nickname || '').trim());
        if (!gk) return err(404, '그런 닉네임의 손님이 없어요.');
        var al = 'abcdefghjkmnpqrstuvwxyz23456789', tp = '';
        for (var ti = 0; ti < 6; ti++) tp += al[Math.floor(Math.random() * al.length)];
        db.guests[gk] = tp; delete db.fails['g:' + gk.toLowerCase()];
        return res(200, { ok: true, nickname: gk, temp: tp });
      }
      var what = u.searchParams.get('what');
      if (what === 'guests') {
        return res(200, { guests: Object.keys(db.guests).map(function (gn) {
          var mine3 = db.ratings.filter(function (r) { return r.nickname === gn; });
          var last = mine3.map(C.createdOf).sort().pop() || null;
          return { nickname: gn, created_at: db.joined[gn] || null, reviews: mine3.length, last: last };
        }) });
      }
      if (what === 'backup') {
        return res(200, { exported_at: new Date().toISOString(), sakes: db.sakes, ratings: db.ratings,
          guests: Object.keys(db.guests).map(function (gn) { return { nickname: gn, created_at: db.joined[gn] || null }; }), osul: db.osul, requests: db.requests });
      }
      return err(400, '알 수 없는 요청이에요.');
    }

    // 사케 요청
    if (path === '/api/request') {
      var isAdm = me.role === 'admin';
      if (m === 'GET') {
        return res(200, { requests: db.requests.filter(function (q) { return isAdm || q.nickname === me.nick; })
          .sort(function (x, y) { return y.created_at.localeCompare(x.created_at) || y.id - x.id; }) });
      }
      if (m === 'POST') {
        var qn = String(b.name || '').trim();
        if (!qn) return err(400, '사케 이름을(를) 입력해 주세요.');
        var q = { id: ++db.qseq + 100, nickname: me.nick, name: qn.slice(0, 80), note: String(b.note || '').trim().slice(0, 200), done: false, created_at: new Date().toISOString() };
        db.requests.push(q); return res(200, { ok: true, request: q });
      }
      if (m === 'PATCH') {
        if (!isAdm) return err(403, '운영자만 할 수 있어요.');
        var q2 = db.requests.filter(function (x) { return x.id === b.id; })[0];
        if (!q2) return err(404, '이미 지워진 요청이에요.');
        q2.done = b.done === true; return res(200, { ok: true, id: q2.id, done: q2.done });
      }
      var q0 = db.requests.length;
      db.requests = db.requests.filter(function (x) { return !(x.id === id && (isAdm || x.nickname === me.nick)); });
      return q0 === db.requests.length ? err(404, '이미 지웠거나 내 요청이 아니에요.') : res(200, { ok: true });
    }
    if (path === '/api/ranking') {
      var rg = C.rangeFor(u.searchParams.get('period') || 'week', u.searchParams.get('offset'), today());
      rg.items = C.ranking(db.sakes, db.ratings, rg.start, rg.end);
      return res(200, rg);
    }
    if (path === '/api/my') return res(200, C.buildMy(me.nick, me.role, db.sakes, db.ratings, wishesOf(me.nick), ADMIN_NICK));
    if (path === '/api/wish') {
      if (!sake(b.sakeId)) return err(404, '등록되지 않았거나 삭제된 사케예요.');
      db.wishes = db.wishes.filter(function (w) { return !(w.nickname === me.nick && w.sake_id === b.sakeId); });
      if (b.on === true) db.wishes.push({ nickname: me.nick, sake_id: b.sakeId, created_at: new Date().toISOString() });
      return res(200, { ok: true, wished: b.on === true });
    }

    if (path === '/api/sakes') {
      if (m === 'GET') {
        var wl = wishesOf(me.nick).map(function (w) { return w.sake_id; });
        return res(200, { sakes: db.sakes.slice().reverse().map(function (s) {
          var mineAll = db.ratings.filter(function (r) { return r.sake_id === s.id && r.nickname === me.nick; }).sort(C.byLatest);
          var mine = mineAll[0];
          return { id: s.id, name: s.name, brewer: s.brewer, origin: s.origin, tint: s.tint, img_url: s.img_url, created_at: s.created_at, n: people(s.id),
            rated: !!mine, times: mineAll.length, days: mineAll.map(function (r) { return r.drank_on; }).filter(Boolean).sort(), drank_on: mine ? mine.drank_on : null, stars: mine ? (mine.stars == null ? null : mine.stars) : null, wished: wl.indexOf(s.id) >= 0 };
        }) });
      }
      if (me.role !== 'admin') return err(403, '운영자만 할 수 있어요.');
      if (m === 'DELETE') {
        db.sakes = db.sakes.filter(function (s) { return s.id !== id; });
        db.ratings = db.ratings.filter(function (r) { return r.sake_id !== id; });
        db.wishes = db.wishes.filter(function (w) { return w.sake_id !== id; });
        return res(200, { ok: true });
      }
      if (!String(b.name || '').trim()) return err(400, '술 이름을(를) 입력해 주세요.');
      var row = { name: b.name.trim(), rice: b.rice || '', polish: b.polish || '', abv: b.abv || '', smv: b.smv || '', acid: b.acid || '', brewer: b.brewer || '', origin: b.origin || '', desc_title: b.desc_title || '', desc_body: b.desc_body || '', tint: b.tint || '#4f7cac' };
      if (m === 'POST') { row.id = ++db.sseq; row.img_url = b.image || null; row.created_at = new Date().toISOString(); db.sakes.push(row); return res(200, { ok: true, sake: row }); }
      var s0 = sake(id); if (!s0) return err(404, '등록되지 않았거나 삭제된 사케예요.');
      for (var key in row) s0[key] = row[key];
      if (b.image) s0.img_url = b.image; else if (b.clearImage) s0.img_url = null;
      return res(200, { ok: true, sake: s0 });
    }

    if (path === '/api/sake') {
      var s = sake(id); if (!s) return err(404, '등록되지 않았거나 삭제된 사케예요.');
      var rows = db.ratings.filter(function (r) { return r.sake_id === id; });
      var ppl = C.latestPer(rows);
      var mineAll2 = rows.filter(function (r) { return r.nickname === me.nick; }).sort(C.byLatest);
      var out = { sake: s, n: ppl.length, rated: mineAll2.length > 0, wished: wishesOf(me.nick).some(function (w) { return w.sake_id === id; }), my: null, mine: [], avg: null, reviews: null };
      if (mineAll2.length) {
        var view = function (r) { return { id: r.id, v: r.v, t: r.comment, stars: r.stars == null ? null : r.stars, drank_on: r.drank_on, temp: r.temp || null, at: C.createdOf(r) }; };
        out.my = view(mineAll2[0]); out.mine = mineAll2.map(view);
        out.avg = [0, 1, 2, 3, 4].map(function (i) { return ppl.reduce(function (acc, r) { return acc + r.v[i]; }, 0) / ppl.length; });
        var st = C.latestPer(rows.filter(function (r) { return typeof r.stars === 'number'; }));
        out.stars_n = st.length; out.avg_stars = st.length ? st.reduce(function (acc, r) { return acc + r.stars; }, 0) / st.length : null;
        out.reviews = rows.slice().sort(function (x, y) { return C.createdOf(y).localeCompare(C.createdOf(x)) || y.id - x.id; }).map(function (r) {
          return { id: r.id, nick: r.nickname, t: r.comment, at: C.createdOf(r), stars: r.stars == null ? null : r.stars, temp: r.temp || null, mine: r.nickname === me.nick, admin: r.nickname === ADMIN_NICK };
        });
      }
      return res(200, out);
    }

    if (path === '/api/rate') {
      if (m === 'DELETE') {
        var n0 = db.ratings.length;
        db.ratings = db.ratings.filter(function (x) { return !(x.id === id && x.nickname === me.nick); });
        return n0 === db.ratings.length ? err(404, '이미 지웠거나 내 리뷰가 아니에요.') : res(200, { ok: true });
      }
      if (!sake(b.sakeId)) return err(404, '등록되지 않았거나 삭제된 사케예요.');
      if (b.drankOn > today()) return err(400, '미래 날짜는 고를 수 없어요.');
      var before = C.profile(me.nick, db.sakes, db.ratings);
      var nowIso = new Date().toISOString();
      if (b.temp != null && ['cold', 'room', 'warm', 'hot'].indexOf(b.temp) < 0) return err(400, '마신 온도를 다시 골라 주세요.');
      var data = { v: b.v, comment: b.comment || '', drank_on: b.drankOn || today(), stars: b.stars, temp: b.temp || null, updated_at: nowIso };
      var rid;
      if (b.id) {
        var r0 = db.ratings.filter(function (x) { return x.id === b.id && x.nickname === me.nick && x.sake_id === b.sakeId; })[0];
        if (!r0) return err(404, '이미 지웠거나 내 리뷰가 아니에요.');
        for (var k2 in data) r0[k2] = data[k2];
        rid = r0.id;
      } else {
        data.id = rid = ++db.rseq; data.sake_id = b.sakeId; data.nickname = me.nick; data.created_at = nowIso; db.ratings.push(data);
      }
      var after = C.profile(me.nick, db.sakes, db.ratings);
      var had = before.badges.filter(function (x) { return x.got; }).map(function (x) { return x.id; });
      return res(200, { ok: true, id: rid,
        newBadges: after.badges.filter(function (x) { return x.got && had.indexOf(x.id) < 0; }).map(function (x) { return { id: x.id, name: x.name }; }),
        levelUp: after.level.lv > before.level.lv ? { lv: after.level.lv, title: after.level.title } : null });
    }
    return err(404, '없는 주소예요.');
  };
})();
