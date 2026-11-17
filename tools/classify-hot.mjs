// A 항목: 핫플 5분류 — 신규 발견 · 급상승 · 인기 유지 · 숨은 명소 · 관심 감소.
// 동네 장소(app/data/spots.json)에 분류(hot)와 자료 신뢰(hq)를 덧붙인다. 기존 필드는 건드리지 않는다.
//   hot: n 신규 발견 · r 급상승 · k 인기 유지 · h 숨은 명소 · f 관심 감소 (분류할 근거가 없으면 필드 없음)
//   hq : 1 근거 충분 · 0 근거 부족(화면에서 "자료 적음"으로 낮춰 표시)
//
// 근거(실제 값만 쓴다):
//   - 블로그 언급: tools/discover.mjs 가 센 "최근 글 작성자 수" disc.b. 실행할 때마다 app/data/hot-history.json 에 [날짜, b] 로 쌓아 둔다.
//   - 검색량: 네이버 1년 인기(yearly 0~100)와 최근 4주 추세(trend). 둘은 서로 다른 공급원이라 규모를 따로 본다.
//   - 최초 발견일: stamp-meta 의 first-seen(m.f). 기록 시작일(BASELINE) 이후 처음 생긴 장소만 "신규"가 될 수 있다.
// 규칙(위에서부터 먼저 맞는 것):
//   신규     m.f 가 최근 14일 안
//   관심 감소 블로그 작성자 수가 7일 넘게 전보다 30% 이상 줄었거나, (검색량 충분하고) 추세 0.6 이하
//   급상승   블로그 작성자 수가 7일 넘게 전보다 30% 이상 늘었거나, (검색량 충분하고) 추세 1.5 이상
//   숨은 명소 1년 검색량은 낮은데(yearly<30) 블로그 작성자 수는 많음(b>=15) — 검색은 적어도 글 쓰는 사람이 많은 곳
//   인기 유지 그 밖에 검색량이 충분(yearly>=30)하고 추세가 0.8~1.25
// 블로그 기록이 7일 치 미만이면 블로그 기반 급상승·감소는 판정하지 않는다(근거 부족) — 그래서 처음 며칠은 신규·숨은 명소·인기 유지 위주로 나온다.
//
// 사용: node tools/classify-hot.mjs [--self-test]   (여러 번 돌려도 같은 날에는 기록이 중복되지 않는다)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isAmbiguousName } from './lib/names.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SPOTS = `${ROOT}app/data/spots.json`;
const HIST = `${ROOT}app/data/hot-history.json`;
const BASELINE = '2026-11-17';
const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

/** 한 장소의 분류. history 는 [[날짜, b], ...] 오래된 순. now 는 오늘 날짜. */
export function classify(s, history, now) {
  const b = s.disc?.b;
  // 이름이 일반 단어와 겹치는데 아직 "지역+이름"으로 다시 재지 않은 곳은 검색량을 믿을 수 없어 쓰지 않는다
  const legacy = isAmbiguousName(s) && s.ykw === s.name;
  const yearly = typeof s.yearly === 'number' && !legacy ? s.yearly : null;
  const trend = typeof s.trend === 'number' && !legacy ? s.trend : null;
  const first = s.m?.f;
  // 블로그 비교 기준: 7일 이상 전의 가장 가까운 기록
  const old = (history || []).filter(([d]) => daysBetween(d, now) >= 7).at(-1);
  const blogOk = typeof b === 'number' && old && old[1] > 0;
  const blogRatio = blogOk ? b / old[1] : null;
  const searchOk = yearly != null && yearly >= 30 && trend != null;

  if (first && first > BASELINE && daysBetween(first, now) <= 14) return { hot: 'n', hq: b != null || searchOk ? 1 : 0 };
  if ((blogOk && blogRatio <= 0.7) || (searchOk && trend <= 0.6)) return { hot: 'f', hq: 1 };
  if ((blogOk && blogRatio >= 1.3) || (searchOk && trend >= 1.5)) return { hot: 'r', hq: 1 };
  if (yearly != null && yearly < 30 && typeof b === 'number' && b >= 15) return { hot: 'h', hq: 1 };
  if (searchOk && trend >= 0.8 && trend <= 1.25) return { hot: 'k', hq: 1 };
  if (yearly != null && yearly >= 30) return { hot: 'k', hq: 0 }; // 검색량은 충분하지만 추세가 애매 → 유지로 보되 근거 약함
  return null;
}

export function run(spots, hist, now) {
  const counts = {};
  for (const s of spots) {
    const id = s.id;
    if (typeof s.disc?.b === 'number') {
      const h = (hist[id] ||= []);
      if (!h.length || h.at(-1)[0] !== now) h.push([now, s.disc.b]);
      else h[h.length - 1] = [now, s.disc.b];
      if (h.length > 12) h.splice(0, h.length - 12);
    }
    const c = classify(s, hist[id], now);
    delete s.hot; delete s.hq;
    if (c) { s.hot = c.hot; s.hq = c.hq; counts[c.hot] = (counts[c.hot] || 0) + 1; }
  }
  // 목록에서 사라진 장소의 기록은 정리
  const live = new Set(spots.map((s) => s.id));
  for (const id of Object.keys(hist)) if (!live.has(id)) delete hist[id];
  return counts;
}

function selfTest() {
  const fails = [];
  const ok = (c, m) => { if (!c) fails.push(m); };
  const now = '2026-12-01';
  const mk = (o) => ({ id: 'x', m: { f: BASELINE }, ...o });
  ok(classify(mk({ m: { f: '2026-11-25' }, yearly: 50, trend: 1 }), [], now)?.hot === 'n', '14일 안에 처음 생긴 곳은 신규여야 해요');
  ok(classify(mk({ m: { f: BASELINE }, yearly: 50, trend: 1 }), [], now)?.hot === 'k', '기록 시작 전부터 있던 곳은 신규가 될 수 없어요');
  ok(classify(mk({ disc: { b: 20 }, yearly: 10 }), [['2026-11-20', 20]], now)?.hot === 'h', '검색량 낮고 작성자 많으면 숨은 명소');
  ok(classify(mk({ disc: { b: 30 }, yearly: 60, trend: 1 }), [['2026-11-20', 20]], now)?.hot === 'r', '작성자 수 30%+ 증가는 급상승');
  ok(classify(mk({ disc: { b: 10 }, yearly: 60, trend: 1 }), [['2026-11-20', 20]], now)?.hot === 'f', '작성자 수 30%+ 감소는 관심 감소');
  ok(classify(mk({ disc: { b: 30 }, yearly: 60, trend: 1 }), [['2026-11-28', 20]], now)?.hot !== 'r', '7일 미만 기록으로는 급상승을 판정하면 안 돼요');
  ok(classify(mk({ yearly: 70, trend: 1.8 }), [], now)?.hot === 'r', '검색 추세 1.5+ 는 급상승');
  ok(classify(mk({ yearly: 70, trend: 0.5 }), [], now)?.hot === 'f', '검색 추세 0.6- 는 관심 감소');
  ok(classify(mk({ yearly: 10, trend: 3 }), [], now) === null, '검색량도 블로그 근거도 없으면 분류하지 않아요');
  ok(classify(mk({ yearly: 40, trend: 1.0 }), [], now)?.hot === 'k', '꾸준한 곳은 인기 유지');
  if (fails.length) { console.log('❌ 자체 점검 실패\n - ' + fails.join('\n - ')); process.exit(1); }
  console.log('✅ 분류 규칙 자체 점검 통과');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  selfTest();
  if (process.argv.includes('--self-test')) process.exit(0);
  const data = JSON.parse(readFileSync(SPOTS, 'utf8'));
  const hist = existsSync(HIST) ? JSON.parse(readFileSync(HIST, 'utf8')) : {};
  const counts = run(data.spots, hist, today());
  writeFileSync(SPOTS, JSON.stringify(data));
  writeFileSync(HIST, JSON.stringify(hist));
  const names = { n: '신규 발견', r: '급상승', k: '인기 유지', h: '숨은 명소', f: '관심 감소' };
  console.log('핫플 분류: ' + Object.entries(counts).map(([k, v]) => `${names[k]} ${v}곳`).join(' · ') + ` · 근거 부족 ${data.spots.filter((s) => s.hq === 0).length}곳`);
}
