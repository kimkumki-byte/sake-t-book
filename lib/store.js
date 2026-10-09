// 데이터베이스(Supabase)와 주고받는 부분. 화면은 이 파일을 직접 쓰지 않고 api/ 폴더의 서버 코드만 써요.
// 속도를 위해 무거운 supabase-js 라이브러리 대신, 같은 요청을 Node 기본 fetch로 직접 보내요.
// (서버가 처음 깨어날 때 라이브러리를 읽는 시간이 줄어들어요)
const crypto = require('crypto');
const { HttpError } = require('./http');

const BUCKET = 'sake-images';
let conf = null;

function cfg() {
  if (conf) return conf;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new HttpError(500, '데이터베이스 설정(SUPABASE_URL, SUPABASE_SECRET_KEY)이 아직 안 되어 있어요.');
  }
  conf = { url: url.replace(/\/+$/, ''), key };
  return conf;
}

function dbError(message, code) {
  const e = new Error(message || '데이터베이스 오류');
  e.code = code;
  return e;
}

// 요청 한 번 보내고, 오류면 supabase-js와 같은 모양(e.code)으로 던져요
async function call(method, path, { query, body, headers, raw } = {}) {
  const { url, key } = cfg();
  const qs = query ? '?' + new URLSearchParams(query).toString() : '';
  const h = { apikey: key, Authorization: 'Bearer ' + key, Accept: '*/*', ...headers };
  let payload;
  if (raw !== undefined) payload = raw;
  else if (body !== undefined) {
    payload = JSON.stringify(body);
    h['Content-Type'] = 'application/json';
  }
  let res;
  try {
    res = await fetch(url + path + qs, { method, headers: h, body: payload });
  } catch (e) {
    throw dbError('데이터베이스에 연결하지 못했어요: ' + e.message);
  }
  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch (e) { data = text; }
  }
  if (!res.ok) {
    const d = data && typeof data === 'object' ? data : {};
    throw dbError(d.message || d.error || String(text || res.status), d.code || String(res.status));
  }
  return data;
}

// 표(테이블) 다루기: PostgREST 규칙 그대로
const rest = {
  select(table, select, filters = {}, order) {
    const query = { select, ...filters };
    if (order) query.order = order;
    return call('GET', '/rest/v1/' + table, { query, headers: { 'Accept-Profile': 'public' } }).then((d) => d || []);
  },
  async maybeOne(table, select, filters) {
    const rows = await rest.select(table, select, filters);
    if (rows.length > 1) throw dbError('결과가 여러 개예요', 'PGRST116');
    return rows[0] || null;
  },
  write(method, table, { query, body, prefer, accept } = {}) {
    const headers = { 'Content-Profile': 'public' };
    if (prefer) headers.Prefer = prefer;
    if (accept) headers.Accept = accept;
    return call(method, '/rest/v1/' + table, { query, body: body === undefined ? undefined : body, headers });
  },
};

const eq = (v) => 'eq.' + v;

// 별점은 소수(numeric)라 글자로 올 수도 있어서 숫자로 맞춰요
function numStars(r) {
  return { ...r, stars: r.stars == null ? null : Number(r.stars) };
}

const SAKE_FIELDS = 'id,name,rice,polish,abv,smv,acid,brewer,origin,tint,img_url,desc_title,desc_body,created_at';

module.exports = {
  // 깨우기용 가벼운 조회 (사케 번호 하나만)
  async ping() {
    await rest.select('sakes', 'id', { limit: '1' });
  },

  async getGuest(nick) {
    return rest.maybeOne('guests', 'nickname,pw_hash', { nick_key: eq(String(nick).toLowerCase()) });
  },

  async createGuest(nick, pwHash) {
    try {
      await rest.write('POST', 'guests', { body: { nickname: nick, pw_hash: pwHash } });
    } catch (error) {
      if (error.code === '23505') {
        const e = new Error('duplicate');
        e.code = 'DUP';
        throw e;
      }
      throw error;
    }
  },

  async listSakes() {
    return rest.select('sakes', SAKE_FIELDS, {}, 'created_at.desc');
  },

  async getSake(id) {
    return rest.maybeOne('sakes', SAKE_FIELDS, { id: eq(id) });
  },

  async createSake(row) {
    return rest.write('POST', 'sakes', {
      query: { select: SAKE_FIELDS }, body: row,
      prefer: 'return=representation', accept: 'application/vnd.pgrst.object+json',
    });
  },

  async updateSake(id, row) {
    const rows = await rest.write('PATCH', 'sakes', {
      query: { id: eq(id), select: SAKE_FIELDS }, body: row, prefer: 'return=representation',
    });
    return (Array.isArray(rows) ? rows[0] : rows) || null;
  },

  async deleteSake(id) {
    await rest.write('DELETE', 'sakes', { query: { id: eq(id) } });
  },

  // 더 이상 쓰지 않는 사진 지우기 (실패해도 서비스에는 영향 없음)
  async removeImage(url) {
    if (!url) return;
    const marker = `/object/public/${BUCKET}/`;
    const i = String(url).indexOf(marker);
    if (i < 0) return;
    const path = decodeURIComponent(String(url).slice(i + marker.length).split('?')[0]);
    try {
      await call('DELETE', '/storage/v1/object/' + BUCKET, { body: { prefixes: [path] } });
    } catch (e) { /* 무시 */ }
  },

  // 모든 평가 (사케별 인원수, 내가 평가했는지 확인용)
  async allRatingsLite() {
    return (await rest.select('ratings', 'sake_id,nickname,drank_on,stars')).map(numStars);
  },

  // 모든 평가 (레벨·뱃지·랭킹 계산용)
  async allRatings() {
    return (await rest.select('ratings', 'id,sake_id,nickname,v,comment,stars,drank_on,updated_at')).map(numStars);
  },

  async listWishes(nick) {
    return rest.select('wishes', 'sake_id,created_at', { nickname: eq(nick) }, 'created_at.desc');
  },

  async setWish(nick, sakeId, on) {
    if (on) {
      await rest.write('POST', 'wishes', {
        query: { on_conflict: 'nickname,sake_id' }, body: { nickname: nick, sake_id: sakeId },
        prefer: 'resolution=ignore-duplicates',
      });
    } else {
      await rest.write('DELETE', 'wishes', { query: { nickname: eq(nick), sake_id: eq(sakeId) } });
    }
  },

  // 닉네임 바꾸기: 회원 정보·평가·찜을 한 번에 (데이터베이스 함수)
  async renameGuest(oldNick, newNick) {
    try {
      await rest.write('POST', 'rpc/rename_guest', { body: { old_nick: oldNick, new_nick: newNick } });
    } catch (error) {
      if (error.code === '23505') { const e = new Error('duplicate'); e.code = 'DUP'; throw e; }
      throw error;
    }
  },

  async setPassword(nick, pwHash) {
    await rest.write('PATCH', 'guests', { query: { nick_key: eq(String(nick).toLowerCase()) }, body: { pw_hash: pwHash } });
  },

  // 탈퇴: 평가·찜·회원 정보를 한 번에 삭제 (데이터베이스 함수)
  async deleteGuest(nick) {
    await rest.write('POST', 'rpc/delete_guest', { body: { p_nick: nick } });
  },

  async ratingsFor(sakeId) {
    return (await rest.select('ratings', 'nickname,v,comment,stars,drank_on,updated_at', { sake_id: eq(sakeId) }, 'updated_at.desc')).map(numStars);
  },

  async upsertRating({ sake_id, nickname, v, comment, drank_on, stars }) {
    await rest.write('POST', 'ratings', {
      query: { on_conflict: 'sake_id,nickname' },
      body: { sake_id, nickname, v, comment, drank_on, stars, updated_at: new Date().toISOString() },
      prefer: 'resolution=merge-duplicates',
    });
  },

  // 이미지 업로드 후 공개 주소를 돌려줘요 (파일 이름이 매번 달라서 1년 동안 캐시해도 안전해요)
  async uploadImage(buffer, contentType) {
    const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
    const path = `${Date.now()}-${crypto.randomBytes(5).toString('hex')}.${ext}`;
    await call('POST', `/storage/v1/object/${BUCKET}/${path}`, {
      raw: buffer,
      headers: { 'Content-Type': contentType, 'x-upsert': 'false', 'Cache-Control': 'max-age=31536000' },
    });
    return `${cfg().url}/storage/v1/object/public/${BUCKET}/${path}`;
  },
};
