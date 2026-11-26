// 테스트용 가짜 데이터베이스. 실제 Supabase와 같은 규칙(닉네임 중복 금지, 삭제 시 평가도 삭제, 같은 사케 여러 번 리뷰 가능, 리뷰는 본인만 수정·삭제)을 흉내 내요.
function createFakeStore() {
  const db = { sakes: [], guests: [], ratings: [], wishes: [], requests: [], fails: {}, qseq: 0, images: new Set(), seq: 0, rseq: 0, clock: Date.now() - 86400000 }; // 시계는 하루 전부터 (날짜가 지나도 '새 사케' 판정이 맞게)
  const now = () => new Date((db.clock += 60000)).toISOString();
  const copy = (o) => JSON.parse(JSON.stringify(o));
  return {
    _db: db,
    async allOsul() {
      return copy((db.osul || []).filter((o) => db.sakes.some((x) => x.id === o.sake_id)))
        .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.pos - b.pos));
    },
    async setOsul(day, ids) {
      db.osul = (db.osul || []).filter((o) => o.day !== day);
      ids.forEach((id, i) => db.osul.push({ day, sake_id: id, pos: i + 1 }));
    },
    async ping() { db.pings = (db.pings || 0) + 1; },
    async getGuest(nick) {
      const g = db.guests.find((x) => x.nickname.toLowerCase() === String(nick).toLowerCase());
      return g ? copy(g) : null;
    },
    async createGuest(nick, pwHash) {
      if (db.guests.some((x) => x.nickname.toLowerCase() === nick.toLowerCase())) {
        const e = new Error('duplicate'); e.code = 'DUP'; throw e;
      }
      db.guests.push({ nickname: nick, pw_hash: pwHash, created_at: now() });
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
      db.osul = (db.osul || []).filter((o) => o.sake_id !== id);
    },
    async removeImage(url) { db.images.delete(url); },
    async allRatingsLite() { return db.ratings.map((r) => ({ id: r.id, sake_id: r.sake_id, nickname: r.nickname, drank_on: r.drank_on, stars: r.stars ?? null, created_at: r.created_at })); },
    async ratingsFor(id) {
      return copy(db.ratings.filter((r) => r.sake_id === id)).sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id);
    },
    async insertRating({ sake_id, nickname, v, comment, drank_on, stars, temp = null }) {
      if (!db.sakes.some((s) => s.id === sake_id)) throw new Error('foreign key');
      const at = now();
      const id = ++db.rseq;
      db.ratings.push({ id, sake_id, nickname, v, comment, drank_on, stars, temp, created_at: at, updated_at: at });
      return id;
    },
    async updateRating(id, nickname, { v, comment, drank_on, stars, temp = null }) {
      const r = db.ratings.find((x) => x.id === id && x.nickname === nickname);
      if (!r) return null;
      Object.assign(r, { v, comment, drank_on, stars, temp, updated_at: now() });
      return copy(r);
    },
    async deleteRating(id, nickname) {
      const before = db.ratings.length;
      db.ratings = db.ratings.filter((x) => !(x.id === id && x.nickname === nickname));
      return before - db.ratings.length;
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
      db.requests.forEach((q) => { if (q.nickname === oldNick) q.nickname = newNick; });
      delete db.fails['g:' + oldNick.toLowerCase()];
    },
    async setPassword(nick, pwHash) {
      const g = db.guests.find((x) => x.nickname.toLowerCase() === nick.toLowerCase());
      if (g) g.pw_hash = pwHash;
    },
    async deleteGuest(nick) {
      db.ratings = db.ratings.filter((r) => r.nickname !== nick);
      db.wishes = db.wishes.filter((w) => w.nickname !== nick);
      db.requests = db.requests.filter((q) => q.nickname !== nick);
      delete db.fails['g:' + nick.toLowerCase()];
      db.guests = db.guests.filter((g) => g.nickname.toLowerCase() !== nick.toLowerCase());
    },
    async listGuests() { return copy(db.guests).map((g) => ({ nickname: g.nickname, created_at: g.created_at || null })); },
    async getLoginFail(key) { return db.fails[key] ? copy({ key, ...db.fails[key] }) : null; },
    async setLoginFail(key, fails, lockedUntil) { db.fails[key] = { fails, locked_until: lockedUntil }; },
    async clearLoginFail(key) { delete db.fails[key]; },
    async listRequests(nick) {
      return copy(db.requests.filter((q) => !nick || q.nickname === nick)).sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id);
    },
    async createRequest({ nickname, name, note }) {
      const q = { id: ++db.qseq, nickname, name, note, done: false, created_at: now() };
      db.requests.push(q);
      return copy(q);
    },
    async setRequestDone(id, done) {
      const q = db.requests.find((x) => x.id === id);
      if (!q) return null;
      q.done = done;
      return { id, done };
    },
    async deleteRequest(id, nick) {
      const before = db.requests.length;
      db.requests = db.requests.filter((x) => !(x.id === id && (!nick || x.nickname === nick)));
      return before - db.requests.length;
    },
    async uploadImage(buf, type) {
      const url = `https://fake.supabase.co/storage/v1/object/public/sake-images/${db.images.size + 1}-${Date.now()}.${type.split('/')[1]}`;
      db.images.add(url);
      return url;
    },
  };
}
module.exports = { createFakeStore };
