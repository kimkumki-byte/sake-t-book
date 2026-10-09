// 랭킹: 만족도 별점 평균. 기간은 전체(기본)·월간·주간·일간 (마신 날짜 기준), offset으로 지난 기간
const store = require('../lib/store');
const core = require('../lib/core');
const v = require('../lib/validate');
const { handler, send } = require('../lib/http');
const { requireSession } = require('../lib/auth');

module.exports = handler(['GET'], async (req, res) => {
  requireSession(req);
  const range = core.rangeFor(String(req.query.period || 'all'), req.query.offset, v.todayKST());
  const [sakes, ratings] = await Promise.all([store.listSakes(), store.allRatings()]);
  send(res, 200, { ...range, items: core.ranking(sakes, ratings, range.start, range.end) });
});
