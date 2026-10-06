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
  var EMPTY_FORM = { id: null, name: '', rice: '', polish: '', abv: '', smv: '', acid: '', brewer: '', origin: '', tint: TINTS[0], img_url: null, image: null, clearImage: false };

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
    aq: ''               // 운영자 관리 목록 검색어
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
  function isAdmin() { return S.me && S.me.role === 'admin'; }

  var toastTimer;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2400);
  }

  function bottle(tint) {
    var t = /^#[0-9a-fA-F]{6}$/.test(tint || '') ? tint : TINTS[0];
    return '<svg viewBox="-10 0 80 80" aria-hidden="true"><path d="M26 6h8v4c0 3 1 4 3 7 3 4 4 8 4 14v38a3 3 0 0 1-3 3H22a3 3 0 0 1-3-3V31c0-6 1-10 4-14 2-3 3-4 3-7z" fill="' + t + '"/><rect x="22" y="38" width="16" height="22" rx="1.5" fill="#fff" opacity=".88"/><rect x="26" y="43" width="8" height="1.8" fill="' + t + '"/><rect x="27.5" y="48" width="5" height="5" fill="' + t + '" opacity=".7"/><rect x="26" y="3" width="8" height="4" rx="1" fill="' + t + '" opacity=".8"/></svg>';
  }
  function pic(s) {
    return s.img_url ? '<img src="' + esc(s.img_url) + '" alt="" loading="lazy">' : bottle(s.tint);
  }
  function badge(nick) {
    return nick === S.adminNick ? '<span class="chip op">운영자</span>' : '';
  }

  function topBar(sub, right) {
    return '<div class="top"><div class="seal"><img src="/logo.png" alt=""></div>' +
      '<h1 class="display">사케치북' + (sub ? '<span class="sub">' + sub + '</span>' : '') + '</h1>' + (right || '') + '</div>';
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
  var SORTS = [['new', '최근 등록순'], ['drank', '최근 마신순'], ['name', '이름순'], ['popular', '평가 많은순']];
  var SCOPES = [['all', '전체'], ['name', '이름'], ['brewer', '양조장']];

  function matches(s, q, scope) {
    if (!q) return true;
    var name = (s.name || '').toLowerCase(), br = (s.brewer || '').toLowerCase(), og = (s.origin || '').toLowerCase();
    if (scope === 'name') return name.indexOf(q) >= 0;
    if (scope === 'brewer') return br.indexOf(q) >= 0;
    return name.indexOf(q) >= 0 || br.indexOf(q) >= 0 || og.indexOf(q) >= 0;
  }

  function filtered() {
    var F = S.F, q = F.q.trim().toLowerCase();
    var list = S.sakes.filter(function (s) {
      if (F.tab === 'rated' && !s.rated) return false;
      if (F.tab === 'todo' && s.rated) return false;
      return matches(s, q, F.scope);
    });
    var by = {
      name: function (x, y) { return x.name.localeCompare(y.name, 'ko'); },
      popular: function (x, y) { return y.n - x.n || x.name.localeCompare(y.name, 'ko'); },
      drank: function (x, y) { return (y.drank_on || '').localeCompare(x.drank_on || '') || (y.created_at || '').localeCompare(x.created_at || ''); },
      'new': function (x, y) { return (y.created_at || '').localeCompare(x.created_at || '') || y.id - x.id; }
    }[F.sort] || null;
    return by ? list.slice().sort(by) : list;
  }

  function card(s) {
    return '<button class="card" data-a="nav" data-h="#/sake/' + s.id + '"><span class="pic">' + pic(s) + '</span><span class="body">' +
      '<span class="tiny">' + esc(s.brewer || ' ') + '</span><h3>' + esc(s.name) + '</h3>' +
      '<span class="row"><span class="chip ' + (s.rated ? 'done' : '') + '">' + (s.rated ? (s.drank_on ? md(s.drank_on) + ' 마심' : '평가 완료') : '평가 전') + '</span>' +
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
        F.tab === 'todo' ? '등록된 사케를 모두 평가했어요.' : '사케가 없어요.';
      return '<div class="panel muted center">' + msg + (F.q.trim() ? '<br><button class="link" data-a="clearq">검색어 지우기</button>' : '') + '</div>';
    }
    return (F.q.trim() ? '<p class="tiny" style="margin:0">검색 결과 ' + list.length + '개</p>' : '') +
      '<div class="grid">' + list.map(card).join('') + '</div>';
  }

  function listView() {
    var F = S.F, all = S.sakes.length, rated = S.sakes.filter(function (s) { return s.rated; }).length;
    var tabs = [['all', '전체', all], ['rated', '마신 사케', rated], ['todo', '평가할 사케', all - rated]];
    return '<div class="filters" role="tablist" aria-label="사케 분류">' + tabs.map(function (x) {
        return '<button role="tab" data-a="ftab" data-t="' + x[0] + '" aria-selected="' + (F.tab === x[0]) + '">' + x[1] + ' <span class="num">' + x[2] + '</span></button>';
      }).join('') + '</div>' +
      '<div class="searchbox"><span class="ic" aria-hidden="true"><svg viewBox="0 0 20 20"><circle cx="9" cy="9" r="6"/><path d="M14 14l4 4"/></svg></span>' +
      '<input id="q" type="search" enterkeyhint="search" autocomplete="off" placeholder="' + (F.scope === 'brewer' ? '양조장 이름으로 찾기' : F.scope === 'name' ? '사케 이름으로 찾기' : '사케 이름, 양조장, 원산지로 찾기') + '" value="' + esc(F.q) + '" aria-label="검색">' +
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

  function vHome() {
    var right = isAdmin()
      ? '<button class="link" data-a="nav" data-h="#/admin">관리</button>'
      : '<button class="link" data-a="logout">나가기</button>';
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

  function vDetail(id) {
    var back = '<button class="back" data-a="nav" data-h="#/">← 목록</button>';
    if (S.loadErr) return back + '<div class="panel center stack"><p class="err">' + esc(S.loadErr) + '</p><button class="btn ghost" data-a="nav" data-h="#/">목록으로</button></div>';
    var d = S.detail;
    if (!d || d.sake.id !== id) return back + '<div class="loading">불러오는 중…</div>';
    var s = d.sake;
    var h = back + '<div class="hero">' + pic(s) + '</div>';
    h += '<div class="stack" style="gap:4px"><span class="tiny">' +
      (s.brewer ? '<button class="inlink" data-a="brewer" data-b="' + esc(s.brewer) + '">' + esc(s.brewer) + ' 사케 더 보기</button>' : '') +
      (s.brewer && s.origin ? ' · ' : '') + esc(s.origin || '') + '</span><h2 class="display name">' + esc(s.name) + '</h2></div>';
    h += '<dl class="spec" style="margin:0">' +
      specCell('원료', s.rice, null, '', true) +
      specCell('정미율', s.polish, '%') +
      specCell('도수', s.abv, '%') +
      specCell('주도', s.smv, '', '낮을수록 단맛') +
      specCell('산도', s.acid, '', '높을수록 신맛') +
      specCell('주조사', s.brewer, null) +
      specCell('원산지', s.origin, null) + '</dl>';
    if (isAdmin()) h += '<button class="btn ghost" data-a="edit" data-id="' + s.id + '">사케 정보 수정</button>';

    if (!d.rated) {
      return h + '<div class="panel lock"><div class="ic" aria-hidden="true">&#128274;</div><h3>평균과 리뷰는 평가 후에 열려요</h3>' +
        '<p class="tiny" style="margin:0">먼저 내 입맛대로 평가해야 다른 사람 영향 없이 비교할 수 있어요.<br>지금 ' + d.n + '명이 평가했어요.</p>' +
        '<button class="btn" data-a="nav" data-h="#/sake/' + s.id + '/rate">내 평가 남기기</button></div>';
    }

    var my = d.my.v, a = d.avg;
    h += '<div class="panel stack"><div class="sec"><h2>내 평가 vs 평균</h2><span class="tiny num">나 포함 ' + d.n + '명</span></div>' +
      (d.my.drank_on ? '<p class="tiny" style="margin:-8px 0 0">' + mdw(d.my.drank_on) + '에 마셨어요</p>' : '') +
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
          (r.mine ? '<span class="chip done">나</span>' : '') + '<span class="date num">' + stamp(r.at) + '</span></div>' +
          '<p>' + (r.t ? esc(r.t) : '<span class="muted">한줄평이 없어요</span>') + '</p></article>';
      }).join('') + '</div>';
    return h;
  }

  /* ---------- 화면: 평가 ---------- */
  function vRate(id) {
    var d = S.detail;
    if (!d || d.sake.id !== id) return '<button class="back" data-a="nav" data-h="#/">← 목록</button><div class="loading">불러오는 중…</div>';
    if (!S.draft || S.draft.id !== id) {
      S.draft = d.my ? { id: id, v: d.my.v.slice(), t: d.my.t, d: d.my.drank_on || todayStr() } : { id: id, v: [3, 3, 3, 3, 3], t: '', d: todayStr() };
    }
    var dr = S.draft;
    var h = '<button class="back" data-a="nav" data-h="#/sake/' + id + '">← ' + esc(d.sake.name) + '</button>';
    h += '<div class="panel stack"><h2 class="display" style="font-size:16px">' + (d.my ? '평가 수정' : '어떤 맛이었나요?') + '</h2><div id="rchart">' + radar([{ cls: 'me', vals: dr.v }]) + '</div></div>';
    h += '<div class="field"><label for="drank">마신 날짜</label><div class="daterow"><input id="drank" type="date" value="' + esc(dr.d) + '" max="' + todayStr() + '" min="2000-01-01">' +
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
    var h = topBar(esc(S.me.nickname) + ' ' + badge(S.me.nickname) + ' · 사케 관리',
      '<button class="link" data-a="nav" data-h="#/">시음하기</button><button class="link" data-a="logout">로그아웃</button>');
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

  /* ---------- 그리기 ---------- */
  var lastView = '';
  function render() {
    var app = $('app'), r = route(), html;
    if (!S.me) html = vAuth();
    else if (r.name === 'admin') html = isAdmin() ? vAdmin() : vHome();
    else if (r.name === 'detail') html = vDetail(r.id);
    else if (r.name === 'rate') html = vRate(r.id);
    else html = vHome();
    app.innerHTML = html;
    var key = (S.me ? S.me.role : '-') + location.hash;
    if (key !== lastView) { window.scrollTo(0, 0); lastView = key; }
  }

  /* ---------- 데이터 불러오기 ---------- */
  function loadSakes() {
    return api('/api/sakes').then(function (d) { S.sakes = d.sakes; render(); }).catch(handleErr);
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
      S.me = null; S.sakes = null; S.detail = null; S.authTab = 'login'; S.showOpLogin = false;
      S.authErr = '로그인이 끝났어요. 다시 로그인해 주세요.';
      render();
      return;
    }
    toast(e && e.message ? e.message : '문제가 생겼어요.');
  }

  function onRoute() {
    S.delId = null;
    var r = route();
    if (!S.me) return render();
    if (r.name === 'home' || r.name === 'admin') {
      render();
      loadSakes();
    } else {
      if (!S.detail || S.detail.sake.id !== r.id) S.detail = null;
      if (r.name === 'detail') S.draft = null;
      render();
      loadDetail(r.id);
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
    S.sakes = null; S.detail = null; S.draft = null; S.form = clone(EMPTY_FORM);
    if (d.role === 'admin' && location.hash !== '#/admin') location.hash = '#/admin';
    else if (d.role !== 'admin' && location.hash !== '#/' && location.hash !== '') location.hash = '#/';
    else onRoute();
    if (d.role !== 'admin') toast(d.nickname + '님, 반가워요');
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
    S.busy = true; render();
    api('/api/rate', { method: 'POST', body: { sakeId: id, v: dr.v, comment: dr.t.trim(), drankOn: dr.d } })
      .then(function () {
        S.busy = false; S.draft = null; S.detail = null; S.sakes = null;
        toast('저장했어요. 평균과 리뷰가 열렸어요');
        go('#/sake/' + id);
      })
      .catch(function (e) {
        S.busy = false;
        if (e.status === 401) return handleErr(e);
        render();
        var er2 = $('rateerr'); if (er2) { er2.textContent = e.message; er2.hidden = false; }
      });
  }

  function startEdit(id) {
    S.formErr = ''; S.delId = null;
    api('/api/sake?id=' + id).then(function (d) {
      var s = d.sake;
      S.form = {
        id: s.id, name: s.name || '', rice: s.rice || '', polish: s.polish || '', abv: s.abv || '', smv: s.smv || '', acid: s.acid || '',
        brewer: s.brewer || '', origin: s.origin || '', tint: s.tint || TINTS[0], img_url: s.img_url || null, image: null, clearImage: false
      };
      if (location.hash !== '#/admin') { location.hash = '#/admin'; } else { render(); window.scrollTo(0, 0); }
    }).catch(handleErr);
  }

  function submitSake() {
    var f = S.form;
    if (!f.name.trim()) { S.formErr = '술 이름을 입력해 주세요.'; render(); var n = $('oname'); if (n) n.focus(); return; }
    var body = { name: f.name, rice: f.rice, polish: f.polish, abv: f.abv, smv: f.smv, acid: f.acid, brewer: f.brewer, origin: f.origin, tint: f.tint };
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
    if (a === 'nav') { e.preventDefault(); go(el.getAttribute('data-h')); }
    else if (a === 'tab') { S.authTab = el.getAttribute('data-t'); S.authErr = ''; render(); }
    else if (a === 'oplogin-toggle') { S.showOpLogin = !S.showOpLogin; S.authErr = ''; render(); }
    else if (a === 'logout') {
      api('/api/auth', { method: 'POST', body: { action: 'logout' } }).catch(function () {}).then(function () {
        S.me = null; S.sakes = null; S.detail = null; S.draft = null; S.form = clone(EMPTY_FORM); S.authErr = ''; S.showOpLogin = false; S.authTab = 'login';
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
    else if (a === 'brewer') {
      S.F.view = 'list'; S.F.tab = 'all'; S.F.scope = 'brewer'; S.F.q = el.getAttribute('data-b') || '';
      go('#/');
    }
    else if (a === 'drank-today') { if (S.draft) { S.draft.d = todayStr(); var di = $('drank'); if (di) di.value = S.draft.d; } }
  });

  document.addEventListener('submit', function (e) {
    e.preventDefault();
    if (S.busy) return;
    if (e.target.id === 'authform') submitAuth();
    else if (e.target.id === 'opform') submitOp();
    else if (e.target.id === 'sakeform') submitSake();
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
      S.draft.d = t.value;
    } else if (t.getAttribute('data-k')) {
      S.form[t.getAttribute('data-k')] = t.value;
    }
  });

  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'sort') { S.F.sort = t.value; var r = $('results'); if (r) r.innerHTML = resultsHtml(); return; }
    if (t.id === 'drank' && S.draft) { S.draft.d = t.value; return; }
    if (t.id === 'oimg' && t.files && t.files[0]) {
      shrinkImage(t.files[0]).then(function (url) {
        S.form.image = url; S.form.clearImage = false; S.formErr = '';
        render();
      }).catch(function (err) { S.formErr = err.message; t.value = ''; render(); });
    }
  });

  window.addEventListener('hashchange', onRoute);

  /* ---------- 보기 설정 기억 (이 기기에서만) ---------- */
  try {
    var saved = JSON.parse(localStorage.getItem('sk-view') || '{}');
    if (saved.view === 'list' || saved.view === 'cal') S.F.view = saved.view;
    if (['all', 'rated', 'todo'].indexOf(saved.tab) >= 0) S.F.tab = saved.tab;
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
      if (d.role === 'admin' && (!location.hash || location.hash === '#/')) { location.hash = '#/admin'; return; }
    }
    onRoute();
  }).catch(function (e) {
    $('app').innerHTML = '<div class="panel center stack" style="margin-top:40px"><p class="err">' + esc(e.message) + '</p><button class="btn ghost" onclick="location.reload()">다시 시도</button></div>';
  });
})();
