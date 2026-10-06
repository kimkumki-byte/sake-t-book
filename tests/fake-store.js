// 테스트용 가짜 데이터베이스. 실제 Supabase와 같은 규칙(닉네임 중복 금지, 삭제 시 평가도 삭제, 한 사람 한 평가)을 흉내 내요.
function createFakeStore() {
  const db = { sakes: [], guests: [], ratings: [], images: new Set(), seq: 0, clock: Date.parse('2026-10-06T05:00:00Z') };
  const now = () => new Date((db.clock += 60000)).toISOString();
  const copy = (o) => JSON.parse(JSON.stringify(o));
  return {
    _db: db,
    async getGuest(nick) {
      const g = db.guests.find((x) => x.nickname.toLowerCase() === String(nick).toLowerCase());
      return g ? copy(g) : null;
    },
    async createGuest(nick, pwHash) {
      if (db.guests.some((x) => x.nickname.toLowerCase() === nick.toLowerCase())) {
        const e = new Error('duplicate'); e.code = 'DUP'; throw e;
      }
      db.guests.push({ nickname: nick, pw_hash: pwHash });
    },
    async listSakes() { return copy(db.sakes).reverse(); },
    async getSake(id) { const s = db.sakes.find((x) => x.id === id); return s ? copy(s) : null; },
    async createSake(row) {
      const s = { id: ++db.seq, ...row, created_at: now() };
      db.sakes.push(s);
      return copy(s);
    },
    async updateSake(id, row) {
      const s = db.sakes.find((x) => x.id === id);
      if (!s) return null;
      Object.assign(s, row);
      return copy(s);
    },
    async deleteSake(id) {
      db.sakes = db.sakes.filter((x) => x.id !== id);
      db.ratings = db.ratings.filter((r) => r.sake_id !== id);
    },
    async removeImage(url) { db.images.delete(url); },
    async allRatingsLite() { return db.ratings.map((r) => ({ sake_id: r.sake_id, nickname: r.nickname, drank_on: r.drank_on })); },
    async ratingsFor(id) {
      return copy(db.ratings.filter((r) => r.sake_id === id)).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    },
    async upsertRating({ sake_id, nickname, v, comment, drank_on }) {
      if (!db.sakes.some((s) => s.id === sake_id)) throw new Error('foreign key');
      const r = db.ratings.find((x) => x.sake_id === sake_id && x.nickname === nickname);
      if (r) Object.assign(r, { v, comment, drank_on, updated_at: now() });
      else db.ratings.push({ sake_id, nickname, v, comment, drank_on, updated_at: now() });
    },
    async uploadImage(buf, type) {
      const url = `https://fake.supabase.co/storage/v1/object/public/sake-images/${db.images.size + 1}-${Date.now()}.${type.split('/')[1]}`;
      db.images.add(url);
      return url;
    },
  };
}
module.exports = { createFakeStore };
