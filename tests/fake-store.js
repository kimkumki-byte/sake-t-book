// 테스트용 가짜 데이터베이스. 실제 Supabase와 같은 규칙(닉네임 중복 금지, 삭제 시 평가도 삭제, 한 사람 한 평가)을 흉내 내요.
function createFakeStore() {
  const db = { sakes: [], guests: [], ratings: [], wishes: [], images: new Set(), seq: 0, rseq: 0, clock: Date.parse('2026-10-06T05:00:00Z') };
  const now = () => new Date((db.clock += 60000)).toISOString();
  const copy = (o) => JSON.parse(JSON.stringify(o));
  return {
    _db: db,
    async ping() { db.pings = (db.pings || 0) + 1; },
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
      db.wishes = db.wishes.filter((w) => w.sake_id !== id);
    },
    async removeImage(url) { db.images.delete(url); },
    async allRatingsLite() { return db.ratings.map((r) => ({ sake_id: r.sake_id, nickname: r.nickname, drank_on: r.drank_on, stars: r.stars ?? null })); },
    async ratingsFor(id) {
      return copy(db.ratings.filter((r) => r.sake_id === id)).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    },
    async upsertRating({ sake_id, nickname, v, comment, drank_on, stars }) {
      if (!db.sakes.some((s) => s.id === sake_id)) throw new Error('foreign key');
      const r = db.ratings.find((x) => x.sake_id === sake_id && x.nickname === nickname);
      if (r) Object.assign(r, { v, comment, drank_on, stars, updated_at: now() });
      else db.ratings.push({ id: ++db.rseq, sake_id, nickname, v, comment, drank_on, stars, updated_at: now() });
    },
    async allRatings() { return copy(db.ratings).map((r) => ({ ...r, stars: r.stars ?? null })); },
    async listWishes(nick) {
      return copy(db.wishes.filter((w) => w.nickname === nick)).sort((a, b) => b.created_at.localeCompare(a.created_at));
    },
    async setWish(nick, sakeId, on) {
      db.wishes = db.wishes.filter((w) => !(w.nickname === nick && w.sake_id === sakeId));
      if (on) db.wishes.push({ nickname: nick, sake_id: sakeId, created_at: now() });
    },
    async renameGuest(oldNick, newNick) {
      if (db.guests.some((g) => g.nickname.toLowerCase() === newNick.toLowerCase() && g.nickname.toLowerCase() !== oldNick.toLowerCase())) {
        const e = new Error('duplicate'); e.code = 'DUP'; throw e;
      }
      const g = db.guests.find((x) => x.nickname.toLowerCase() === oldNick.toLowerCase());
      if (!g) throw new Error('guest not found');
      g.nickname = newNick;
      db.ratings.forEach((r) => { if (r.nickname === oldNick) r.nickname = newNick; });
      db.wishes.forEach((w) => { if (w.nickname === oldNick) w.nickname = newNick; });
    },
    async setPassword(nick, pwHash) {
      const g = db.guests.find((x) => x.nickname.toLowerCase() === nick.toLowerCase());
      if (g) g.pw_hash = pwHash;
    },
    async deleteGuest(nick) {
      db.ratings = db.ratings.filter((r) => r.nickname !== nick);
      db.wishes = db.wishes.filter((w) => w.nickname !== nick);
      db.guests = db.guests.filter((g) => g.nickname.toLowerCase() !== nick.toLowerCase());
    },
    async uploadImage(buf, type) {
      const url = `https://fake.supabase.co/storage/v1/object/public/sake-images/${db.images.size + 1}-${Date.now()}.${type.split('/')[1]}`;
      db.images.add(url);
      return url;
    },
  };
}
module.exports = { createFakeStore };
