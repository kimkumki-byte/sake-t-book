// 입력값 검사 도우미
const { HttpError } = require('./http');

function len(s) {
  return Array.from(s).length; // 한글, 이모지도 1글자로 셈
}

function text(value, max, label, { required = false, multiline = false } = {}) {
  let s = value == null ? '' : String(value);
  // 여러 줄 글: 줄바꿈 형식을 통일하고 탭은 띄어쓰기로
  if (multiline) s = s.replace(/\r\n?/g, '\n').replace(/\t/g, ' ');
  s = s.trim();
  if (required && !s) throw new HttpError(400, `${label}을(를) 입력해 주세요.`);
  if (len(s) > max) throw new HttpError(400, `${label}은(는) ${max}자 이내로 입력해 주세요.`);
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(s.replace(/\n/g, ''))) throw new HttpError(400, `${label}에 쓸 수 없는 문자가 있어요.`);
  return s;
}

function numberText(value, label, { min = -Infinity, max = Infinity } = {}) {
  const s = value == null ? '' : String(value).trim();
  if (!s) return '';
  if (!/^[+-]?\d{1,3}(\.\d{1,2})?$/.test(s)) throw new HttpError(400, `${label}은(는) 숫자로 입력해 주세요.`);
  const n = Number(s);
  if (n < min || n > max) throw new HttpError(400, `${label} 값이 범위를 벗어났어요.`);
  return s;
}

function nickname(value) {
  const s = text(value, 12, '닉네임', { required: true });
  return s;
}

function password(value) {
  const s = value == null ? '' : String(value);
  if (s.length < 4) throw new HttpError(400, '비밀번호는 4자 이상이에요.');
  if (s.length > 72) throw new HttpError(400, '비밀번호가 너무 길어요.');
  return s;
}

function scores(v) {
  if (!Array.isArray(v) || v.length !== 5 || !v.every((x) => Number.isInteger(x) && x >= 1 && x <= 5)) {
    throw new HttpError(400, '5개 항목을 모두 1~5점으로 입력해 주세요.');
  }
  return v;
}

// 한국 시간 기준 오늘 날짜 (YYYY-MM-DD)
function todayKST() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

// 마신 날짜: 비우면 오늘. 실제 있는 날짜만, 미래 날짜는 안 됨
function drankOn(value) {
  const s = value == null ? '' : String(value).trim();
  const today = todayKST();
  if (!s) return today;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
  if (!d || d.toISOString().slice(0, 10) !== s) throw new HttpError(400, '마신 날짜를 다시 골라 주세요.');
  if (s < '2000-01-01') throw new HttpError(400, '마신 날짜가 너무 예전이에요.');
  // 시차를 고려해 하루 여유를 둬요
  const limit = new Date(Date.parse(today + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
  if (s > limit) throw new HttpError(400, '미래 날짜는 고를 수 없어요.');
  return s;
}

function tint(value) {
  const s = String(value || '');
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s : '#4f7cac';
}

module.exports = { text, numberText, nickname, password, scores, tint, len, drankOn, todayKST };
