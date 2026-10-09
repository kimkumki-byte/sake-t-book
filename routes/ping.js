// 깨우기 신호: 외부 모니터링 서비스가 몇 분마다 이 주소를 부르면
// 서버 함수가 잠들지 않고, 데이터베이스(Supabase 무료 플랜의 1주일 미사용 일시정지)도 깨어 있어요.
// 개인 정보는 하나도 돌려주지 않아요.
const store = require('../lib/store');
const { handler, send } = require('../lib/http');

module.exports = handler(['GET', 'HEAD'], async (req, res) => {
  await store.ping();
  send(res, 200, { ok: true });
});
