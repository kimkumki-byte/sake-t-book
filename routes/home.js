// 홈 화면: 내 레벨, 아직 안 마신 사케 수, 새로 들어온 사케, 테이스팅 랭킹 TOP 3(전체 기간), 친구들의 최근 시음
const store = require('../lib/store');
const core = require('../lib/core');
const v = require('../lib/validate');
const { handler, send } = require('../lib/http');
const { requireSession, adminConfig } = require('../lib/auth');

module.exports = handler(['GET'], async (req, res) => {
  const me = requireSession(req);
  const [sakes, ratings] = await Promise.all([store.listSakes(), store.allRatings()]);
  send(res, 200, core.buildHome(me.nick, sakes, ratings, adminConfig().nick, v.todayKST()));
});
