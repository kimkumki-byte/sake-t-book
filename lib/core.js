/* 사케치북 공통 계산: 레벨, 뱃지, 랭킹, 홈, MY, 별점이 비슷한 친구
   서버(api/)와 데모 미리보기가 똑같은 계산을 쓰도록 한 파일에 모았어요.
   날짜는 모두 'YYYY-MM-DD' 글자이고, 랭킹·뱃지의 날짜는 "마신 날짜" 기준이에요. */
(function (root) {
  'use strict';

  /* ---------- 레벨 ---------- */
  var LEVELS = [
    { lv: 1, title: '쌀', min: 0 },
    { lv: 2, title: '누룩', min: 3 },
    { lv: 3, title: '보통주', min: 6 },
    { lv: 4, title: '혼죠조', min: 10 },
    { lv: 5, title: '긴죠', min: 15 },
    { lv: 6, title: '다이긴죠', min: 25 },
    { lv: 7, title: '준마이다이긴죠', min: 40 },
    { lv: 8, title: '토우지', min: 60 }
  ];

  function levelOf(count) {
    var cur = LEVELS[0];
    LEVELS.forEach(function (l) { if (count >= l.min) cur = l; });
    var next = LEVELS[cur.lv] || null;
    return {
      lv: cur.lv, title: cur.title, count: count,
      next: next ? { lv: next.lv, title: next.title, remain: next.min - count } : null,
      progress: next ? (count - cur.min) / (next.min - cur.min) : 1
    };
  }

  /* ---------- 날짜 도우미 ---------- */
  function dayNum(s) { var p = String(s).split('-'); return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000); }
  function ymdOf(n) { return new Date(n * 86400000).toISOString().slice(0, 10); }
  function dow(s) { return new Date(dayNum(s) * 86400000).getUTCDay(); } // 0=일 … 6=토
  function num(x) { var n = parseFloat(x); return isFinite(n) ? n : null; }
  function norm(s) { return String(s || '').trim().toLowerCase(); }
  function maxOf(obj) { var m = 0; Object.keys(obj).forEach(function (k) { if (obj[k] > m) m = obj[k]; }); return m; }
  function isNum(x) { return typeof x === 'number' && isFinite(x); }

  /* ---------- 뱃지 (조건이 분명한 것만) ---------- */
  // [아이디, 이름, 조건 설명, 계산 항목, 목표]
  var BADGES = [
    ['first', '첫 잔', '첫 평가 남기기', 'count', 1],
    ['comment10', '한줄평 장인', '한줄평 10개 쓰기', 'comments', 10],
    ['brewer5', '양조장 순례자', '서로 다른 양조장 5곳의 사케 마시기', 'brewers', 5],
    ['origin5', '전국 일주', '서로 다른 원산지 5곳의 사케 마시기', 'origins', 5],
    ['regular3', '단골 양조장', '같은 양조장 사케 3병 마시기', 'maxBrewer', 3],
    ['polish5', '정미의 미학', '정미율 50% 이하 사케 5병 마시기', 'polish50', 5],
    ['dry3', '드라이 마니아', '주도 +5 이상 사케 3병 마시기', 'dry', 3],
    ['sweet3', '달콤한 취향', '주도가 마이너스(0 미만)인 사케 3병 마시기', 'sweet', 3],
    ['pioneer3', '개척자', '아무도 평가하지 않은 사케를 첫 번째로 평가하기 3번', 'pioneer', 3],
    ['session3', '시음회 멤버', '같은 날 사케 3병 마시기', 'maxDay', 3],
    ['weekend5', '주말 한 잔', '토·일요일에 사케 5병 마시기', 'weekend', 5],
    ['weekly4', '꾸준한 한 잔', '4주 연속, 매주(월~일) 1병 이상 마시기', 'streak', 4],
    ['month10', '이달의 애주가', '한 달(1일~말일)에 사케 10병 마시기', 'maxMonth', 10],
    ['perfect', '만점 선언', '별 5개 주기', 'five', 1],
    ['critic3', '냉철한 심사위원', '별 2개 이하 3번 주기', 'low', 3]
  ];

  function facts(nick, byId, ratings) {
    var mine = ratings.filter(function (r) { return r.nickname === nick; });
    // 사케마다 가장 먼저 평가한 사람 (평가 번호가 가장 작은 사람)
    var first = {};
    ratings.forEach(function (r) {
      var id = r.id == null ? Infinity : r.id;
      if (!first[r.sake_id] || id < first[r.sake_id].id) first[r.sake_id] = { id: id, nick: r.nickname };
    });
    var f = { count: mine.length, comments: 0, polish50: 0, dry: 0, sweet: 0, pioneer: 0, weekend: 0, five: 0, low: 0 };
    var br = {}, og = {}, days = {}, months = {}, weeks = {};
    mine.forEach(function (r) {
      var s = byId[r.sake_id] || {};
      if (String(r.comment || '').trim()) f.comments++;
      var b = norm(s.brewer); if (b) br[b] = (br[b] || 0) + 1;
      var o = norm(s.origin); if (o) og[o] = 1;
      var p = num(s.polish); if (p !== null && p > 0 && p <= 50) f.polish50++;
      var v = num(s.smv); if (v !== null) { if (v >= 5) f.dry++; if (v < 0) f.sweet++; }
      if (first[r.sake_id] && first[r.sake_id].nick === nick) f.pioneer++;
      if (isNum(r.stars)) { if (r.stars === 5) f.five++; if (r.stars <= 2) f.low++; }
      if (r.drank_on) {
        var d = r.drank_on, w = dow(d);
        days[d] = (days[d] || 0) + 1;
        months[d.slice(0, 7)] = (months[d.slice(0, 7)] || 0) + 1;
        if (w === 0 || w === 6) f.weekend++;
        weeks[dayNum(d) - (w + 6) % 7] = 1; // 그 주의 월요일
      }
    });
    f.brewers = Object.keys(br).length;
    f.maxBrewer = maxOf(br);
    f.origins = Object.keys(og).length;
    f.maxDay = maxOf(days);
    f.maxMonth = maxOf(months);
    var ws = Object.keys(weeks).map(Number).sort(function (a, b) { return a - b; });
    var best = 0, run = 0;
    ws.forEach(function (w, i) { run = (i > 0 && w - ws[i - 1] === 7) ? run + 1 : 1; if (run > best) best = run; });
    f.streak = best;
    return f;
  }

  function byIdOf(sakes) { var m = {}; sakes.forEach(function (s) { m[s.id] = s; }); return m; }

  function profile(nick, sakes, ratings) {
    var f = facts(nick, byIdOf(sakes), ratings);
    var badges = BADGES.map(function (b) {
      return { id: b[0], name: b[1], desc: b[2], goal: b[4], cur: Math.min(f[b[3]], b[4]), got: f[b[3]] >= b[4] };
    });
    var starred = ratings.filter(function (r) { return r.nickname === nick && isNum(r.stars); });
    return {
      count: f.count,
      level: levelOf(f.count),
      badges: badges,
      badges_got: badges.filter(function (b) { return b.got; }).length,
      badges_total: badges.length,
      avg_stars: starred.length ? round2(starred.reduce(function (a, r) { return a + r.stars; }, 0) / starred.length) : null
    };
  }

  function round2(n) { return Math.round(n * 100) / 100; }

  /* ---------- 랭킹 (만족도 별점 평균, 마신 날짜 기준) ---------- */
  var PERIODS = ['all', 'month', 'week', 'day'];

  function rangeFor(period, offset, today) {
    offset = Math.max(-240, Math.min(0, parseInt(offset, 10) || 0));
    if (PERIODS.indexOf(period) < 0) period = 'all';
    if (period === 'all') return { period: 'all', offset: 0, start: null, end: null };
    var t = dayNum(today);
    if (period === 'day') return { period: period, offset: offset, start: ymdOf(t + offset), end: ymdOf(t + offset) };
    if (period === 'week') {
      var mon = t - (dow(today) + 6) % 7 + 7 * offset;
      return { period: period, offset: offset, start: ymdOf(mon), end: ymdOf(mon + 6) };
    }
    var y = +today.slice(0, 4), m = +today.slice(5, 7) - 1 + offset;
    return {
      period: period, offset: offset,
      start: new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10),
      end: new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10)
    };
  }

  function lite(s) {
    return { id: s.id, name: s.name, brewer: s.brewer || '', origin: s.origin || '', img_url: s.img_url || null, tint: s.tint };
  }

  function ranking(sakes, ratings, start, end) {
    var by = {};
    ratings.forEach(function (r) {
      if (!isNum(r.stars)) return; // 별점 없는 예전 평가는 빼요
      if (start && (!r.drank_on || r.drank_on < start || r.drank_on > end)) return;
      (by[r.sake_id] = by[r.sake_id] || []).push(r.stars);
    });
    var items = sakes.filter(function (s) { return by[s.id]; }).map(function (s) {
      var a = by[s.id], it = lite(s);
      it.exact = a.reduce(function (x, y) { return x + y; }, 0) / a.length;
      it.avg = round2(it.exact);
      it.n = a.length;
      return it;
    });
    items.sort(function (x, y) { return y.exact - x.exact || y.n - x.n || x.name.localeCompare(y.name, 'ko'); });
    items.forEach(function (it, i) { it.rank = i + 1; delete it.exact; });
    return items;
  }

  /* ---------- 별점이 비슷한 친구 ---------- */
  // 둘 다 별점을 준 사케가 2병 이상인 친구만, 별점 차이가 작을수록 일치도가 높아요
  function similarFriends(nick, ratings, adminNick, limit) {
    var mine = {};
    ratings.forEach(function (r) { if (r.nickname === nick && isNum(r.stars)) mine[r.sake_id] = r.stars; });
    var others = {};
    ratings.forEach(function (r) {
      if (r.nickname === nick || !isNum(r.stars) || !(r.sake_id in mine)) return;
      (others[r.nickname] = others[r.nickname] || []).push(Math.abs(r.stars - mine[r.sake_id]));
    });
    var list = Object.keys(others).filter(function (k) { return others[k].length >= 2; }).map(function (k) {
      var d = others[k], mean = d.reduce(function (a, b) { return a + b; }, 0) / d.length;
      return { nick: k, admin: k === adminNick, common: d.length, match: Math.round((1 - mean / 4.5) * 100) };
    });
    list.sort(function (a, b) { return b.match - a.match || b.common - a.common || a.nick.localeCompare(b.nick, 'ko'); });
    return list.slice(0, limit || 3);
  }

  /* ---------- 홈 ---------- */
  function buildHome(nick, sakes, ratings, adminNick, today) {
    var p = profile(nick, sakes, ratings);
    var ratedIds = {};
    ratings.forEach(function (r) { if (r.nickname === nick) ratedIds[r.sake_id] = 1; });
    var t = dayNum(today);
    var fresh = sakes.slice().sort(function (a, b) { return String(b.created_at || '').localeCompare(String(a.created_at || '')) || b.id - a.id; })
      .slice(0, 6).map(function (s) {
        var it = lite(s);
        it.is_new = !!s.created_at && dayNum(String(s.created_at).slice(0, 10)) >= t - 14;
        it.rated = !!ratedIds[s.id];
        return it;
      });
    var byId = byIdOf(sakes);
    var feed = ratings.filter(function (r) { return r.nickname !== nick && byId[r.sake_id]; })
      .sort(function (a, b) { return String(b.updated_at || '').localeCompare(String(a.updated_at || '')); })
      .slice(0, 10).map(function (r) {
        return { nick: r.nickname, admin: r.nickname === adminNick, sake: { id: r.sake_id, name: byId[r.sake_id].name }, at: r.updated_at };
      });
    return {
      me: { nickname: nick, count: p.count, level: p.level, badges_got: p.badges_got, badges_total: p.badges_total },
      total: sakes.length,
      todo: sakes.filter(function (s) { return !ratedIds[s.id]; }).length,
      fresh: fresh,
      top: { items: ranking(sakes, ratings, null, null).slice(0, 3) }, // 테이스팅 랭킹 TOP 3 (전체 기간)
      feed: feed
    };
  }

  /* ---------- MY ---------- */
  function buildMy(nick, role, sakes, ratings, wishes, adminNick) {
    var p = profile(nick, sakes, ratings);
    var byId = byIdOf(sakes);
    var rated = {};
    var reviews = ratings.filter(function (r) { return r.nickname === nick && byId[r.sake_id]; })
      .sort(function (a, b) { return String(b.updated_at || '').localeCompare(String(a.updated_at || '')); })
      .map(function (r) {
        rated[r.sake_id] = 1;
        return { sake: lite(byId[r.sake_id]), stars: isNum(r.stars) ? r.stars : null, v: r.v, comment: r.comment || '', drank_on: r.drank_on || null, at: r.updated_at };
      });
    var wl = (wishes || []).filter(function (w) { return byId[w.sake_id]; }).map(function (w) {
      var it = lite(byId[w.sake_id]); it.rated = !!rated[w.sake_id]; return it;
    });
    return {
      nickname: nick, role: role,
      count: p.count, level: p.level, badges: p.badges, badges_got: p.badges_got, badges_total: p.badges_total, avg_stars: p.avg_stars,
      friends: similarFriends(nick, ratings, adminNick, 3),
      reviews: reviews,
      wishes: wl
    };
  }

  var api = {
    LEVELS: LEVELS, BADGES: BADGES, PERIODS: PERIODS,
    levelOf: levelOf, profile: profile, rangeFor: rangeFor, ranking: ranking,
    similarFriends: similarFriends, buildHome: buildHome, buildMy: buildMy
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SKCORE = api;
})(typeof window !== 'undefined' ? window : this);
