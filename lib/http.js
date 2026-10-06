// 모든 API가 공통으로 쓰는 도우미: 오류 처리, JSON 응답, 기본 보안 확인

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function send(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(body);
}

// methods: 허용할 요청 종류, fn: 실제 처리 함수
function handler(methods, fn) {
  return async (req, res) => {
    try {
      if (!methods.includes(req.method)) {
        res.setHeader('Allow', methods.join(', '));
        return send(res, 405, { error: '지원하지 않는 요청이에요.' });
      }
      // 다른 사이트에서 몰래 보내는 요청을 막기 위한 확인
      if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'sakechibuk') {
        return send(res, 403, { error: '허용되지 않은 요청이에요.' });
      }
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) { body = {}; }
      }
      req.body = body && typeof body === 'object' ? body : {};
      req.query = req.query || {};
      await fn(req, res);
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message });
      console.error(e);
      return send(res, 500, { error: '서버에 문제가 생겼어요. 잠시 후 다시 시도해 주세요.' });
    }
  };
}

module.exports = { HttpError, send, handler };
