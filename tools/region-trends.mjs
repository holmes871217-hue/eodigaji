// B 항목: 전국 지역(시·군·구)별 핫플 점수 → app/data/region-trends.json (앱의 "전국 트렌드 지도"가 읽는다).
//
// 점수는 서로 다른 공급원을 섞으므로 규모 차이를 보정한다: 지역마다 값을 구한 뒤 "지역들 사이의 백분위(0~100)"로 바꿔서 합친다.
//   규모(level)     그 지역 상위 10개 장소의 네이버 1년 인기(yearly) 합 — "얼마나 인기 있는 곳이 모였나"
//   검색 변화(search) 검색량 충분(yearly>=30)한 장소들의 최근 4주 추세(trend)를 인기로 가중 평균 — "요즘 검색이 늘었나"
//   블로그 변화(blog) 발굴된 장소들의 최근 글 작성자 수 합이 7일 넘게 전보다 얼마나 변했나(app/data/hot-history.json). 기록이 7일 치 미만이면 없음
//   종합 = 규모 40% + 검색 변화 35% + 블로그 변화 25% (값이 없는 항목은 빼고 나머지로 다시 나눔)
// 최근 검색량 변화와 블로그 언급량 변화는 따로 저장해 화면에서 구분한다. 값이 모자라면 신뢰(conf)를 낮춘다:
//   h 장소 20곳+·검색 근거 10곳+·블로그 변화 있음 / m 장소 10곳+·검색 근거 5곳+ / l 그 밖(화면에서 "자료 적음")
//   basis: 실제로 쓴 근거 목록. 블로그 변화가 없으면 ["검색량"]만 들어간다(추정이 아니라 "근거 한 가지").
//
// 사용: node tools/region-trends.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isAmbiguousName } from './lib/names.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** 값 배열 → 각 값의 백분위(0~100). 같은 값은 같은 점수. */
function percentiles(vals) {
  const sorted = [...vals].sort((a, b) => a - b);
  return vals.map((v) => {
    const lo = sorted.findIndex((x) => x >= v);
    const hi = sorted.length - 1 - [...sorted].reverse().findIndex((x) => x <= v);
    return sorted.length > 1 ? (100 * (lo + hi) / 2) / (sorted.length - 1) : 50;
  });
}

export function compute(spots, hist, now) {
  const groups = new Map();
  for (const s of spots) {
    if (isAmbiguousName(s) && s.ykw === s.name) continue; // 일반 단어와 겹치는 이름을 이름만으로 잰 값은 믿을 수 없어 뺀다
    const parts = String(s.region || '').split(' ');
    if (parts.length < 2) continue;
    const key = `${parts[0]} ${parts[1]}`;
    (groups.get(key) || groups.set(key, []).get(key)).push(s);
  }
  const rows = [];
  for (const [key, list] of groups) {
    if (list.length < 5) continue; // 장소가 너무 적은 지역은 점수를 내지 않는다
    const ys = list.filter((s) => typeof s.yearly === 'number').map((s) => s.yearly).sort((a, b) => b - a);
    const level = ys.slice(0, 10).reduce((a, b) => a + b, 0);
    const sr = list.filter((s) => typeof s.yearly === 'number' && s.yearly >= 30 && typeof s.trend === 'number');
    const wsum = sr.reduce((a, s) => a + s.yearly, 0);
    const search = sr.length >= 3 && wsum > 0 ? sr.reduce((a, s) => a + clamp(s.trend, 0.3, 3) * s.yearly, 0) / wsum : null;
    let nowB = 0, oldB = 0, bn = 0;
    for (const s of list) {
      const h = hist[s.id];
      if (!h || typeof s.disc?.b !== 'number') continue;
      const old = h.filter(([d]) => daysBetween(d, now) >= 7).at(-1);
      if (!old) continue;
      nowB += s.disc.b; oldB += old[1]; bn++;
    }
    const blog = bn >= 3 && oldB >= 10 ? nowB / oldB : null;
    const top = [...list].filter((s) => typeof s.yearly === 'number').sort((a, b) => b.yearly - a.yearly).slice(0, 3).map((s) => s.name);
    const hotN = { n: 0, r: 0, h: 0 };
    for (const s of list) if (hotN[s.hot] != null) hotN[s.hot]++;
    const lat = list.reduce((a, s) => a + s.lat, 0) / list.length;
    const lng = list.reduce((a, s) => a + s.lng, 0) / list.length;
    const conf = list.length >= 20 && sr.length >= 10 && blog != null ? 'h' : list.length >= 10 && sr.length >= 5 ? 'm' : 'l';
    rows.push({ key, n: list.length, lat: +lat.toFixed(4), lng: +lng.toFixed(4), level, search, blog, searchN: sr.length, top, hot: hotN, conf });
  }
  // 규모 차이 보정: 항목별로 지역 사이 백분위로 바꾼 뒤 합친다
  const pl = percentiles(rows.map((r) => r.level));
  const withS = rows.filter((r) => r.search != null);
  const ps = percentiles(withS.map((r) => r.search));
  const withB = rows.filter((r) => r.blog != null);
  const pb = percentiles(withB.map((r) => r.blog));
  rows.forEach((r, i) => {
    const parts = [[0.4, pl[i]]];
    const basis = ['검색량'];
    const si = withS.indexOf(r); if (si >= 0) parts.push([0.35, ps[si]]);
    const bi = withB.indexOf(r); if (bi >= 0) { parts.push([0.25, pb[bi]]); basis.push('블로그'); }
    const w = parts.reduce((a, [x]) => a + x, 0);
    r.score = Math.round(parts.reduce((a, [x, v]) => a + x * v, 0) / w);
    r.basis = basis;
    r.level = Math.round(r.level);
    r.search = r.search == null ? null : +r.search.toFixed(2);
    r.blog = r.blog == null ? null : +r.blog.toFixed(2);
  });
  return rows.sort((a, b) => b.score - a.score);
}

function selfTest() {
  const fails = [];
  const ok = (c, m) => { if (!c) fails.push(m); };
  const p = percentiles([10, 20, 30, 40]);
  ok(p[0] === 0 && p[3] === 100, '백분위: 가장 작은 값 0, 가장 큰 값 100');
  const mk = (region, n, yearly, trend) => Array.from({ length: n }, (_, i) => ({ id: `${region}${i}`, region, name: `${region}${i}`, lat: 37, lng: 127, yearly, trend }));
  const rows = compute([...mk('경기 가시', 12, 60, 1.4), ...mk('경기 나시', 12, 30, 0.7), ...mk('경기 다시', 3, 90, 2)], {}, '2026-12-01');
  ok(rows.length === 2, '장소 5곳 미만 지역은 점수를 내지 않아야 해요');
  ok(rows[0].key === '경기 가시' && rows[0].score > rows[1].score, '인기·추세가 높은 지역이 위여야 해요');
  ok(rows.every((r) => r.blog === null && r.basis.length === 1), '블로그 기록이 없으면 근거는 검색량 한 가지여야 해요');
  ok(rows.every((r) => r.conf === 'm' || r.conf === 'l'), '블로그 변화가 없으면 신뢰가 높음(h)일 수 없어요');
  if (fails.length) { console.log('❌ 지역 트렌드 자체 점검 실패\n - ' + fails.join('\n - ')); process.exit(1); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  selfTest();
  const spots = JSON.parse(readFileSync(`${ROOT}app/data/spots.json`, 'utf8')).spots;
  const hp = `${ROOT}app/data/hot-history.json`;
  const hist = existsSync(hp) ? JSON.parse(readFileSync(hp, 'utf8')) : {};
  const rows = compute(spots, hist, today());
  writeFileSync(`${ROOT}app/data/region-trends.json`, JSON.stringify({ updatedAt: new Date().toISOString(), note: '지역별 핫플 점수(0~100, 지역 사이 백분위 기준)', regions: rows }));
  const cnt = (c) => rows.filter((r) => r.conf === c).length;
  console.log(`지역 트렌드 ${rows.length}개 지역 (신뢰 높음 ${cnt('h')} · 보통 ${cnt('m')} · 낮음 ${cnt('l')}) · 블로그 변화가 있는 지역 ${rows.filter((r) => r.blog != null).length}개`);
  console.log('상위: ' + rows.slice(0, 6).map((r) => `${r.key}(${r.score})`).join(', '));
}
