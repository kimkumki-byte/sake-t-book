/* 사케치북 화면 코드
   - 데이터는 모두 서버(/api/...)에서 받아와요.
   - 주소 뒤의 #/... 로 화면을 바꿔서 폰의 뒤로가기 버튼도 동작해요.
*/
(function () {
  'use strict';

  /* ---------- 고정 값 ---------- */
  var TINTS = ['#4f7cac', '#6a8f7b', '#b08a4a', '#a05a6e', '#6b6fb0'];
  var ITEMS = [
    { n: '단맛', lo: '드라이해요', hi: '매우 달아요', w: ['드라이해요', '단맛이 약한 편이에요', '적당해요', '단 편이에요', '매우 달아요'] },
    { n: '산미', lo: '거의 없어요', hi: '매우 상큼해요', w: ['거의 없어요', '산미가 약한 편이에요', '적당해요', '상큼한 편이에요', '매우 상큼해요'] },
    { n: '바디감', lo: '가볍고 깔끔해요', hi: '묵직하고 진해요', w: ['가볍고 깔끔해요', '가벼운 편이에요', '적당해요', '묵직한 편이에요', '묵직하고 진해요'] },
    { n: '알콜감', lo: '부드러워요', hi: '알코올이 강해요', w: ['부드러워요', '부드러운 편이에요', '적당해요', '알코올이 느껴져요', '알코올이 강해요'] },
    { n: '여운', lo: '금방 사라져요', hi: '오래 남아요', w: ['금방 사라져요', '짧은 편이에요', '적당해요', '긴 편이에요', '오래 남아요'] }
  ];
  var EMPTY_FORM = { id: null, name: '', rice: '', polish: '', abv: '', smv: '', acid: '', brewer: '', origin: '', desc_title: '', desc_body: '', tint: TINTS[0], img_url: null, image: null, clearImage: false };

  /* ---------- 상태 ---------- */
  var S = {
    me: null,            // { role: 'guest' | 'admin', nickname }
    adminNick: '',
    authTab: 'login',
    authErr: '',
    showOpLogin: false,
    sakes: null,         // 목록
    detail: null,        // 상세 (서버 응답 그대로)
    draft: null,         // 작성 중인 평가 { id, v, t }
    form: clone(EMPTY_FORM), // 운영자 등록/수정 폼
    formErr: '',
    delId: null,
    busy: false,
    loadErr: '',
    // 목록 분류·검색·캘린더
    F: { tab: 'all', q: '', scope: 'all', sort: 'new', view: 'list', month: null, day: null },
    aq: '',              // 운영자 관리 목록 검색어
    home: null,          // 홈 데이터
    rank: { period: 'all', offset: 0, data: null },
    my: null,            // MY 데이터
    mySort: 'new',
    acct: '', acctErr: '', byeConfirm: false, byePw: ''
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------- 서버와 통신 ---------- */
  function api(path, opts) {
    opts = opts || {};
    var init = { method: opts.method || 'GET', credentials: 'same-origin', headers: { 'X-Requested-With': 'sakechibuk' } };
    if (opts.body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }
    return fetch(path, init).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) {
          var e = new Error(data.error || (r.status === 413 ? '이미지가 너무 커요.' : '요청을 처리하지 못했어요.'));
          e.status = r.status;
          throw e;
        }
        return data;
      });
    }, function () {
      throw new Error('인터넷 연결을 확인해 주세요.');
    });
  }

  /* ---------- 작은 도우미 ---------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function charLen(s) { return Array.from(s || '').length; }
  function f1(n) { return (Math.round(n * 10) / 10).toFixed(1); }
  function stamp(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    var z = function (x) { return (x < 10 ? '0' : '') + x; };
    return (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + z(d.getHours()) + ':' + z(d.getMinutes());
  }
  var WD = ['일', '월', '화', '수', '목', '금', '토'];
  function pad(x) { return (x < 10 ? '0' : '') + x; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function todayStr() { return ymd(new Date()); }
  function parseYmd(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function md(s) { var d = parseYmd(s); return (d.getMonth() + 1) + '월 ' + d.getDate() + '일'; }
  function mdw(s) { var d = parseYmd(s); return md(s) + ' (' + WD[d.getDay()] + ')'; }
  var STAR_WORDS = ['', '별로였어요', '아쉬웠어요', '괜찮았어요', '좋았어요', '최고였어요'];
  function starWord(s) { return s ? s + '점 · ' + STAR_WORDS[Math.ceil(s)] : '별을 눌러 골라 주세요 (왼쪽 절반은 반 개)'; }
  // 마신 날짜를 "2026년 10월 6일 (화)"로
  function longDate(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return '날짜를 골라 주세요';
    var d = parseYmd(s);
    return d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일 (' + WD[d.getDay()] + ')';
  }
  function setDrank(v) {
    if (!S.draft) return;
    S.draft.d = v;
    var tx = $('drankText'); if (tx) tx.textContent = longDate(v);
  }
  // 별 5개 그리기 (n: 0~5, 소수면 반 별까지)
  function starsHtml(n, cls) {
    var out = '';
    for (var i = 1; i <= 5; i++) out += '<i class="st' + (n >= i ? ' on' : (n >= i - 0.5 ? ' half' : '')) + '" aria-hidden="true">★</i>';
    return '<span class="stars' + (cls ? ' ' + cls : '') + '" role="img" aria-label="별점 ' + (Math.round(n * 10) / 10) + '점">' + out + '</span>';
  }
  function isAdmin() { return S.me && S.me.role === 'admin'; }

  var toastTimer;
  function toast(msg, ms) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, ms || 2400);
  }
  // 받침에 따라 을/를
  function josa(word, a, b) {
    var s = String(word || ''), c = s.charCodeAt(s.length - 1);
    if (c >= 0xAC00 && c <= 0xD7A3) return (c - 0xAC00) % 28 ? a : b;
    if (/[0136789]$/.test(s)) return a;
    return b;
  }
  // "방금", "10분 전" …
  function ago(iso) {
    var d = new Date(iso), s = (Date.now() - d.getTime()) / 1000;
    if (isNaN(s)) return '';
    if (s < 60) return '방금';
    if (s < 3600) return Math.floor(s / 60) + '분 전';
    if (s < 86400) return Math.floor(s / 3600) + '시간 전';
    if (s < 86400 * 7) return Math.floor(s / 86400) + '일 전';
    return (d.getMonth() + 1) + '월 ' + d.getDate() + '일';
  }

  function bottle(tint) {
    var t = /^#[0-9a-fA-F]{6}$/.test(tint || '') ? tint : TINTS[0];
    return '<svg viewBox="-10 0 80 80" aria-hidden="true"><path d="M26 6h8v4c0 3 1 4 3 7 3 4 4 8 4 14v38a3 3 0 0 1-3 3H22a3 3 0 0 1-3-3V31c0-6 1-10 4-14 2-3 3-4 3-7z" fill="' + t + '"/><rect x="22" y="38" width="16" height="22" rx="1.5" fill="#fff" opacity=".88"/><rect x="26" y="43" width="8" height="1.8" fill="' + t + '"/><rect x="27.5" y="48" width="5" height="5" fill="' + t + '" opacity=".7"/><rect x="26" y="3" width="8" height="4" rx="1" fill="' + t + '" opacity=".8"/></svg>';
  }
  function pic(s) {
    return s.img_url ? '<img src="' + esc(s.img_url) + '" alt="" loading="lazy">' : bottle(s.tint);
  }
  // 운영자 표시: 닉네임 옆 파란 인증 마크
  var OP_MARK = '<span class="opv" role="img" aria-label="운영자" title="운영자"><svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="12.00,0.50 14.41,3.02 17.75,2.04 18.58,5.42 21.96,6.25 20.98,9.59 23.50,12.00 20.98,14.41 21.96,17.75 18.58,18.58 17.75,21.96 14.41,20.98 12.00,23.50 9.59,20.98 6.25,21.96 5.42,18.58 2.04,17.75 3.02,14.41 0.50,12.00 3.02,9.59 2.04,6.25 5.42,5.42 6.25,2.04 9.59,3.02" fill="#45a5f5"/><path d="M7.6 12.3l2.9 2.9 5.9-5.8" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="square"/></svg></span>';
  function badge(nick) {
    return nick === S.adminNick ? OP_MARK : '';
  }

  function topBar(sub, right) {
    return '<div class="top"><a class="brand" href="#/" data-a="home" aria-label="사케치북 홈으로"><span class="seal"><img src="/logo.png" alt=""></span>' +
      '<h1 class="display">사케치북' + (sub ? '<span class="sub">' + sub + '</span>' : '') + '</h1></a>' + (right || '') + '</div>';
  }

  /* ---------- 레이더 차트 ---------- */
  function radar(series) {
    var cx = 150, cy = 135, R = 84, n = 5;
    function pt(i, v) {
      var a = -Math.PI / 2 + i * 2 * Math.PI / n, r = R * v / 5;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    }
    var g = '', k, i;
    for (k = 1; k <= 5; k++) {
      g += '<polygon class="ring" points="' + [0, 1, 2, 3, 4].map(function (j) { return pt(j, k).join(','); }).join(' ') + '"/>';
    }
    for (i = 0; i < n; i++) {
      var e = pt(i, 5);
      g += '<line class="axis" x1="' + cx + '" y1="' + cy + '" x2="' + e[0] + '" y2="' + e[1] + '"/>';
    }
    series.forEach(function (s) {
      g += '<polygon class="' + s.cls + '" points="' + s.vals.map(function (v, j) { return pt(j, v).join(','); }).join(' ') + '"/>';
      if (s.cls === 'me') {
        s.vals.forEach(function (v, j) { var p = pt(j, v); g += '<circle class="dot-me" cx="' + p[0] + '" cy="' + p[1] + '" r="3.5"/>'; });
      }
    });
    ITEMS.forEach(function (it, j) {
      var a = -Math.PI / 2 + j * 2 * Math.PI / n, x = cx + (R + 20) * Math.cos(a), y = cy + (R + 20) * Math.sin(a), c = Math.cos(a);
      var anc = c > 0.3 ? 'start' : (c < -0.3 ? 'end' : 'middle');
      g += '<text x="' + x + '" y="' + (y + 5) + '" text-anchor="' + anc + '">' + it.n + '</text>';
    });
    return '<svg class="radar" viewBox="0 0 300 270" role="img" aria-label="맛 5각형 차트">' + g + '</svg>';
  }

  /* ---------- 주소(#/...) 해석 ---------- */
  function route() {
    var h = location.hash.replace(/^#\/?/, '');
    var p = h.split('/');
    if (p[0] === 'sake' && /^\d+$/.test(p[1] || '')) return { name: p[2] === 'rate' ? 'rate' : 'detail', id: +p[1] };
    if (p[0] === 'admin') return { name: 'admin' };
    if (p[0] === 'tasting') return { name: 'tasting' };
    if (p[0] === 'ranking') return { name: 'ranking' };
    if (p[0] === 'my') return { name: 'my' };
    return { name: 'home' };
  }
  function go(hash) {
    if (location.hash === hash) render(); else location.hash = hash;
  }

  /* ---------- 화면: 입장 ---------- */
  function vAuth() {
    if (S.showOpLogin) {
      return topBar('운영자 전용') +
        '<form class="panel stack" id="opform" novalidate>' +
        '<div class="field"><label for="oid">운영자 아이디</label><input id="oid" autocomplete="username" autocapitalize="off" spellcheck="false"></div>' +
        '<div class="field"><label for="opw">비밀번호</label><input id="opw" type="password" autocomplete="current-password"></div>' +
        (S.authErr ? '<p class="err" role="alert">' + esc(S.authErr) + '</p>' : '') +
        '<button class="btn" type="submit"' + (S.busy ? ' disabled' : '') + '>운영자 로그인</button></form>' +
        '<div class="linkrow"><button class="link" data-a="oplogin-toggle">게스트로 들어가기</button></div>';
    }
    var join = S.authTab === 'join';
    return topBar('기억력 한계를 극복하기 위한 사케 기록장') +
      '<form class="panel stack" id="authform" novalidate><div class="tabs" role="tablist">' +
      '<button type="button" role="tab" data-a="tab" data-t="login" aria-selected="' + (!join) + '">로그인</button>' +
      '<button type="button" role="tab" data-a="tab" data-t="join" aria-selected="' + join + '">처음이에요</button></div>' +
      '<div class="field"><label for="nick">닉네임</label><input id="nick" maxlength="12" autocomplete="username" placeholder="한글 닉네임 (최대 12자)"></div>' +
      '<div class="field"><label for="pw">비밀번호</label><input id="pw" type="password" autocomplete="' + (join ? 'new-password' : 'current-password') + '" placeholder="4자 이상"></div>' +
      (S.authErr ? '<p class="err" role="alert">' + esc(S.authErr) + '</p>' : '') +
      '<button class="btn" type="submit"' + (S.busy ? ' disabled' : '') + '>' + (join ? '가입하고 시작하기' : '로그인') + '</button>' +
      (join ? '<p class="tiny">비밀번호는 찾을 수 없으니 꼭 기억해 주세요.</p>' : '') + '</form>' +
      '<div class="linkrow"><button class="link" data-a="oplogin-toggle">운영자 로그인</button></div>';
  }

  /* ---------- 화면: 목록 (분류·검색·캘린더) ---------- */
  var SORTS = [['new', '최근 등록순'], ['drank', '최근 마신순'], ['stars', '내 별점순'], ['name', '이름순'], ['popular', '평가 많은순']];
  var SCOPES = [['all', '전체'], ['name', '이름'], ['brewer', '양조장'], ['origin', '원산지']];

  function matches(s, q, scope) {
    if (!q) return true;
    var name = (s.name || '').toLowerCase(), br = (s.brewer || '').toLowerCase(), og = (s.origin || '').toLowerCase();
    if (scope === 'name') return name.indexOf(q) >= 0;
    if (scope === 'brewer') return br.indexOf(q) >= 0;
    if (scope === 'origin') return og.indexOf(q) >= 0;
    return name.indexOf(q) >= 0 || br.indexOf(q) >= 0 || og.indexOf(q) >= 0;
  }

  function filtered() {
    var F = S.F, q = F.q.trim().toLowerCase();
    var list = S.sakes.filter(function (s) {
      if (F.tab === 'rated' && !s.rated) return false;
      if (F.tab === 'todo' && s.rated) return false;
      if (F.tab === 'wish' && !s.wished) return false;
      return matches(s, q, F.scope);
    });
    return sortList(list);
  }

  function sortList(list) {
    var by = {
      stars: function (x, y) { return (y.stars || 0) - (x.stars || 0) || x.name.localeCompare(y.name, 'ko'); },
      name: function (x, y) { return x.name.localeCompare(y.name, 'ko'); },
      popular: function (x, y) { return y.n - x.n || x.name.localeCompare(y.name, 'ko'); },
      drank: function (x, y) { return (y.drank_on || '').localeCompare(x.drank_on || '') || (y.created_at || '').localeCompare(x.created_at || ''); },
      'new': function (x, y) { return (y.created_at || '').localeCompare(x.created_at || '') || y.id - x.id; }
    }[S.F.sort] || null;
    return by ? list.slice().sort(by) : list;
  }

  function card(s) {
    return '<button class="card" data-a="nav" data-h="#/sake/' + s.id + '"><span class="pic">' + pic(s) + '</span><span class="body">' +
      '<span class="tiny">' + esc(s.brewer || ' ') + '</span><h3>' + esc(s.name) + '</h3>' +
      '<span class="row"><span class="chip ' + (s.rated ? 'done' : '') + '">' + (s.rated ? (s.drank_on ? md(s.drank_on) + ' 마심' : '평가 완료') : '평가 전') + '</span>' +
      (s.rated && s.stars ? '<span class="mystar num" aria-label="내 별점 ' + s.stars + '점">★ ' + s.stars + '</span>' : '') +
      '<span class="tiny num">' + s.n + '명</span></span></span></button>';
  }

  function mini(s) {
    return '<button class="mini" data-a="nav" data-h="#/sake/' + s.id + '"><span class="thumb">' + pic(s) + '</span>' +
      '<span class="t"><b>' + esc(s.name) + '</b><span class="tiny">' + esc([s.brewer, s.origin].filter(Boolean).join(' · ') || ' ') + '</span></span>' +
      '<span class="go" aria-hidden="true">›</span></button>';
  }

  function resultsHtml() {
    var list = filtered(), F = S.F;
    if (!S.sakes.length) {
      return '<div class="panel muted center">아직 등록된 사케가 없어요.' + (isAdmin() ? '<br>관리 화면에서 첫 사케를 등록해 주세요.' : '<br>운영자가 등록하면 여기에 보여요.') + '</div>';
    }
    if (!list.length) {
      var msg = F.q.trim() ? '"' + esc(F.q.trim()) + '"에 맞는 사케가 없어요.' :
        F.tab === 'rated' ? '아직 마신 사케가 없어요.<br>사케를 골라 첫 평가를 남겨 보세요.' :
        F.tab === 'todo' ? '등록된 사케를 모두 평가했어요.' :
        F.tab === 'wish' ? '찜한 사케가 없어요.<br>사케 화면에서 ♡를 눌러 보세요.' : '사케가 없어요.';
      return '<div class="panel muted center">' + msg + (F.q.trim() ? '<br><button class="link" data-a="clearq">검색어 지우기</button>' : '') + '</div>';
    }
    return (F.q.trim() ? '<p class="tiny" style="margin:0">검색 결과 ' + list.length + '개</p>' : '') +
      '<div class="grid">' + list.map(card).join('') + '</div>';
  }

  function listView() {
    var F = S.F, all = S.sakes.length, rated = S.sakes.filter(function (s) { return s.rated; }).length;
    var wished = S.sakes.filter(function (s) { return s.wished; }).length;
    var tabs = [['all', '전체', all], ['rated', '마신 사케', rated], ['todo', '평가할 사케', all - rated], ['wish', '찜', wished]];
    return '<div class="filters" role="tablist" aria-label="사케 분류">' + tabs.map(function (x) {
        return '<button role="tab" data-a="ftab" data-t="' + x[0] + '" aria-selected="' + (F.tab === x[0]) + '">' + x[1] + ' <span class="num">' + x[2] + '</span></button>';
      }).join('') + '</div>' +
      '<div class="searchbox"><span class="ic" aria-hidden="true"><svg viewBox="0 0 20 20"><circle cx="9" cy="9" r="6"/><path d="M14 14l4 4"/></svg></span>' +
      '<input id="q" type="search" enterkeyhint="search" autocomplete="off" placeholder="' + (F.scope === 'brewer' ? '양조장 이름으로 찾기' : F.scope === 'origin' ? '원산지로 찾기' : F.scope === 'name' ? '사케 이름으로 찾기' : '사케 이름, 양조장, 원산지로 찾기') + '" value="' + esc(F.q) + '" aria-label="검색">' +
      '<button class="clear" id="qclear" data-a="clearq" aria-label="검색어 지우기"' + (F.q ? '' : ' hidden') + '>×</button></div>' +
      '<div class="toolbar"><div class="seg" role="group" aria-label="검색 범위">' + SCOPES.map(function (x) {
        return '<button data-a="scope" data-s="' + x[0] + '" aria-pressed="' + (F.scope === x[0]) + '">' + x[1] + '</button>';
      }).join('') + '</div>' +
      '<label class="sortsel"><span class="sr">정렬</span><select id="sort">' + SORTS.map(function (x) {
        return '<option value="' + x[0] + '"' + (F.sort === x[0] ? ' selected' : '') + '>' + x[1] + '</option>';
      }).join('') + '</select></label></div>' +
      '<div id="results" class="stack" style="gap:10px">' + resultsHtml() + '</div>';
  }

  function calView() {
    var F = S.F, today = todayStr();
    var month = F.month || today.slice(0, 7);
    var y = +month.slice(0, 4), m = +month.slice(5, 7);
    var first = new Date(y, m - 1, 1), days = new Date(y, m, 0).getDate();
    var byDay = {};
    S.sakes.forEach(function (s) { if (s.rated && s.drank_on) (byDay[s.drank_on] = byDay[s.drank_on] || []).push(s); });
    var monthTotal = 0;
    Object.keys(byDay).forEach(function (k) { if (k.slice(0, 7) === month) monthTotal += byDay[k].length; });

    var h = '<div class="panel cal"><div class="calhead">' +
      '<button class="iconbtn" data-a="month" data-d="-1" aria-label="이전 달">‹</button>' +
      '<div class="center"><b class="num">' + y + '년 ' + m + '월</b><span class="tiny">이번 달 ' + monthTotal + '병 평가</span></div>' +
      '<button class="iconbtn" data-a="month" data-d="1" aria-label="다음 달">›</button></div>' +
      '<div class="calgrid" role="grid">' + WD.map(function (w, i) { return '<span class="wd' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '') + '">' + w + '</span>'; }).join('');
    for (var i = 0; i < first.getDay(); i++) h += '<span></span>';
    for (var d = 1; d <= days; d++) {
      var key = month + '-' + pad(d), cnt = (byDay[key] || []).length, wd = (first.getDay() + d - 1) % 7;
      h += '<button class="day' + (key === today ? ' today' : '') + (cnt ? ' has' : '') + (F.day === key ? ' sel' : '') + (wd === 0 ? ' sun' : wd === 6 ? ' sat' : '') + '"' +
        ' data-a="day" data-d="' + key + '" aria-label="' + m + '월 ' + d + '일' + (cnt ? ', 사케 ' + cnt + '병' : '') + '" aria-pressed="' + (F.day === key) + '">' +
        '<span class="dn num">' + d + '</span><span class="dc num">' + (cnt || '') + '</span></button>';
    }
    h += '</div>';
    if (month !== today.slice(0, 7)) h += '<div class="linkrow"><button class="link" data-a="month" data-d="0">오늘로</button></div>';
    h += '</div>';

    // 아래 목록: 고른 날짜가 있으면 그날, 없으면 그 달 전체를 날짜별로
    if (F.day && F.day.slice(0, 7) === month) {
      var list = byDay[F.day] || [];
      h += '<div class="sec"><h2>' + mdw(F.day) + ' 마신 사케 ' + list.length + '</h2><button class="link" data-a="day" data-d="">달 전체 보기</button></div>';
      h += list.length ? '<div class="list">' + list.map(mini).join('') + '</div>' : '<div class="panel muted center">이 날은 평가한 사케가 없어요.</div>';
    } else {
      var keys = Object.keys(byDay).filter(function (k) { return k.slice(0, 7) === month; }).sort().reverse();
      h += '<div class="sec"><h2>' + m + '월에 마신 사케 ' + monthTotal + '</h2></div>';
      if (!keys.length) {
        h += '<div class="panel muted center">' + m + '월에 평가한 사케가 없어요.<br><span class="tiny">평가할 때 고른 "마신 날짜"로 여기에 모여요.</span></div>';
      } else {
        h += keys.map(function (k) {
          return '<div class="daygroup"><div class="dg tiny">' + mdw(k) + ' · ' + byDay[k].length + '병</div><div class="list">' + byDay[k].map(mini).join('') + '</div></div>';
        }).join('');
      }
    }
    return h;
  }

  function vTasting() {
    var right = '';
    if (!S.sakes) return topBar(esc(S.me.nickname)) + '<div class="loading">불러오는 중…</div>';
    var done = S.sakes.filter(function (s) { return s.rated; }).length;
    var who = isAdmin() ? esc(S.me.nickname) + ' ' + badge(S.me.nickname) : esc(S.me.nickname) + '님';
    var h = topBar(who + ' · 평가 ' + done + '/' + S.sakes.length, right);
    h += '<div class="viewtabs" role="tablist" aria-label="보기 방식">' +
      '<button role="tab" data-a="view" data-v="list" aria-selected="' + (S.F.view === 'list') + '">목록</button>' +
      '<button role="tab" data-a="view" data-v="cal" aria-selected="' + (S.F.view === 'cal') + '">마신 날짜별</button></div>';
    return h + (S.F.view === 'cal' ? calView() : listView());
  }

  /* ---------- 화면: 상세 ---------- */
  function specCell(label, value, unit, hint, wide) {
    var has = value !== '' && value != null;
    return '<div' + (wide ? ' class="wide"' : '') + '><dt>' + label + '</dt><dd' + (unit !== null ? ' class="num"' : '') + '>' +
      (has ? esc(value) + (unit || '') : '—') + (hint ? '<span class="hint">' + hint + '</span>' : '') + '</dd></div>';
  }

  // 이전 술 / 다음 술: 목록에서 보던 분류·검색·정렬 순서를 그대로 따라가요
  function neighbors(id) {
    if (!S.sakes) return null;
    var list = filtered();
    if (!list.some(function (x) { return x.id === id; })) list = sortList(S.sakes.slice());
    var i = -1;
    list.forEach(function (x, j) { if (x.id === id) i = j; });
    if (i < 0) return null;
    return { prev: list[i - 1] || null, next: list[i + 1] || null, pos: i + 1, total: list.length };
  }

  function pagerMini(nb) {
    if (!nb || nb.total < 2) return '';
    return '<span class="pmini">' +
      '<button class="iconbtn" data-a="nav" data-h="' + (nb.prev ? '#/sake/' + nb.prev.id : '') + '" aria-label="이전 술"' + (nb.prev ? '' : ' disabled') + '>‹</button>' +
      '<span class="tiny num">' + nb.pos + ' / ' + nb.total + '</span>' +
      '<button class="iconbtn" data-a="nav" data-h="' + (nb.next ? '#/sake/' + nb.next.id : '') + '" aria-label="다음 술"' + (nb.next ? '' : ' disabled') + '>›</button></span>';
  }

  function pagerBottom(nb) {
    if (!nb || nb.total < 2) return '';
    function one(x, dir) {
      var label = dir === 'prev' ? '‹ 이전 술' : '다음 술 ›';
      if (!x) return '<span class="pg ' + dir + ' off"><span class="tiny">' + label + '</span><b>' + (dir === 'prev' ? '처음이에요' : '마지막이에요') + '</b></span>';
      return '<button class="pg ' + dir + '" data-a="nav" data-h="#/sake/' + x.id + '"><span class="tiny">' + label + '</span><b>' + esc(x.name) + '</b></button>';
    }
    return '<nav class="pager" aria-label="이전 술, 다음 술">' + one(nb.prev, 'prev') + one(nb.next, 'next') + '</nav>';
  }

  function vDetail(id) {
    var back = topBar() + '<button class="back" data-a="nav" data-h="#/tasting">← 목록</button>';
    if (S.loadErr) return back + '<div class="panel center stack"><p class="err">' + esc(S.loadErr) + '</p><button class="btn ghost" data-a="nav" data-h="#/tasting">목록으로</button></div>';
    var d = S.detail;
    if (!d || d.sake.id !== id) return back + '<div class="loading">불러오는 중…</div>';
    var s = d.sake, nb = neighbors(id);
    var h = topBar() + '<div class="navrow"><button class="back" data-a="nav" data-h="#/tasting">← 목록</button>' + pagerMini(nb) + '</div>' +
      '<div class="hero">' + pic(s) + '</div>';
    h += '<div class="stack" style="gap:4px"><span class="tiny">' +
      (s.brewer ? '<button class="inlink" data-a="brewer" data-b="' + esc(s.brewer) + '" aria-label="' + esc(s.brewer) + ' 사케 모아보기">' + esc(s.brewer) + '</button>' : '') +
      (s.brewer && s.origin ? ' · ' : '') +
      (s.origin ? '<button class="inlink" data-a="origin" data-b="' + esc(s.origin) + '" aria-label="' + esc(s.origin) + ' 사케 모아보기">' + esc(s.origin) + '</button>' : '') +
      '</span><div class="namerow"><h2 class="display name">' + esc(s.name) + '</h2>' +
      '<button class="wish' + (d.wished ? ' on' : '') + '" data-a="wish" data-id="' + s.id + '" aria-pressed="' + !!d.wished + '" aria-label="마셔보고 싶어요">' +
      '<span class="hv" aria-hidden="true">' + (d.wished ? '♥' : '♡') + '</span><span>찜</span></button></div></div>';
    h += '<dl class="spec" style="margin:0">' +
      specCell('원료', s.rice, null, '', true) +
      specCell('정미율', s.polish, '%') +
      specCell('도수', s.abv, '%') +
      specCell('주도', s.smv, '', '낮을수록 단맛') +
      specCell('산도', s.acid, '', '높을수록 신맛') +
      specCell('주조사', s.brewer, null) +
      specCell('원산지', s.origin, null) + '</dl>';
    if (s.desc_title || s.desc_body) {
      h += '<section class="desc" aria-label="술 설명">' +
        (s.desc_title ? '<h3 class="desc-title">' + esc(s.desc_title) + '</h3>' : '') +
        (s.desc_body ? '<p class="desc-body">' + esc(s.desc_body) + '</p>' : '') + '</section>';
    }
    if (isAdmin()) h += '<button class="btn ghost" data-a="edit" data-id="' + s.id + '">사케 정보 수정</button>';

    if (!d.rated) {
      return h + '<div class="panel lock"><div class="ic" aria-hidden="true">&#128274;</div><h3>평균과 리뷰는 평가 후에 열려요</h3>' +
        '<p class="tiny" style="margin:0">먼저 내 입맛대로 평가해야 다른 사람 영향 없이 비교할 수 있어요.<br>지금 ' + d.n + '명이 평가했어요.</p>' +
        '<button class="btn" data-a="nav" data-h="#/sake/' + s.id + '/rate">내 평가 남기기</button></div>' + pagerBottom(nb);
    }

    var my = d.my.v, a = d.avg;
    h += '<div class="panel stack"><div class="sec"><h2>내 평가 vs 평균</h2><span class="tiny num">나 포함 ' + d.n + '명</span></div>' +
      (d.my.drank_on ? '<p class="tiny" style="margin:-8px 0 0">' + mdw(d.my.drank_on) + '에 마셨어요</p>' : '') +
      '<div class="satis"><div><span class="tiny">내 만족도</span>' +
        (d.my.stars ? '<span class="sv">' + starsHtml(d.my.stars) + '<b class="num">' + d.my.stars + '</b></span>' : '<span class="tiny">별점 없음</span>') + '</div>' +
      '<div><span class="tiny">평균 만족도' + (d.stars_n ? ' (' + d.stars_n + '명)' : '') + '</span>' +
        (d.avg_stars != null ? '<span class="sv">' + starsHtml(d.avg_stars) + '<b class="num">' + f1(d.avg_stars) + '</b></span>' : '<span class="tiny">아직 없어요</span>') + '</div></div>' +
      radar([{ cls: 'avg', vals: a }, { cls: 'me', vals: my }]) +
      '<div class="legend"><span><i></i>내 평가</span><span><i class="avg"></i>전체 평균</span></div>' +
      '<div class="cmp">' + ITEMS.map(function (it, i) {
        var diff = my[i] - a[i];
        var t = Math.abs(diff) < 0.5 ? '평균과 비슷해요' : (diff > 0 ? '평균보다 높게 느꼈어요' : '평균보다 낮게 느꼈어요');
        return '<div><b>' + it.n + '</b><span class="t">' + t + '</span><span class="v num"><em class="me">' + my[i] + '</em> / <em class="avg">' + f1(a[i]) + '</em></span></div>';
      }).join('') + '</div>' +
      '<button class="btn ghost" data-a="nav" data-h="#/sake/' + s.id + '/rate">내 평가 수정</button></div>';

    h += '<div class="sec"><h2>리뷰 ' + d.reviews.length + '</h2></div><div class="list">' +
      d.reviews.slice().sort(function (x, y) { return (y.mine ? 1 : 0) - (x.mine ? 1 : 0); }).map(function (r) {
        return '<article class="review' + (r.mine ? ' mine' : '') + '"><div class="head"><b>' + esc(r.nick) + '</b>' + badge(r.nick) +
          (r.mine ? '<span class="chip done">나</span>' : '') + (r.stars ? starsHtml(r.stars, 'sm') : '') + '<span class="date num">' + stamp(r.at) + '</span></div>' +
          '<p>' + (r.t ? esc(r.t) : '<span class="muted">한줄평이 없어요</span>') + '</p></article>';
      }).join('') + '</div>';
    return h + pagerBottom(nb);
  }

  /* ---------- 화면: 평가 ---------- */
  function vRate(id) {
    var d = S.detail;
    if (!d || d.sake.id !== id) return topBar() + '<button class="back" data-a="nav" data-h="#/tasting">← 목록</button><div class="loading">불러오는 중…</div>';
    if (!S.draft || S.draft.id !== id) {
      S.draft = d.my ? { id: id, v: d.my.v.slice(), t: d.my.t, d: d.my.drank_on || todayStr(), s: d.my.stars || 0 } : { id: id, v: [3, 3, 3, 3, 3], t: '', d: todayStr(), s: 0 };
    }
    var dr = S.draft;
    var h = topBar() + '<button class="back" data-a="nav" data-h="#/sake/' + id + '">← ' + esc(d.sake.name) + '</button>';
    h += '<div class="panel stack"><h2 class="display" style="font-size:16px">' + (d.my ? '평가 수정' : '어떤 맛이었나요?') + '</h2><div id="rchart">' + radar([{ cls: 'me', vals: dr.v }]) + '</div></div>';
    h += '<div class="panel starpick"><div class="l"><b>만족도</b><span id="swd">' + starWord(dr.s) + '</span></div>' +
      '<div class="stars big" role="radiogroup" aria-label="만족도 별점 (반 개 단위)">' + [1, 2, 3, 4, 5].map(function (n) {
        return '<span class="sw"><i class="st' + (dr.s >= n ? ' on' : (dr.s >= n - 0.5 ? ' half' : '')) + '" data-k="' + n + '" aria-hidden="true">★</i>' +
          '<button type="button" class="hz l" data-a="star" data-n="' + (n - 0.5) + '" role="radio" aria-checked="' + (dr.s === n - 0.5) + '" aria-label="별 ' + (n - 0.5) + '개"></button>' +
          '<button type="button" class="hz r" data-a="star" data-n="' + n + '" role="radio" aria-checked="' + (dr.s === n) + '" aria-label="별 ' + n + '개"></button></span>';
      }).join('') + '</div><span class="tiny">맛 점수와 따로, 전체적으로 얼마나 만족스러웠는지 골라 주세요.</span></div>';
    h += '<div class="field"><label for="drank">마신 날짜</label><div class="daterow"><div class="datebox"><span class="dtext" id="drankText">' + longDate(dr.d) + '</span>' +
      '<svg class="dic" viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="4.5" width="14" height="12" rx="2"/><path d="M3 8.5h14M7 3v3M13 3v3"/></svg>' +
      '<input id="drank" type="date" value="' + esc(dr.d) + '" max="' + todayStr() + '" min="2000-01-01"></div>' +
      '<button type="button" class="btn small ghost" data-a="drank-today">오늘</button></div><span class="tiny">"마신 날짜별" 캘린더에 이 날짜로 모여요.</span></div>';
    h += '<div class="panel" style="padding-block:6px">' + ITEMS.map(function (it, i) {
      return '<div class="rate"><div class="l"><b>' + it.n + '</b><span id="w' + i + '">' + it.w[dr.v[i] - 1] + '</span></div>' +
        '<input class="slider" id="sl' + i + '" data-i="' + i + '" type="range" min="1" max="5" step="1" value="' + dr.v[i] + '" aria-label="' + it.n + '" style="--p:' + ((dr.v[i] - 1) * 25) + '%">' +
        '<div class="ticks" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>' +
        '<div class="ends"><span>' + it.lo + '</span><span>' + it.hi + '</span></div></div>';
    }).join('') + '</div>';
    var c = charLen(dr.t);
    h += '<div class="field"><label for="cmt">한줄평 (50자 이내)</label><textarea id="cmt" maxlength="50" placeholder="향, 맛, 어울리는 음식 등 편하게 남겨 주세요">' + esc(dr.t) + '</textarea>' +
      '<div class="count num' + (c >= 50 ? ' full' : '') + '" id="cnt">' + c + ' / 50</div></div>';
    h += '<p class="err" id="rateerr" role="alert" hidden></p>';
    h += '<div class="sticky"><button class="btn ghost" data-a="nav" data-h="#/sake/' + id + '" style="width:34%">취소</button>' +
      '<button class="btn" data-a="save"' + (S.busy ? ' disabled' : '') + '>저장하고 결과 보기</button></div>';
    return h;
  }

  /* ---------- 화면: 운영자 관리 (등록·수정·삭제) ---------- */
  function vAdmin() {
    var f = S.form, editing = f.id !== null;
    var h = topBar(esc(S.me.nickname) + ' ' + badge(S.me.nickname) + ' · 사케 관리') +
      '<button class="back" data-a="nav" data-h="#/my">← MY</button>';
    var prev = f.image ? '<img src="' + f.image + '" alt="">' : (f.img_url && !f.clearImage ? '<img src="' + esc(f.img_url) + '" alt="">' : bottle(f.tint));
    var usingTemp = !f.image && (!f.img_url || f.clearImage);
    h += '<form class="panel stack" id="sakeform" novalidate>' +
      '<div class="sec" style="padding:0"><h2 class="display" style="font-size:16px">' + (editing ? '사케 정보 수정' : '새 사케 등록') + '</h2>' +
      (editing ? '<button type="button" class="link" data-a="edit-cancel">수정 취소</button>' : '') + '</div>' +
      '<div class="field"><label for="oimg">술 이미지 <span class="muted" style="font-weight:400">(정사각형 · 흰 배경 사진)</span></label>' +
      '<div class="preview" id="oprev">' + prev + '</div>' +
      '<input id="oimg" type="file" accept="image/jpeg,image/png,image/webp">' +
      '<span class="tiny">' + (editing && f.img_url && !f.clearImage && !f.image ? '새 사진을 고르지 않으면 지금 사진을 그대로 써요. 임시 이미지를 누르면 사진 대신 쓸 수 있어요.' : '사진이 아직 없으면 아래에서 임시 이미지를 골라 주세요.') + '</span>' +
      '<div class="tmps" role="group" aria-label="임시 이미지 선택">' + TINTS.map(function (c, i) {
        return '<button type="button" class="tmp" data-a="tmp" data-c="' + c + '" aria-label="임시 이미지 ' + (i + 1) + '" aria-pressed="' + (usingTemp && f.tint === c) + '">' + bottle(c) + '</button>';
      }).join('') + '</div></div>' +
      field('oname', 'name', '술 이름 <span class="muted" style="font-weight:400">(필수)</span>', '예: 닷사이 준마이다이긴조 45', '', 80) +
      field('orice', 'rice', '원료', '예: 쌀, 쌀누룩', '', 80) +
      '<div class="grid2">' + field('opol', 'polish', '정미율 (%)', '예: 45', '', 6, 'decimal') + field('oabv', 'abv', '도수 (%)', '예: 16', '', 6, 'decimal') + '</div>' +
      '<div class="grid2">' + field('osmv', 'smv', '주도', '예: +3.0', '낮을수록 단맛 · 비워도 돼요', 7) + field('oacid', 'acid', '산도', '예: 1.4', '높을수록 신맛 · 비워도 돼요', 6, 'decimal') + '</div>' +
      '<div class="grid2">' + field('obr', 'brewer', '주조사', '예: 아사히주조', '', 60) + field('oor', 'origin', '원산지', '예: 야마구치현', '', 60) + '</div>' +
      '<div class="formsec"><b>술 설명</b><span class="tiny">사케 상세 화면에 제목과 본문으로 나뉘어 보여요. 비워 두면 표시되지 않아요.</span></div>' +
      field('odt', 'desc_title', '술 설명 제목', '예: 멜론 향이 퍼지는 부드러운 다이긴조', '', 40) +
      '<div class="field"><label for="odb">술 설명</label><textarea id="odb" data-k="desc_body" maxlength="1000" rows="5" placeholder="향, 맛, 어울리는 음식, 마시기 좋은 온도 등">' + esc(S.form.desc_body) + '</textarea>' +
      '<span class="tiny">줄바꿈은 그대로 보여요 · 최대 1000자</span></div>' +
      (S.formErr ? '<p class="err" role="alert">' + esc(S.formErr) + '</p>' : '') +
      '<button class="btn" type="submit"' + (S.busy ? ' disabled' : '') + '>' + (S.busy ? '저장 중…' : (editing ? '수정 내용 저장' : '등록하기')) + '</button></form>';

    if (!S.sakes) return h + '<div class="loading">불러오는 중…</div>';
    h += '<div class="sec"><h2 class="display" style="font-size:14px">등록된 사케 ' + S.sakes.length + '</h2></div>';
    if (!S.sakes.length) return h + '<div class="panel muted center">아직 등록된 사케가 없어요.</div>';
    h += '<div class="searchbox"><span class="ic" aria-hidden="true"><svg viewBox="0 0 20 20"><circle cx="9" cy="9" r="6"/><path d="M14 14l4 4"/></svg></span>' +
      '<input id="aq" type="search" autocomplete="off" placeholder="등록된 사케 이름, 양조장으로 찾기" value="' + esc(S.aq) + '" aria-label="등록된 사케 검색"></div>';
    h += '<div id="alist">' + adminListHtml() + '</div>';
    if (S.delId) h += '<p class="tiny center">삭제하면 그 사케의 평가와 리뷰도 모두 지워져요.</p>';
    return h;
  }

  function adminListHtml() {
    var f = S.form, q = S.aq.trim().toLowerCase();
    var list = S.sakes.filter(function (s) { return matches(s, q, 'all'); });
    if (!list.length) return '<div class="panel muted center">"' + esc(S.aq.trim()) + '"에 맞는 사케가 없어요.</div>';
    return '<div class="list">' + list.map(function (s) {
      var c = S.delId === s.id, cur = f.id === s.id;
      return '<div class="oprow"' + (cur ? ' style="border-color:var(--me)"' : '') + '><span class="thumb">' + pic(s) + '</span>' +
        '<span class="t"><b>' + esc(s.name) + '</b><span class="tiny">' + (cur ? '수정 중' : s.n + '명 평가') + '</span></span>' +
        (c ? '<button class="btn small ghost" data-a="del-cancel">취소</button>' : '<button class="btn small ghost" data-a="edit" data-id="' + s.id + '">수정</button>') +
        '<button class="btn small ' + (c ? 'danger' : 'ghost') + '" data-a="del" data-id="' + s.id + '">' + (c ? '정말 삭제' : '삭제') + '</button></div>';
    }).join('') + '</div>';
  }

  function field(id, key, label, ph, hint, max, mode) {
    return '<div class="field"><label for="' + id + '">' + label + '</label><input id="' + id + '" data-k="' + key + '" maxlength="' + max + '"' +
      (mode ? ' inputmode="' + mode + '"' : '') + ' value="' + esc(S.form[key]) + '" placeholder="' + ph + '">' +
      (hint ? '<span class="tiny">' + hint + '</span>' : '') + '</div>';
  }


  /* ---------- 공통 조각: 레벨, 랭킹 줄 ---------- */
  var ICON = {
    home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 10.5 12 3.5l8.5 7"/><path d="M5.5 9.5V20h4.5v-5.5h4V20h4.5V9.5"/></svg>',
    ranking: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 4h9v5a4.5 4.5 0 0 1-9 0z"/><path d="M7.5 6H4.5v1a3 3 0 0 0 3 3M16.5 6h3v1a3 3 0 0 1-3 3M12 13.5V17M8.5 20h7M9.5 17h5"/></svg>',
    tasting: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 3h4v3c0 .9.4 1.4 1.1 2.4.8 1.1 1.3 2.6 1.3 4.6v6.3A1.7 1.7 0 0 1 14.7 21H9.3a1.7 1.7 0 0 1-1.7-1.7V13c0-2 .5-3.5 1.3-4.6C9.6 7.4 10 6.9 10 6z"/><path d="M7.6 13.5h8.8"/></svg>',
    my: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c1.4-3.6 4.2-5.5 7.5-5.5s6.1 1.9 7.5 5.5"/></svg>'
  };
  // 뱃지마다 다른 그림과 색 (24칸 기준 선 그림)
  var BADGE_ART = {
    first: ['#c9971a', '<path d="M6 8h12l-1.5 8a2 2 0 0 1-2 1.6h-5a2 2 0 0 1-2-1.6z"/><path d="M8.5 20.5h7"/>'],
    comment10: ['#5230f5', '<path d="M4.5 5.5h15v9.5h-8l-4.5 3.5v-3.5H4.5z"/><path d="M8 9.2h8M8 11.8h5"/>'],
    brewer5: ['#2f8f6b', '<path d="M3.5 11 12 4.5l8.5 6.5"/><path d="M6 9.5V19.5h12V9.5"/><path d="M10 19.5v-5h4v5"/>'],
    origin5: ['#d9534f', '<path d="M12 21s-6.5-5.8-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.2 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.3"/>'],
    regular3: ['#e0426a', '<path d="M12 19.5s-7.5-4.6-7.5-9.7A4 4 0 0 1 12 7.6a4 4 0 0 1 7.5 2.2c0 5.1-7.5 9.7-7.5 9.7z"/>'],
    polish5: ['#a8853f', '<ellipse cx="9" cy="12" rx="2.7" ry="5" transform="rotate(-18 9 12)"/><ellipse cx="15" cy="12" rx="2.7" ry="5" transform="rotate(18 15 12)"/>'],
    dry3: ['#2f7fc1', '<path d="M12 4s-5.5 6.3-5.5 10a5.5 5.5 0 0 0 11 0C17.5 10.3 12 4 12 4z"/><path d="M5 19.5 19 5.5"/>'],
    sweet3: ['#e3832a', '<circle cx="12" cy="12" r="4"/><path d="M8.4 10 4 7.3v9.4L8.4 14M15.6 10 20 7.3v9.4L15.6 14"/>'],
    pioneer3: ['#127a8a', '<path d="M7 21V3.5"/><path d="M7 4.5h11l-3 4 3 4H7"/>'],
    session3: ['#8a4fd1', '<path d="M2.8 8.5h5.4l-.8 5H3.6zM9.3 8.5h5.4l-.8 5h-3.8zM15.8 8.5h5.4l-.8 5h-3.8z"/><path d="M3.5 17.5h17"/>'],
    weekend5: ['#3d4fa8', '<path d="M17 15.6A7 7 0 0 1 8.4 5.5a7.5 7.5 0 1 0 8.6 10.1z"/><path d="M17.5 4.5v3M16 6h3"/>'],
    weekly4: ['#3e9a4f', '<rect x="4" y="5.5" width="16" height="14" rx="2"/><path d="M4 10h16M8.5 3.5v3.5M15.5 3.5v3.5M9 14.8l2 2 4-4.2"/>'],
    month10: ['#b5532f', '<path d="M10.5 3h3v2.6c0 .8.4 1.3 1 2.1.7.9 1.1 2.1 1.1 3.7v7.4a1.4 1.4 0 0 1-1.4 1.4H9.8a1.4 1.4 0 0 1-1.4-1.4v-7.4c0-1.6.4-2.8 1.1-3.7.6-.8 1-1.3 1-2.1z"/><path d="M8.4 13.5h7.2"/>'],
    perfect: ['#e0a300', '<path d="M12 3.8l2.5 5.1 5.6.8-4.1 4 1 5.6-5-2.7-5 2.7 1-5.6-4.1-4 5.6-.8z"/>'],
    critic3: ['#4a5568', '<circle cx="10.5" cy="10.5" r="5.5"/><path d="M14.6 14.6 20 20"/><path d="M8 10.5h5"/>']
  };
  function badgeIcon(b) {
    var art = BADGE_ART[b.id] || ['#5230f5', '<circle cx="12" cy="12" r="5"/>'];
    return '<svg viewBox="0 0 40 40" aria-hidden="true"' + (b.got ? ' style="--bc:' + art[0] + '"' : '') + '>' +
      '<circle class="bgc" cx="20" cy="20" r="18.5"/><g class="gl" transform="translate(8 8)">' + art[1] + '</g></svg>';
  }

  function tabbar(r) {
    var cur = r.name === 'home' ? 'home' : r.name === 'ranking' ? 'ranking' : (r.name === 'my' || r.name === 'admin') ? 'my' : 'tasting';
    var T = [['home', '#/', '홈'], ['ranking', '#/ranking', '랭킹'], ['tasting', '#/tasting', '테이스팅'], ['my', '#/my', 'MY']];
    return '<nav class="tabbar" aria-label="메뉴"><div class="tbin">' + T.map(function (x) {
      return '<button class="tb' + (cur === x[0] ? ' on' : '') + '" data-a="tabnav" data-h="' + x[1] + '"' + (cur === x[0] ? ' aria-current="page"' : '') + '>' +
        ICON[x[0]] + '<span>' + x[2] + '</span></button>';
    }).join('') + '</div></nav>';
  }

  function lvBlock(p) {
    var L = p.level, pct = Math.max(0, Math.min(100, Math.round((L.progress || 0) * 100)));
    return '<div class="lv"><div class="lvtop"><span class="lvchip num">Lv.' + L.lv + '</span><b class="lvtitle">' + esc(L.title) + '</b></div>' +
      '<div class="bar" role="progressbar" aria-label="다음 레벨까지" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><i style="width:' + pct + '%"></i></div>' +
      '<span class="tiny">' + (L.next ? '다음 레벨 \'' + esc(L.next.title) + '\'까지 ' + L.next.remain + '병' : '최고 레벨이에요') + '</span></div>';
  }

  function rankRow(it) {
    return '<button class="rrow' + (it.rank <= 3 ? ' top r' + it.rank : '') + '" data-a="nav" data-h="#/sake/' + it.id + '">' +
      '<span class="rk num">' + it.rank + '</span><span class="thumb">' + pic(it) + '</span>' +
      '<span class="t"><b>' + esc(it.name) + '</b><span class="tiny">' + esc([it.brewer, it.origin].filter(Boolean).join(' · ') || ' ') + '</span></span>' +
      '<span class="rs"><span class="rsv">' + starsHtml(it.avg, 'sm') + '<b class="num">' + f1(it.avg) + '</b></span><span class="tiny num">' + it.n + '명</span></span></button>';
  }

  /* ---------- 화면: 홈 ---------- */
  function vHome() {
    var h = topBar('기억력 한계를 극복하기 위한 사케 기록장'), d = S.home;
    if (!d) return h + '<div class="loading">불러오는 중…</div>';
    var me = d.me;
    h += '<section class="panel lvcard"><p class="hello">' + esc(me.nickname) + (isAdmin() ? ' ' + badge(me.nickname) : '님') +
      ', 지금까지 <b class="num">' + me.count + '병</b> 평가했어요</p>' + lvBlock(me) +
      '<button class="link lvlink" data-a="nav" data-h="#/my">뱃지 ' + me.badges_got + ' / ' + me.badges_total + ' ›</button></section>';
    if (d.total) {
      h += d.todo
        ? '<button class="todo" data-a="todo"><span>아직 안 마신 사케 <b class="num">' + d.todo + '병</b></span><span class="go">평가하러 가기 ›</span></button>'
        : '<div class="todo done"><span>등록된 사케를 모두 평가했어요</span></div>';
    }
    h += '<section class="hsec"><div class="sec"><h2>새로 들어온 사케</h2>' + (d.fresh.length ? '<button class="link" data-a="nav" data-h="#/tasting">전체 ›</button>' : '') + '</div>';
    h += d.fresh.length ? '<div class="hscroll">' + d.fresh.map(function (s) {
      return '<button class="fcard" data-a="nav" data-h="#/sake/' + s.id + '"><span class="pic">' + pic(s) + (s.is_new ? '<span class="newtag">NEW</span>' : '') + '</span>' +
        '<b>' + esc(s.name) + '</b><span class="tiny">' + esc(s.brewer || ' ') + (s.rated ? ' · 마심' : '') + '</span></button>';
    }).join('') + '</div>' : '<div class="panel muted center">아직 등록된 사케가 없어요.</div>';
    h += '</section><section class="hsec"><div class="sec"><h2>테이스팅 랭킹 TOP 3</h2><button class="link" data-a="ranktop">전체 ›</button></div>';
    h += d.top.items.length ? '<div class="list">' + d.top.items.map(rankRow).join('') + '</div>'
      : '<div class="panel muted center">아직 별점이 남겨진 사케가 없어요.</div>';
    h += '</section><section class="hsec"><div class="sec"><h2>친구들의 최근 시음</h2></div>';
    h += d.feed.length ? '<div class="feed">' + d.feed.map(function (f) {
      return '<button class="fitem" data-a="nav" data-h="#/sake/' + f.sake.id + '"><span class="ft"><b>' + esc(f.nick) + '</b>' + (f.admin ? OP_MARK : '') +
        '님이 <b>' + esc(f.sake.name) + '</b>' + josa(f.sake.name, '을', '를') + ' 평가했어요</span><span class="tiny num">' + ago(f.at) + '</span></button>';
    }).join('') + '</div>' : '<div class="panel muted center">아직 친구들의 기록이 없어요.</div>';
    return h + '</section>';
  }

  /* ---------- 화면: 랭킹 ---------- */
  var PERIOD_TABS = [['all', '전체'], ['month', '월간'], ['week', '주간'], ['day', '일간']];
  function periodLabel(d) {
    if (d.period === 'all') return '전체 기간';
    if (d.period === 'day') return longDate(d.start);
    if (d.period === 'month') { var p = parseYmd(d.start); return p.getFullYear() + '년 ' + (p.getMonth() + 1) + '월'; }
    return md(d.start) + ' ~ ' + md(d.end);
  }
  function vRanking() {
    var R = S.rank, d = R.data;
    var h = topBar() + '<div class="pagehead"><h2 class="pagetitle">랭킹</h2><span class="tiny">만족도 별점 평균 · 마신 날짜 기준</span></div>';
    h += '<div class="rtabs" role="tablist" aria-label="기간">' + PERIOD_TABS.map(function (x) {
      return '<button role="tab" data-a="period" data-p="' + x[0] + '" aria-selected="' + (R.period === x[0]) + '">' + x[1] + '</button>';
    }).join('') + '</div>';
    var ready = d && d.period === R.period && (R.period === 'all' || d.offset === R.offset);
    if (R.period !== 'all') {
      h += '<div class="pnav"><button class="iconbtn" data-a="poffset" data-d="-1" aria-label="이전 기간">‹</button>' +
        '<b class="num" id="plabel">' + (ready ? periodLabel(d) : '…') + '</b>' +
        '<button class="iconbtn" data-a="poffset" data-d="1" aria-label="다음 기간"' + (R.offset >= 0 ? ' disabled' : '') + '>›</button></div>';
    }
    if (!ready) return h + '<div class="loading">불러오는 중…</div>';
    if (!d.items.length) return h + '<div class="panel muted center">이 기간에는 평가된 사케가 없어요.</div>';
    return h + '<div class="list">' + d.items.map(rankRow).join('') + '</div>';
  }

  /* ---------- 화면: MY ---------- */
  function badgeTile(b) {
    return '<div class="bdg' + (b.got ? ' got' : '') + '" data-badge="' + esc(b.id) + '"><span class="bi">' + badgeIcon(b) + '</span><b>' + esc(b.name) + '</b>' +
      '<span class="tiny">' + esc(b.desc) + '</span>' +
      (b.got ? '<span class="bst ok">획득</span>' : '<span class="bst num">' + b.cur + ' / ' + b.goal + '</span>') + '</div>';
  }

  function topCount(list, keyFn) {
    var m = {}, best = null;
    list.forEach(function (x) { var k = keyFn(x); if (k) m[k] = (m[k] || 0) + 1; });
    Object.keys(m).forEach(function (k) { if (!best || m[k] > best.n) best = { k: k, n: m[k] }; });
    return best;
  }

  function yearReport(d) {
    var year = todayStr().slice(0, 4);
    var list = d.reviews.filter(function (r) { return r.drank_on && r.drank_on.slice(0, 4) === year; });
    var h = '<div class="sec"><h2>' + year + '년 리포트</h2></div>';
    if (!list.length) return h + '<div class="panel muted center">올해는 아직 기록이 없어요.</div>';
    var best = list.filter(function (r) { return r.stars != null; }).sort(function (a, b) { return b.stars - a.stars || String(b.drank_on).localeCompare(String(a.drank_on)); })[0];
    var br = topCount(list, function (r) { return (r.sake.brewer || '').trim(); });
    var og = topCount(list, function (r) { return (r.sake.origin || '').trim(); });
    var mo = topCount(list, function (r) { return r.drank_on.slice(0, 7); });
    function tile(label, value, sub) { return '<div class="rp"><span class="tiny">' + label + '</span><b>' + value + '</b>' + (sub ? '<span class="tiny num">' + sub + '</span>' : '') + '</div>'; }
    return h + '<div class="report panel">' +
      '<div class="rp big"><span class="tiny">올해 마신 사케</span><b class="num">' + list.length + '병</b></div>' +
      tile('가장 높게 준 사케', best ? esc(best.sake.name) : '—', best ? '★ ' + best.stars : '') +
      tile('가장 많이 마신 달', mo ? (+mo.k.slice(5, 7)) + '월' : '—', mo ? mo.n + '병' : '') +
      tile('가장 많이 마신 양조장', br ? esc(br.k) : '—', br ? br.n + '병' : '') +
      tile('가장 많이 마신 원산지', og ? esc(og.k) : '—', og ? og.n + '병' : '') + '</div>';
  }

  function myReview(r) {
    return '<button class="mrev" data-a="nav" data-h="#/sake/' + r.sake.id + '"><span class="thumb">' + pic(r.sake) + '</span><span class="t">' +
      '<b>' + esc(r.sake.name) + '</b><span class="mrow">' + (r.stars != null ? starsHtml(r.stars, 'sm') + '<span class="num tiny">' + r.stars + '</span>' : '<span class="tiny">별점 없음</span>') +
      (r.drank_on ? '<span class="tiny">· ' + md(r.drank_on) + ' 마심</span>' : '') + '</span>' +
      (r.comment ? '<span class="cm">' + esc(r.comment) + '</span>' : '') + '</span></button>';
  }

  function acctRow(k, label, body) {
    var open = S.acct === k;
    return '<button class="menurow" data-a="acct" data-k="' + k + '" aria-expanded="' + open + '"><span>' + label + '</span><span class="go" aria-hidden="true">' + (open ? '−' : '›') + '</span></button>' +
      (open ? '<div class="afbox">' + body + '</div>' : '');
  }

  function acctHtml(d) {
    var err = S.acctErr ? '<p class="err" role="alert">' + esc(S.acctErr) + '</p>' : '';
    if (d.role === 'admin') {
      return '<p class="tiny" style="margin:0 0 6px">운영자 계정의 닉네임·비밀번호는 Vercel 설정(ADMIN_NICK, ADMIN_PASSWORD)에서 바꿔요.</p>' +
        '<button class="menurow" data-a="logout"><span>로그아웃</span><span class="go">›</span></button>';
    }
    return acctRow('nick', '닉네임 변경',
        '<form id="nickform" class="stack" novalidate><div class="field"><label for="newnick">새 닉네임</label><input id="newnick" maxlength="12" value="' + esc(d.nickname) + '"></div>' + err +
        '<button class="btn" type="submit">닉네임 바꾸기</button><span class="tiny">바꾸면 예전에 쓴 리뷰에도 새 닉네임이 보여요.</span></form>') +
      acctRow('pw', '비밀번호 변경',
        '<form id="pwform" class="stack" novalidate><div class="field"><label for="curpw">지금 비밀번호</label><input id="curpw" type="password" autocomplete="current-password"></div>' +
        '<div class="field"><label for="newpw">새 비밀번호</label><input id="newpw" type="password" autocomplete="new-password" placeholder="4자 이상"></div>' +
        '<div class="field"><label for="newpw2">새 비밀번호 확인</label><input id="newpw2" type="password" autocomplete="new-password"></div>' + err +
        '<button class="btn" type="submit">비밀번호 바꾸기</button></form>') +
      '<button class="menurow" data-a="logout"><span>로그아웃</span><span class="go" aria-hidden="true">›</span></button>' +
      acctRow('bye', '회원 탈퇴',
        '<form id="byeform" class="stack" novalidate><p class="tiny" style="margin:0">탈퇴하면 내가 쓴 리뷰 ' + d.reviews.length + '개와 찜이 모두 지워지고, 되돌릴 수 없어요.</p>' +
        (S.byeConfirm
          ? err + '<p class="err" style="margin:0">정말 탈퇴할까요? 아래 버튼을 누르면 바로 탈퇴돼요.</p><div class="row2"><button type="button" class="btn ghost" data-a="bye-cancel">취소</button><button class="btn danger" type="submit">정말 탈퇴</button></div>'
          : '<div class="field"><label for="byepw">비밀번호 확인</label><input id="byepw" type="password" autocomplete="current-password"></div>' + err + '<button class="btn danger" type="submit">탈퇴하기</button>') +
        '</form>');
  }

  function vMy() {
    var h = topBar(), d = S.my;
    if (!d) return h + '<div class="loading">불러오는 중…</div>';
    h += '<section class="panel lvcard"><div class="mytop"><b class="mynick">' + esc(d.nickname) + '</b>' + (d.role === 'admin' ? badge(d.nickname) : '') + '</div>' + lvBlock(d) +
      '<div class="mystats"><div><b class="num">' + d.count + '병</b><span class="tiny">평가</span></div>' +
      '<div><b class="num">' + d.badges_got + '/' + d.badges_total + '</b><span class="tiny">뱃지</span></div>' +
      '<div><b class="num">' + (d.avg_stars != null ? '★ ' + f1(d.avg_stars) : '—') + '</b><span class="tiny">내가 준 평균 별점</span></div></div></section>';
    if (d.role === 'admin') h += '<button class="menurow panel" data-a="nav" data-h="#/admin"><span>운영자 메뉴 · 사케 등록·관리</span><span class="go">›</span></button>';
    h += yearReport(d);
    h += '<div class="sec"><h2>뱃지 모음 <span class="num muted">' + d.badges_got + '/' + d.badges_total + '</span></h2></div><div class="badges">' + d.badges.map(badgeTile).join('') + '</div>';
    h += '<div class="sec"><h2>별점이 비슷한 친구</h2></div>';
    h += d.friends.length
      ? '<div class="list">' + d.friends.map(function (f) {
          return '<div class="friend"><b>' + esc(f.nick) + '</b>' + (f.admin ? OP_MARK : '') +
            '<span class="tiny num">함께 마신 사케 ' + f.common + '병</span><span class="match num">일치도 ' + f.match + '%</span></div>';
        }).join('') + '</div><p class="tiny" style="margin:0">같은 사케에 준 별점이 비슷할수록 일치도가 높아요.</p>'
      : '<div class="panel muted center">아직 비교할 친구가 없어요.<br><span class="tiny">같은 사케를 2병 이상 함께 평가한 친구가 생기면 보여요.</span></div>';
    h += '<div class="sec"><h2>마셔보고 싶어요 <span class="num muted">' + d.wishes.length + '</span></h2></div>';
    h += d.wishes.length ? '<div class="list">' + d.wishes.map(mini).join('') + '</div>'
      : '<div class="panel muted center">사케 화면에서 ♡ 찜을 누르면 여기에 모여요.</div>';
    var rv = d.reviews.slice();
    if (S.mySort === 'stars') rv.sort(function (a, b) { return (b.stars || 0) - (a.stars || 0) || String(b.at).localeCompare(String(a.at)); });
    h += '<div class="sec"><h2>내가 쓴 리뷰 <span class="num muted">' + rv.length + '</span></h2>' +
      (rv.length > 1 ? '<span class="seg minis" role="group" aria-label="리뷰 정렬"><button data-a="mysort" data-s="new" aria-pressed="' + (S.mySort === 'new') + '">최신순</button><button data-a="mysort" data-s="stars" aria-pressed="' + (S.mySort === 'stars') + '">별점순</button></span>' : '') + '</div>';
    h += rv.length ? '<div class="list" id="myrevs">' + rv.map(myReview).join('') + '</div><button class="btn ghost" data-a="csv">내 기록 엑셀로 저장</button>'
      : '<div class="panel muted center">아직 쓴 리뷰가 없어요.</div>';
    h += '<div class="sec"><h2>계정</h2></div><div class="panel acct">' + acctHtml(d) + '</div>';
    return h;
  }

  function myCsv() {
    var rows = [['사케', '양조장', '원산지', '마신 날짜', '만족도 별점'].concat(ITEMS.map(function (x) { return x.n; })).concat(['한줄평', '작성일'])];
    S.my.reviews.forEach(function (r) {
      rows.push([r.sake.name, r.sake.brewer, r.sake.origin, r.drank_on || '', r.stars == null ? '' : r.stars].concat(r.v || ['', '', '', '', '']).concat([r.comment, stamp(r.at)]));
    });
    return '﻿' + rows.map(function (row) {
      return row.map(function (c) { c = String(c == null ? '' : c); return /[",\n\r]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(',');
    }).join('\r\n');
  }
  function downloadCsv() {
    try {
      var url = URL.createObjectURL(new Blob([myCsv()], { type: 'text/csv;charset=utf-8' }));
      var a = document.createElement('a');
      a.href = url; a.download = '사케치북_' + S.my.nickname + '_' + todayStr() + '.csv';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
      toast('엑셀에서 열 수 있는 파일로 저장했어요');
    } catch (e) { toast('이 브라우저에서는 파일 저장이 안 돼요'); }
  }
  window.SKDEBUG = { csv: function () { return S.my ? myCsv() : ''; } };

  /* ---------- 그리기 ---------- */
  var lastView = '';
  function render() {
    var app = $('app'), r = route(), html;
    if (!S.me) html = vAuth();
    else if (r.name === 'admin') html = isAdmin() ? vAdmin() : vTasting();
    else if (r.name === 'detail') html = vDetail(r.id);
    else if (r.name === 'rate') html = vRate(r.id);
    else if (r.name === 'tasting') html = vTasting();
    else if (r.name === 'ranking') html = vRanking();
    else if (r.name === 'my') html = vMy();
    else html = vHome();
    // 하단 메뉴: 로그인 후 항상 보이고, 평가 입력 화면에서만 숨겨요
    var showBar = !!S.me && r.name !== 'rate';
    app.innerHTML = html + (showBar ? tabbar(r) : '');
    document.body.classList.toggle('has-tabbar', showBar);
    var key = (S.me ? S.me.role : '-') + location.hash;
    if (key !== lastView) { window.scrollTo(0, 0); lastView = key; }
  }

  /* ---------- 데이터 불러오기 ---------- */
  function loadSakes() {
    return api('/api/sakes').then(function (d) { S.sakes = d.sakes; render(); }).catch(handleErr);
  }
  function loadHome() {
    return api('/api/home').then(function (d) { S.home = d; if (route().name === 'home') render(); }).catch(handleErr);
  }
  function loadMy() {
    return api('/api/my').then(function (d) { S.my = d; if (route().name === 'my') render(); }).catch(handleErr);
  }
  function loadRanking() {
    var p = S.rank.period, o = S.rank.period === 'all' ? 0 : S.rank.offset;
    return api('/api/ranking?period=' + p + '&offset=' + o).then(function (d) {
      if (S.rank.period === p && (p === 'all' || S.rank.offset === o)) { S.rank.data = d; if (route().name === 'ranking') render(); }
    }).catch(handleErr);
  }
  function loadDetail(id) {
    S.loadErr = '';
    return api('/api/sake?id=' + id).then(function (d) {
      S.detail = d;
      render();
    }).catch(function (e) {
      if (e.status === 401) return handleErr(e);
      S.loadErr = e.message;
      render();
    });
  }
  function handleErr(e) {
    if (e && e.status === 401) {
      resetAll();
      S.authErr = e.message && e.message !== '로그인이 필요해요.' ? e.message : '로그인이 끝났어요. 다시 로그인해 주세요.';
      render();
      return;
    }
    toast(e && e.message ? e.message : '문제가 생겼어요.');
  }

  function resetAll() {
    S.me = null; S.sakes = null; S.detail = null; S.draft = null; S.home = null; S.my = null; S.rank.data = null;
    S.form = clone(EMPTY_FORM); S.authErr = ''; S.showOpLogin = false; S.authTab = 'login';
    S.acct = ''; S.acctErr = ''; S.byeConfirm = false; S.byePw = '';
  }

  function onRoute() {
    S.delId = null;
    var r = route();
    if (!S.me) return render();
    if (r.name === 'home') { render(); loadHome(); }
    else if (r.name === 'tasting' || r.name === 'admin') { render(); loadSakes(); }
    else if (r.name === 'ranking') { render(); loadRanking(); }
    else if (r.name === 'my') { S.acct = ''; S.acctErr = ''; S.byeConfirm = false; S.byePw = ''; render(); loadMy(); }
    else {
      if (!S.detail || S.detail.sake.id !== r.id) S.detail = null;
      if (r.name === 'detail') S.draft = null;
      render();
      loadDetail(r.id);
      if (r.name === 'detail' && !S.sakes) loadSakes();
    }
  }

  /* ---------- 사진 줄이기 (최대 1000px, 흰 배경 JPG) ---------- */
  function shrinkImage(file) {
    return new Promise(function (resolve, reject) {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return reject(new Error('JPG, PNG, WEBP 사진만 올릴 수 있어요.'));
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('사진을 읽지 못했어요.')); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('사진을 열지 못했어요.')); };
        img.onload = function () {
          var max = 1000, w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, max / Math.max(w, h));
          var c = document.createElement('canvas');
          c.width = Math.round(w * k); c.height = Math.round(h * k);
          var ctx = c.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', 0.86));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /* ---------- 동작 ---------- */
  function afterLogin(d) {
    S.me = { role: d.role, nickname: d.nickname };
    S.authErr = ''; S.showOpLogin = false; S.busy = false; S.authTab = 'login';
    S.sakes = null; S.detail = null; S.draft = null; S.form = clone(EMPTY_FORM); S.home = null; S.my = null; S.rank.data = null;
    // 운영자·게스트 모두 첫 화면은 홈
    if (location.hash !== '#/' && location.hash !== '') location.hash = '#/';
    else onRoute();
    toast(d.nickname + '님, 반가워요');
  }

  function submitAuth() {
    var nick = $('nick').value.trim(), pw = $('pw').value;
    if (!nick) { S.authErr = '닉네임을 입력해 주세요.'; return render(); }
    if (pw.length < 4) { S.authErr = '비밀번호는 4자 이상이에요.'; return render(); }
    S.busy = true; render();
    api('/api/auth', { method: 'POST', body: { action: S.authTab === 'join' ? 'signup' : 'login', nickname: nick, password: pw } })
      .then(afterLogin)
      .catch(function (e) { S.busy = false; S.authErr = e.message; render(); var n = $('nick'); if (n) n.value = nick; });
  }

  function submitOp() {
    var id = $('oid').value.trim(), pw = $('opw').value;
    if (!id || !pw) { S.authErr = '아이디와 비밀번호를 입력해 주세요.'; return render(); }
    S.busy = true; render();
    api('/api/auth', { method: 'POST', body: { action: 'admin', id: id, password: pw } })
      .then(afterLogin)
      .catch(function (e) { S.busy = false; S.authErr = e.message; render(); var o = $('oid'); if (o) o.value = id; });
  }

  function saveRating() {
    var dr = S.draft, id = dr.id;
    var er = $('rateerr');
    if (charLen(dr.t.trim()) > 50) { er.textContent = '한줄평은 50자 이내로 써 주세요.'; er.hidden = false; return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dr.d || '')) { er.textContent = '마신 날짜를 골라 주세요.'; er.hidden = false; return; }
    if (dr.d > todayStr()) { er.textContent = '미래 날짜는 고를 수 없어요.'; er.hidden = false; return; }
    if (!(dr.s >= 0.5 && dr.s <= 5)) { er.textContent = '만족도 별점을 골라 주세요.'; er.hidden = false; var sp = document.querySelector('.starpick'); if (sp && sp.scrollIntoView) sp.scrollIntoView({ block: 'center' }); return; }
    S.busy = true; render();
    api('/api/rate', { method: 'POST', body: { sakeId: id, v: dr.v, comment: dr.t.trim(), drankOn: dr.d, stars: dr.s } })
      .then(function (res) {
        S.busy = false; S.draft = null; S.detail = null; S.sakes = null; S.home = null; S.my = null; S.rank.data = null;
        var parts = [];
        if (res && res.levelUp) parts.push('레벨 업! Lv.' + res.levelUp.lv + ' ' + res.levelUp.title);
        if (res && res.newBadges && res.newBadges.length) parts.push('새 뱃지: ' + res.newBadges.map(function (b) { return b.name; }).join(', '));
        toast(parts.length ? parts.join(' · ') : '저장했어요. 평균과 리뷰가 열렸어요', parts.length ? 4000 : 2400);
        go('#/sake/' + id);
      })
      .catch(function (e) {
        S.busy = false;
        if (e.status === 401) return handleErr(e);
        render();
        var er2 = $('rateerr'); if (er2) { er2.textContent = e.message; er2.hidden = false; }
      });
  }

  function acctFail(e, keepConfirm) {
    if (e.status === 401) return handleErr(e);
    S.acctErr = e.message;
    if (!keepConfirm) { S.byeConfirm = false; S.byePw = ''; }
    render();
  }
  function submitNick() {
    var v = $('newnick').value.trim();
    if (!v) { S.acctErr = '새 닉네임을 입력해 주세요.'; render(); return; }
    S.busy = true;
    api('/api/auth', { method: 'POST', body: { action: 'rename', nickname: v } }).then(function (d) {
      S.busy = false;
      S.me.nickname = d.nickname; S.acct = ''; S.acctErr = '';
      S.home = null; S.sakes = null; S.detail = null; S.my = null;
      toast('닉네임을 \'' + d.nickname + '\'' + josa(d.nickname, '으로', '로') + ' 바꿨어요');
      render(); loadMy();
    }).catch(function (e) { S.busy = false; acctFail(e); var n = $('newnick'); if (n) n.value = v; });
  }
  function submitPw() {
    var cur = $('curpw').value, n1 = $('newpw').value, n2 = $('newpw2').value;
    if (!cur) { S.acctErr = '지금 비밀번호를 입력해 주세요.'; return render(); }
    if (n1.length < 4) { S.acctErr = '새 비밀번호는 4자 이상이에요.'; return render(); }
    if (n1 !== n2) { S.acctErr = '새 비밀번호가 서로 달라요. 다시 확인해 주세요.'; return render(); }
    S.busy = true;
    api('/api/auth', { method: 'POST', body: { action: 'password', password: cur, newPassword: n1 } }).then(function () {
      S.busy = false; S.acct = ''; S.acctErr = '';
      toast('비밀번호를 바꿨어요');
      render();
    }).catch(function (e) { S.busy = false; acctFail(e); });
  }
  function submitBye() {
    if (!S.byeConfirm) {
      var pw = $('byepw').value;
      if (!pw) { S.acctErr = '비밀번호를 입력해 주세요.'; return render(); }
      S.byePw = pw; S.byeConfirm = true; S.acctErr = ''; return render();
    }
    S.busy = true;
    api('/api/auth', { method: 'POST', body: { action: 'withdraw', password: S.byePw } }).then(function () {
      S.busy = false; resetAll();
      toast('탈퇴했어요. 그동안 함께해 줘서 고마워요', 3500);
      if (location.hash && location.hash !== '#/') location.hash = '#/'; else render();
    }).catch(function (e) { S.busy = false; acctFail(e); });
  }

  function toggleWish(id) {
    if (!S.detail || S.detail.sake.id !== id) return;
    var on = !S.detail.wished;
    S.detail.wished = on;
    (S.sakes || []).forEach(function (s) { if (s.id === id) s.wished = on; });
    S.my = null;
    render();
    toast(on ? '찜했어요. MY에서 모아볼 수 있어요' : '찜을 풀었어요');
    api('/api/wish', { method: 'POST', body: { sakeId: id, on: on } }).catch(function (e) {
      if (S.detail && S.detail.sake.id === id) S.detail.wished = !on;
      (S.sakes || []).forEach(function (s) { if (s.id === id) s.wished = !on; });
      render(); handleErr(e);
    });
  }

  function startEdit(id) {
    S.formErr = ''; S.delId = null;
    api('/api/sake?id=' + id).then(function (d) {
      var s = d.sake;
      S.form = {
        id: s.id, name: s.name || '', rice: s.rice || '', polish: s.polish || '', abv: s.abv || '', smv: s.smv || '', acid: s.acid || '',
        brewer: s.brewer || '', origin: s.origin || '', desc_title: s.desc_title || '', desc_body: s.desc_body || '',
        tint: s.tint || TINTS[0], img_url: s.img_url || null, image: null, clearImage: false
      };
      if (location.hash !== '#/admin') { location.hash = '#/admin'; } else { render(); window.scrollTo(0, 0); }
    }).catch(handleErr);
  }

  function submitSake() {
    var f = S.form;
    if (!f.name.trim()) { S.formErr = '술 이름을 입력해 주세요.'; render(); var n = $('oname'); if (n) n.focus(); return; }
    var body = { name: f.name, rice: f.rice, polish: f.polish, abv: f.abv, smv: f.smv, acid: f.acid, brewer: f.brewer, origin: f.origin, desc_title: f.desc_title, desc_body: f.desc_body, tint: f.tint };
    if (f.image) body.image = f.image;
    else if (f.id !== null && f.clearImage) body.clearImage = true;
    var editing = f.id !== null;
    S.busy = true; S.formErr = ''; render();
    api(editing ? '/api/sakes?id=' + f.id : '/api/sakes', { method: editing ? 'PATCH' : 'POST', body: body })
      .then(function () {
        S.busy = false; S.form = clone(EMPTY_FORM); S.detail = null;
        toast(editing ? '수정했어요' : '등록했어요. 목록에 바로 보여요');
        render(); window.scrollTo(0, 0);
        loadSakes();
      })
      .catch(function (e) {
        S.busy = false;
        if (e.status === 401) return handleErr(e);
        S.formErr = e.message; render();
      });
  }

  function deleteSake(id) {
    api('/api/sakes?id=' + id, { method: 'DELETE' }).then(function () {
      S.delId = null;
      if (S.form.id === id) S.form = clone(EMPTY_FORM);
      if (S.detail && S.detail.sake.id === id) S.detail = null;
      toast('삭제했어요');
      loadSakes();
    }).catch(handleErr);
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-a]');
    if (!el) return;
    var a = el.getAttribute('data-a');
    if (a === 'nav') { e.preventDefault(); if (el.getAttribute('data-h')) go(el.getAttribute('data-h')); }
    else if (a === 'tab') { S.authTab = el.getAttribute('data-t'); S.authErr = ''; render(); }
    else if (a === 'oplogin-toggle') { S.showOpLogin = !S.showOpLogin; S.authErr = ''; render(); }
    else if (a === 'logout') {
      api('/api/auth', { method: 'POST', body: { action: 'logout' } }).catch(function () {}).then(function () {
        resetAll();
        if (location.hash && location.hash !== '#/') location.hash = '#/'; else render();
      });
    }
    else if (a === 'save') { if (!S.busy) saveRating(); }
    else if (a === 'edit') { startEdit(+el.getAttribute('data-id')); }
    else if (a === 'edit-cancel') { S.form = clone(EMPTY_FORM); S.formErr = ''; render(); }
    else if (a === 'tmp') {
      S.form.tint = el.getAttribute('data-c'); S.form.image = null;
      if (S.form.img_url) S.form.clearImage = true;
      var fi = $('oimg'); if (fi) fi.value = '';
      render();
    }
    else if (a === 'del') {
      var id = +el.getAttribute('data-id');
      if (S.delId === id) deleteSake(id); else { S.delId = id; render(); }
    }
    else if (a === 'del-cancel') { S.delId = null; render(); }
    else if (a === 'ftab') { S.F.tab = el.getAttribute('data-t'); render(); }
    else if (a === 'scope') { S.F.scope = el.getAttribute('data-s'); render(); var qi = $('q'); if (qi && S.F.q) qi.focus(); }
    else if (a === 'clearq') { S.F.q = ''; render(); }
    else if (a === 'view') { S.F.view = el.getAttribute('data-v'); render(); }
    else if (a === 'month') {
      var dd = +el.getAttribute('data-d');
      if (dd === 0) { S.F.month = null; }
      else {
        var cur = S.F.month || todayStr().slice(0, 7);
        var nd = new Date(+cur.slice(0, 4), +cur.slice(5, 7) - 1 + dd, 1);
        S.F.month = nd.getFullYear() + '-' + pad(nd.getMonth() + 1);
      }
      S.F.day = null; render();
    }
    else if (a === 'day') { var dv = el.getAttribute('data-d'); S.F.day = dv && S.F.day !== dv ? dv : null; render(); }
    else if (a === 'brewer' || a === 'origin') {
      S.F.view = 'list'; S.F.tab = 'all'; S.F.scope = a; S.F.q = el.getAttribute('data-b') || '';
      go('#/tasting');
    }
    else if (a === 'home') {
      e.preventDefault();
      S.draft = null;
      if (S.me && location.hash && location.hash !== '#/') go('#/'); else { render(); window.scrollTo(0, 0); }
    }
    else if (a === 'tabnav') {
      var th = el.getAttribute('data-h');
      if (location.hash === th || (th === '#/' && !location.hash)) { window.scrollTo(0, 0); onRoute(); } else go(th);
    }
    else if (a === 'todo') { S.F.view = 'list'; S.F.tab = 'todo'; S.F.q = ''; go('#/tasting'); }
    else if (a === 'ranktop') { S.rank.period = 'all'; S.rank.offset = 0; go('#/ranking'); }
    else if (a === 'period') { S.rank.period = el.getAttribute('data-p'); S.rank.offset = 0; render(); loadRanking(); }
    else if (a === 'poffset') {
      var od = +el.getAttribute('data-d');
      if (od > 0 && S.rank.offset >= 0) return;
      S.rank.offset += od; render(); loadRanking();
    }
    else if (a === 'wish') { toggleWish(+el.getAttribute('data-id')); }
    else if (a === 'mysort') { S.mySort = el.getAttribute('data-s'); render(); }
    else if (a === 'acct') {
      var k = el.getAttribute('data-k');
      S.acct = S.acct === k ? '' : k; S.acctErr = ''; S.byeConfirm = false; S.byePw = '';
      render();
      var first = document.querySelector('.afbox input'); if (first) first.focus();
    }
    else if (a === 'bye-cancel') { S.byeConfirm = false; S.byePw = ''; S.acctErr = ''; render(); }
    else if (a === 'csv') { if (S.my) downloadCsv(); }
    else if (a === 'star') {
      if (!S.draft) return;
      var sv = parseFloat(el.getAttribute('data-n'));
      S.draft.s = sv;
      document.querySelectorAll('.starpick .st').forEach(function (st) {
        var k = +st.getAttribute('data-k');
        st.classList.toggle('on', sv >= k);
        st.classList.toggle('half', sv < k && sv >= k - 0.5);
      });
      document.querySelectorAll('.starpick .hz').forEach(function (hb) {
        hb.setAttribute('aria-checked', String(parseFloat(hb.getAttribute('data-n')) === sv));
      });
      var w = $('swd'); if (w) w.textContent = starWord(sv);
      var er = $('rateerr'); if (er) er.hidden = true;
    }
    else if (a === 'drank-today') { if (S.draft) { setDrank(todayStr()); var di = $('drank'); if (di) di.value = S.draft.d; } }
  });

  document.addEventListener('submit', function (e) {
    e.preventDefault();
    if (S.busy) return;
    if (e.target.id === 'authform') submitAuth();
    else if (e.target.id === 'opform') submitOp();
    else if (e.target.id === 'sakeform') submitSake();
    else if (e.target.id === 'nickform') submitNick();
    else if (e.target.id === 'pwform') submitPw();
    else if (e.target.id === 'byeform') submitBye();
  });

  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t.classList.contains('slider') && S.draft) {
      var i = +t.getAttribute('data-i'), v = +t.value;
      S.draft.v[i] = v;
      t.style.setProperty('--p', ((v - 1) * 25) + '%');
      $('w' + i).textContent = ITEMS[i].w[v - 1];
      $('rchart').innerHTML = radar([{ cls: 'me', vals: S.draft.v }]);
    } else if (t.id === 'cmt' && S.draft) {
      S.draft.t = t.value;
      var c = charLen(t.value), cnt = $('cnt');
      cnt.textContent = c + ' / 50';
      cnt.classList.toggle('full', c >= 50);
    } else if (t.id === 'q') {
      S.F.q = t.value;
      var r = $('results'); if (r) r.innerHTML = resultsHtml();
      var qc = $('qclear'); if (qc) qc.hidden = !t.value;
    } else if (t.id === 'aq') {
      S.aq = t.value;
      var al = $('alist'); if (al) al.innerHTML = adminListHtml();
    } else if (t.id === 'drank' && S.draft) {
      setDrank(t.value);
    } else if (t.getAttribute('data-k')) {
      S.form[t.getAttribute('data-k')] = t.value;
    }
  });

  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'sort') { S.F.sort = t.value; var r = $('results'); if (r) r.innerHTML = resultsHtml(); return; }
    if (t.id === 'drank' && S.draft) { setDrank(t.value); return; }
    if (t.id === 'oimg' && t.files && t.files[0]) {
      shrinkImage(t.files[0]).then(function (url) {
        S.form.image = url; S.form.clearImage = false; S.formErr = '';
        render();
      }).catch(function (err) { S.formErr = err.message; t.value = ''; render(); });
    }
  });

  // PC에서 날짜 칸 아무 데나 눌러도 달력이 열리게
  document.addEventListener('click', function (e) {
    if (e.target && e.target.id === 'drank' && typeof e.target.showPicker === 'function') {
      try { e.target.showPicker(); } catch (err) { /* 지원 안 하면 기본 동작 */ }
    }
  });

  window.addEventListener('hashchange', onRoute);

  /* ---------- 보기 설정 기억 (이 기기에서만) ---------- */
  try {
    var saved = JSON.parse(localStorage.getItem('sk-view') || '{}');
    if (saved.view === 'list' || saved.view === 'cal') S.F.view = saved.view;
    if (['all', 'rated', 'todo', 'wish'].indexOf(saved.tab) >= 0) S.F.tab = saved.tab;
    if (SORTS.some(function (x) { return x[0] === saved.sort; })) S.F.sort = saved.sort;
  } catch (e) { /* 저장소를 못 쓰면 기본값 */ }
  var origRender = render;
  render = function () {
    origRender();
    try { localStorage.setItem('sk-view', JSON.stringify({ view: S.F.view, tab: S.F.tab, sort: S.F.sort })); } catch (e) { /* 무시 */ }
  };

  /* ---------- 시작 ---------- */
  api('/api/me').then(function (d) {
    S.adminNick = d.adminNick || '';
    if (d.role) {
      S.me = { role: d.role, nickname: d.nickname };
    }
    onRoute();
  }).catch(function (e) {
    $('app').innerHTML = '<div class="panel center stack" style="margin-top:40px"><p class="err">' + esc(e.message) + '</p><button class="btn ghost" onclick="location.reload()">다시 시도</button></div>';
  });
})();
