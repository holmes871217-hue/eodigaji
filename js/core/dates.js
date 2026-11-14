// 날짜 계산 도우미. 날짜는 모두 'YYYY-MM-DD' 글자 형태로 주고받는다.
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

export function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

export function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO() {
  return toISO(new Date());
}

export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function diffDays(a, b) {
  return Math.round((parseISO(b) - parseISO(a)) / 86400000);
}

/** 예: '11/21(토)' */
export function fmtDate(iso) {
  const d = parseISO(iso);
  return `${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]})`;
}

/** 예: '11월 21일 토요일' */
export function fmtLong(iso) {
  const d = parseISO(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${DOW[d.getDay()]}요일`;
}

/** 오늘 이후 가장 가까운 토요일 (오늘이 토요일이면 다음 주 토요일) */
export function nextSaturday(from = todayISO()) {
  const d = parseISO(from);
  const add = (6 - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + add);
  return toISO(d);
}

export function isValidISO(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parseISO(s).getTime());
}
