// 지금 로그인한 사람이 누구인지 알려줘요
const { handler, send } = require('../lib/http');
const { getSession, adminConfig } = require('../lib/auth');

module.exports = handler(['GET'], async (req, res) => {
  const s = getSession(req);
  send(res, 200, { role: s ? s.role : null, nickname: s ? s.nick : null, adminNick: adminConfig().nick });
});
