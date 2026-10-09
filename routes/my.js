// MY: 레벨·뱃지, 내가 쓴 리뷰, 찜, 별점이 비슷한 친구
const store = require('../lib/store');
const core = require('../lib/core');
const { handler, send } = require('../lib/http');
const { requireSession, adminConfig } = require('../lib/auth');

module.exports = handler(['GET'], async (req, res) => {
  const me = requireSession(req);
  const [sakes, ratings, wishes] = await Promise.all([store.listSakes(), store.allRatings(), store.listWishes(me.nick)]);
  send(res, 200, core.buildMy(me.nick, me.role, sakes, ratings, wishes, adminConfig().nick));
});
