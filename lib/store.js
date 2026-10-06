// 데이터베이스(Supabase)와 주고받는 부분. 화면은 이 파일을 직접 쓰지 않고 api/ 폴더의 서버 코드만 써요.
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const { HttpError } = require('./http');

const BUCKET = 'sake-images';
let client = null;

function db() {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new HttpError(500, '데이터베이스 설정(SUPABASE_URL, SUPABASE_SECRET_KEY)이 아직 안 되어 있어요.');
  }
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

function check(error) {
  if (error) {
    const e = new Error(error.message);
    e.code = error.code;
    throw e;
  }
}

const SAKE_FIELDS = 'id, name, rice, polish, abv, smv, acid, brewer, origin, tint, img_url, desc_title, desc_body, created_at';

module.exports = {
  async getGuest(nick) {
    const { data, error } = await db()
      .from('guests')
      .select('nickname, pw_hash')
      .eq('nick_key', String(nick).toLowerCase())
      .maybeSingle();
    check(error);
    return data || null;
  },

  async createGuest(nick, pwHash) {
    const { error } = await db().from('guests').insert({ nickname: nick, pw_hash: pwHash });
    if (error) {
      if (error.code === '23505') {
        const e = new Error('duplicate');
        e.code = 'DUP';
        throw e;
      }
      check(error);
    }
  },

  async listSakes() {
    const { data, error } = await db().from('sakes').select(SAKE_FIELDS).order('created_at', { ascending: false });
    check(error);
    return data || [];
  },

  async getSake(id) {
    const { data, error } = await db().from('sakes').select(SAKE_FIELDS).eq('id', id).maybeSingle();
    check(error);
    return data || null;
  },

  async createSake(row) {
    const { data, error } = await db().from('sakes').insert(row).select(SAKE_FIELDS).single();
    check(error);
    return data;
  },

  async updateSake(id, patch) {
    const { data, error } = await db().from('sakes').update(patch).eq('id', id).select(SAKE_FIELDS).single();
    check(error);
    return data;
  },

  // 사진 파일 정리 (실패해도 서비스에는 영향 없게 조용히 넘어가요)
  async removeImage(url) {
    try {
      const marker = `/${BUCKET}/`;
      const i = String(url).indexOf(marker);
      if (i < 0) return;
      const path = decodeURIComponent(String(url).slice(i + marker.length).split('?')[0]);
      await db().storage.from(BUCKET).remove([path]);
    } catch (e) {
      console.error('이미지 정리 실패', e.message);
    }
  },

  async updateSake(id, row) {
    const { data, error } = await db().from('sakes').update(row).eq('id', id).select(SAKE_FIELDS).maybeSingle();
    check(error);
    return data || null;
  },

  async deleteSake(id) {
    const { error } = await db().from('sakes').delete().eq('id', id);
    check(error);
  },

  // 더 이상 쓰지 않는 사진 지우기 (실패해도 서비스에는 영향 없음)
  async removeImage(url) {
    if (!url) return;
    const marker = `/object/public/${BUCKET}/`;
    const i = url.indexOf(marker);
    if (i < 0) return;
    const path = decodeURIComponent(url.slice(i + marker.length));
    try { await db().storage.from(BUCKET).remove([path]); } catch (e) { /* 무시 */ }
  },

  // 모든 평가 (사케별 인원수, 내가 평가했는지 확인용)
  async allRatingsLite() {
    const { data, error } = await db().from('ratings').select('sake_id, nickname, drank_on');
    check(error);
    return data || [];
  },

  async ratingsFor(sakeId) {
    const { data, error } = await db()
      .from('ratings')
      .select('nickname, v, comment, drank_on, updated_at')
      .eq('sake_id', sakeId)
      .order('updated_at', { ascending: false });
    check(error);
    return data || [];
  },

  async upsertRating({ sake_id, nickname, v, comment, drank_on }) {
    const { error } = await db()
      .from('ratings')
      .upsert(
        { sake_id, nickname, v, comment, drank_on, updated_at: new Date().toISOString() },
        { onConflict: 'sake_id,nickname' }
      );
    check(error);
  },

  // 이미지 업로드 후 공개 주소를 돌려줘요
  async uploadImage(buffer, contentType) {
    const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
    const path = `${Date.now()}-${crypto.randomBytes(5).toString('hex')}.${ext}`;
    const { error } = await db().storage.from(BUCKET).upload(path, buffer, { contentType, upsert: false });
    check(error);
    const { data } = db().storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
  },
};
