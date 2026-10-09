// 모든 /api/… 요청을 서버 함수 하나가 받아요.
// 예전에는 화면마다 함수가 따로라 탭을 옮길 때마다 서버가 새로 깨어나느라(콜드 스타트) 느렸어요.
// 하나로 합치면 한 번 깨어난 서버가 홈·랭킹·테이스팅·MY를 모두 바로 처리해요.
const routes = {
  me: require('../routes/me'),
  auth: require('../routes/auth'),
  home: require('../routes/home'),
  sakes: require('../routes/sakes'),
  sake: require('../routes/sake'),
  rate: require('../routes/rate'),
  ranking: require('../routes/ranking'),
  my: require('../routes/my'),
  wish: require('../routes/wish'),
  ping: require('../routes/ping'),
};

module.exports = async (req, res) => {
  const name = String((req.query && req.query.route) || '');
  const fn = Object.prototype.hasOwnProperty.call(routes, name) ? routes[name] : null;
  if (!fn) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(404).json({ error: '알 수 없는 요청이에요.' });
  }
  // 경로 이름은 요청 값이 아니라서 지워 둬요 (각 화면 코드가 보는 query는 예전과 같아요)
  const query = { ...req.query };
  delete query.route;
  req.query = query;
  return fn(req, res);
};
