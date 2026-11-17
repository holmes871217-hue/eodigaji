// C 항목: 개인 취향 프로필과 행동 데이터(조회·찜·관심 없음·방문 완료·평가).
// 저장: localStorage 의 새 키 "eodigaji.taste.v1" 하나. 기존 설정 키(eodigaji.v1)는 읽지도 쓰지도 않는다.
// 원칙: 성별·나이로 취향을 단정하지 않는다. 사용자가 직접 고른 취향과 실제 행동만 쓴다.
//   직접 고른 취향 → 취향에 맞는 장소 최대 +35%
//   행동(찜·좋은 평가·방문 → 그 분류에 대한 호감 / 관심 없음·나쁜 평가 → 비호감) → 분류별 ±25%
//   관심 없음으로 숨긴 장소는 추천 목록에서 뺀다(마이 탭에서 되돌릴 수 있다)
//   다녀온 장소는 같은 곳이 또 위에 오지 않게 조금 낮춘다(좋게 평가한 곳은 덜 낮춤)

export const TASTE_KEY = 'eodigaji.taste.v1';

export const TASTES = [
  { v: 'nature', label: '자연', icon: '🌳' },
  { v: 'healing', label: '힐링', icon: '🧘' },
  { v: 'food', label: '미식', icon: '🍜' },
  { v: 'activity', label: '체험', icon: '🎢' },
  { v: 'culture', label: '문화', icon: '🎭' },
  { v: 'shopping', label: '쇼핑', icon: '🛍️' },
  { v: 'photo', label: '사진', icon: '📷' },
  { v: 'night', label: '야경', icon: '🌃' },
];

// 분류(cat)가 어떤 취향에 해당하는지
const CAT_TASTES = {
  nature: ['nature', 'healing', 'photo'], sea: ['nature', 'healing', 'photo'], zoo: ['activity', 'nature'], theme: ['activity'],
  museum: ['culture', 'activity'], gallery: ['culture', 'photo'], culture: ['culture', 'photo'], stage: ['culture'], expo: ['culture'],
  market: ['food', 'shopping'], cafe: ['food', 'photo'], shop: ['shopping'], activity: ['activity'], kids: ['activity'],
  walk: ['nature', 'healing'], resort: ['healing', 'activity'], trend: ['photo', 'shopping', 'food'],
};
// 이름으로 더 맞추는 것
const NAME_TASTES = [
  [/전망대|타워|야경|케이블카|빛|조명|한강|불꽃|루미나|스카이/, 'night'],
  [/온천|스파|휴양림|숲|힐링|템플|산책|호수|수목원/, 'healing'],
  [/포토|정원|꽃|은행나무|벚꽃|단풍|전망|미디어|뮤지엄|갤러리/, 'photo'],
  [/먹자|맛집|떡볶이|시장|막걸리|치킨|카페|베이커리|빵/, 'food'],
  [/몰$|백화점|아울렛|스타필드|쇼핑|소품|스트리트/, 'shopping'],
];

export function tastesOf(place) {
  const set = new Set(CAT_TASTES[place.cat] || []);
  const t = `${place.name || ''} ${place.sub || ''}`;
  for (const [re, k] of NAME_TASTES) if (re.test(t)) set.add(k);
  return [...set];
}

const empty = () => ({ prefs: [], places: {}, v: 1 });

let storage = (typeof localStorage !== 'undefined' ? localStorage : null);
export function _setStorage(s) { storage = s; } // 시험용

export function loadTaste() {
  try {
    const raw = storage && storage.getItem(TASTE_KEY);
    const d = raw ? JSON.parse(raw) : null;
    if (d && Array.isArray(d.prefs) && d.places && typeof d.places === 'object') return { ...empty(), ...d };
  } catch (e) { /* 저장소를 못 읽으면 빈 취향으로 시작 */ }
  return empty();
}

export function saveTaste(t) {
  try { storage && storage.setItem(TASTE_KEY, JSON.stringify(t)); } catch (e) { /* 저장 실패해도 앱은 계속 */ }
}

const rec = (t, id) => (t.places[id] ||= {});
const trim = (t) => { // 기록이 끝없이 커지지 않게: 조회만 한 오래된 기록부터 버린다(최대 600곳)
  const ids = Object.keys(t.places);
  if (ids.length <= 600) return;
  const viewOnly = ids.filter((id) => { const r = t.places[id]; return !r.h && !r.d && !r.r; }).sort((x, y) => (t.places[x].t || 0) - (t.places[y].t || 0));
  for (const id of viewOnly.slice(0, ids.length - 600)) delete t.places[id];
};

export function togglePref(t, v) {
  const i = t.prefs.indexOf(v);
  if (i >= 0) t.prefs.splice(i, 1); else t.prefs.push(v);
}
export function recordView(t, id) { const r = rec(t, id); r.v = (r.v || 0) + 1; r.t = Date.now(); trim(t); }
export function setHidden(t, id, on) { const r = rec(t, id); if (on) r.h = 1; else delete r.h; }
export function setVisited(t, id, on) { const r = rec(t, id); if (on) r.d = new Date().toISOString().slice(0, 10); else { delete r.d; delete r.r; } }
export function setRating(t, id, n) { const r = rec(t, id); r.r = Math.max(1, Math.min(5, Math.round(n))); if (!r.d) r.d = new Date().toISOString().slice(0, 10); }
export const hiddenCount = (t) => Object.values(t.places).filter((r) => r.h).length;
export function clearHidden(t) { for (const r of Object.values(t.places)) delete r.h; }

/**
 * 분류별 호감(-1~1): 찜·좋은 평가(4~5점)·방문은 +, 관심 없음·나쁜 평가(1~2점)는 −.
 * places: 지금 앱의 장소 목록(분류를 알기 위해), favIds: 찜한 장소 id 목록
 */
export function categoryAffinity(t, places, favIds = []) {
  const byId = new Map(places.map((p) => [p.id, p]));
  const sum = {}, cnt = {};
  const add = (id, w) => { const p = byId.get(id); if (!p) return; sum[p.cat] = (sum[p.cat] || 0) + w; cnt[p.cat] = (cnt[p.cat] || 0) + 1; };
  for (const id of favIds) add(id, 1);
  for (const [id, r] of Object.entries(t.places)) {
    if (r.h) add(id, -1);
    if (r.r) add(id, r.r >= 4 ? 1.5 : r.r <= 2 ? -1.5 : 0);
    else if (r.d) add(id, 0.5);
  }
  const out = {};
  for (const [cat, s] of Object.entries(sum)) out[cat] = Math.max(-1, Math.min(1, s / Math.max(2, cnt[cat] + 1))); // 기록이 적을 때 너무 쏠리지 않게 분모에 여유
  return out;
}

/** 추천 점수에 곱할 취향 보정기를 만든다. rankPlaces 의 opts.taste 로 넘긴다. */
export function makeTasteScorer(t, places, favIds = []) {
  const aff = categoryAffinity(t, places, favIds);
  const prefs = new Set(t.prefs);
  return {
    hidden: (p) => Boolean(t.places[p.id]?.h),
    factor(p) {
      let f = 1;
      if (prefs.size) {
        const mine = tastesOf(p);
        if (mine.length) { const hit = mine.filter((k) => prefs.has(k)).length; f *= 1 + (hit >= 2 ? 0.35 : hit === 1 ? 0.25 : 0); } // 고른 취향 1개에 맞으면 +25%, 2개 이상 +35%
        else f *= 0.97;
      }
      if (aff[p.cat]) f *= 1 + 0.25 * aff[p.cat];
      const r = t.places[p.id];
      if (r?.d) f *= r.r >= 4 ? 0.9 : r.r && r.r <= 2 ? 0.5 : 0.8; // 다녀온 곳은 조금 낮춤(좋게 평가했으면 덜), 나쁘게 평가했으면 크게
      return f;
    },
    active: prefs.size > 0 || Object.keys(aff).length > 0 || Object.values(t.places).some((r) => r.h || r.d),
  };
}
