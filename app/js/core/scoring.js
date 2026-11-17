// 추천 점수 계산(스코어링 알고리즘). 기획서 3번 "추천이 계산되는 방식"을 그대로 코드로 옮긴 파일.
//
// 장소 하나가 갖는 데이터:
//   interest : { m6: 0~100, f1: 0~100, ... }  성별·연령대별 검색 인기
//   kid      : { toddler, lower, upper }       아이 단계별 적합도 0~1
//   trend    : 최근 4주 검색량 ÷ 지난 1년 평균 (1보다 크면 뜨는 중)
//   yearly   : 지난 1년 누적 인기 0~100
//   crowd    : 혼잡 예측 0~100
//
// "origin"은 주요 검색 위치(집이 아니어도 됨)를 뜻한다.

import { segKey, kidStage, memberLabel } from './segments.js';
import { haversineKm, driveEstimate } from './geo.js';
import { addDays } from './dates.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** 가족 한 명이 이 장소에 갖는 관심도 0~100 */
export function memberScore(place, m) {
  const stage = kidStage(m.age);
  if (stage) return Math.round(((place.kid && place.kid[stage]) ?? 0.5) * 100);
  const key = segKey(m.gender, m.age);
  // 같은 나이·성별의 검색 인기에는 영유아를 키우는 부모(아이 때문에 어린이 장소를 찾는 사람)가 섞여 실제 또래 취향이 희석된다.
  // 그래서 "아이 없는 또래의 인기"를 따로 재서(interestFree: 장소별 직접 측정, freeFactor: 분류별 평균 배율) 어른 점수로 쓴다.
  const free = place.interestFree?.[key];
  if (typeof free === 'number') return free;
  const base = place.interest[key] ?? 0;
  const f = place.freeFactor?.[key];
  return f ? clamp(Math.round(base * f), 0, 100) : base;
}

/** 우리 가족 관심도 = 각자의 관심도를 가중치만큼 섞은 평균(가중 평균) */
export function familyInterest(place, members) {
  let sum = 0;
  let wsum = 0;
  const parts = members.map((m, index) => {
    const score = memberScore(place, m);
    const weight = clamp(Number(m.weight) || 1, 1, 5);
    sum += score * weight;
    wsum += weight;
    return { member: m, index, score, weight };
  });
  return { value: wsum ? sum / wsum : 0, parts };
}

/** 장소 성격 분류: hot(뜨는 중) / calm(인기 있지만 요즘 한산) / steady(꾸준) */
export function classify(place) {
  if (place.trend >= 1.12) return 'hot';
  if (place.trend <= 0.92 && place.yearly >= 60) return 'calm';
  return 'steady';
}

export const KIND_LABEL = { hot: '핫플', calm: '여유', steady: '꾸준' };

export function crowdLabel(crowd) {
  if (crowd < 40) return '한산';
  if (crowd < 65) return '보통';
  return '붐빔';
}

export function trendPct(trend) {
  // 검색량이 적은 곳은 최근 4주 ÷ 1년 평균이 크게 튀어(+541% 등) 화면에서 과장돼 보이므로 표시는 최대 +100%로 자른다(점수 계산은 따로 ±50%로 자름).
  return Math.min(100, Math.round((trend - 1) * 100));
}

function withDrive(e, origin) {
  const { km, min } = driveEstimate(origin, e);
  return { ...e, km, min };
}

/** 여행 기간에 걸치는 행사만 골라 검색 위치에서의 거리·시간을 붙인다. */
export function eventsForTrip(events, tripStart, tripEnd, origin) {
  return events
    .filter((e) => e.start <= tripEnd && e.end >= tripStart)
    .map((e) => withDrive(e, origin))
    .sort((a, b) => a.min - b.min);
}

/**
 * 가는 날 이 장소 20km 안에서 열리는 축제·공연: 가까운 순 최대 5개.
 * 상세 창의 "가는 날 근처 축제·공연" 목록과 추천 카드의 "근처 …" 표시가 같은 결과를 쓰도록 한 곳에서 만든다.
 * 추천 카드는 이 목록의 맨 앞(가장 가까운 1개)을 대표로 보여 준다.
 * @returns {Array<{e: object, km: number}>}
 */
export function nearbyEvents(place, tripEvents) {
  return tripEvents
    .map((e) => ({ e, km: haversineKm(e, place) }))
    .filter((x) => x.km <= 20)
    .sort((a, b) => a.km - b.km || (a.e.start < b.e.start ? -1 : a.e.start > b.e.start ? 1 : 0))
    .slice(0, 5);
}

/** 여행이 끝난 뒤 30일 안에 시작하는 행사 */
export function upcomingEvents(events, tripEnd, origin, days = 30) {
  const limitISO = addDays(tripEnd, days);
  return events
    .filter((e) => e.start > tripEnd && e.start <= limitISO)
    .map((e) => withDrive(e, origin))
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.min - b.min));
}

function reasonsFor(row, mode) {
  const out = [];
  const { place, parts, eventNear } = row;

  // 1) 가중치가 가장 큰 사람 기준 설명
  const lead = [...parts].sort((a, b) => b.weight - a.weight || b.score - a.score)[0];
  if (lead) {
    const name = memberLabel(lead.member, lead.index);
    const stage = kidStage(lead.member.age);
    if (stage) {
      const fit = lead.score >= 80 ? '에게 딱' : lead.score >= 55 ? '에게 무난' : '에겐 아쉬움';
      out.push({ kind: lead.score >= 55 ? 'fit' : 'meh', text: `${name}${fit}` });
    } else {
      out.push({ kind: lead.score >= 60 ? 'fit' : 'meh', text: `${name} 또래 인기 ${lead.score}점` });
    }
  }

  // 2) 추세
  const pct = trendPct(place.trend);
  if (pct >= 10) out.push({ kind: 'up', text: pct >= 100 ? '검색 +100% 이상' : `검색 +${pct}%` });
  else if (pct <= -8) out.push({ kind: 'down', text: `검색 ${pct}% · ${crowdLabel(place.crowd)}` });
  else if (mode === 'calm') out.push({ kind: 'down', text: `혼잡 ${crowdLabel(place.crowd)}` });

  // 3) 근처 행사
  if (eventNear) out.push({ kind: 'event', text: `근처 ${eventNear.title}` });

  return out;
}

/**
 * 장소 순위 매기기.
 * @param places   장소 목록
 * @param profile  마이페이지 설정 { members, mode, origin(주요 검색 위치) }
 * @param tripEvents 여행 기간에 열리는 행사 (근처 행사 덧점용)
 * @param maxMin   이동시간 상한(분)
 */
/** 동행인 중에 아이(12세 이하)가 있는지 */
export function hasChild(members) {
  return members.some((m) => kidStage(m.age));
}

/**
 * 아이 전용 장소인지: 분류가 "키즈"(키즈카페·실내놀이터·방방 등)이거나 이름에 키즈·유아·어린이(어린이대공원은 제외)·놀이터 등이 들어간 곳.
 * 아이가 없는 가족에게는 또래 인기가 높아도 추천에서 뺀다(2026-11-16 사용자 요청).
 * 동물원·테마파크·박물관처럼 어른도 가는 곳은 이름에 어린이가 없으면 뺀 대상이 아니다.
 */
const KIDS_NAME = /키즈|유아|베이비|꼬마|어린이(?!\s*대공원)|놀이터/;
export function isKidsPlace(place) {
  return place.cat === 'kids' || KIDS_NAME.test(place.name || '');
}

/**
 * 아이 전용 행사인지: 공연(KOPIS)은 수집할 때 "아동 공연"만 골라 받으므로 전부 해당하고,
 * 그 밖의 행사는 제목에 키즈·유아·어린이(어린이대공원은 제외)·아동·꼬마·베이비·인형극·동화·그림책·가족극·서울상상나라가 들어간 것.
 * "어른이를 위한 그림책"처럼 어른 대상 행사는 뺀다. 아이가 없는 가족에게는 축제·공연 목록과 "근처 축제" 표시에서 뺀다(2026-11-16 사용자 요청).
 */
const KIDS_EVENT = /키즈|유아|어린이(?!\s*대공원)|아동|꼬마|베이비|인형극|동화|그림책|가족극|상상나라/;
export function isKidsEvent(e) {
  if (e.source === 'kopis') return true;
  const t = e.title || '';
  return KIDS_EVENT.test(t) && !/어른이/.test(t);
}

export const NEAR_MAX = 45; // "가까운 소소한 곳"에서 보여줄 최대 이동시간(분)
const SMALL_BOOST = 1.35; // 작은 곳은 검색량 자체가 적으니, 같은 규모끼리 비교되도록 보정

/**
 * 가까움이 순위에 미치는 힘(0.1~1). 사용자가 고른 이동시간 한도가 길수록 작아진다.
 * 한도를 길게 잡았다는 것은 "멀어도 괜찮으니 우리 가족 또래에게 인기 높은 곳을 가겠다"는 뜻이라서,
 * 그럴수록 거리 대신 또래 인기(가족 관심도)가 순위를 정하게 한다.
 * 2026-11-16: "이동시간에 따른 덧점이 너무 낮다, 크게 다르게" 요청으로 곡선을 훨씬 가파르게 바꿨다(30/한도 의 1.4제곱).
 *   한도 30분 이하 1.0 · 45분 0.57 · 60분 0.38 · 120분 0.14 · 180분 0.08 · 전국(300분으로 침) 0.03
 */
export function nearWeight(reachMin) {
  return clamp((30 / Math.max(30, reachMin)) ** 1.4, 0.03, 1);
}
/**
 * 또래 인기의 덧점 배율. 이동시간 한도가 길수록(= 가까움의 힘이 작을수록) 가족 관심도가 높은 곳이 훨씬 더 큰 덧점을 받는다.
 * 관심도 60점을 기준(×1)으로, 한도 30분 이하는 지수 1, 120분은 지수 약 2.7, 전국은 약 2.9(2026-11-16: 바닥을 0에서 1로 올림).
 * 예) 관심도 90점 vs 45점인 두 곳: 30분 한도에서도 그 비율(2배)이 한 번 더 붙고(총 4배), 전국에서는 2.9제곱 ≈ 7.5배가 더 붙는다.
 */
export function peerBonus(famValue, reachMin) {
  // 지수 1을 바닥으로 깔아, 이동시간 한도가 짧아도 가족 관심도(만족도)가 높은 곳이 분명히 위로 오게 한다(2026-11-16 사용자 지시).
  // (이전에는 한도 30분 이하에서 지수가 0이라 가족 관심도가 순위에 한 번만 반영됐다.)
  const exp = 1 + 2 * (1 - nearWeight(reachMin));
  return clamp(famValue / 60, 0.2, 2) ** exp;
}
/** 거리 보정 배율: 0분이면 1+amp×w, 한도에 닿으면 1−amp×w. amp 는 규모별 최대 영향(작은 곳 0.45, 큰 곳 0.15) */
function nearFactor(min, reachMin, amp) {
  const p = clamp(1 - (2 * min) / Math.max(1, reachMin), -1, 1);
  return 1 + amp * nearWeight(reachMin) * p;
}

export function rankPlaces(places, profile, tripEvents, maxMin, scope = 'all', { hideKids = true } = {}) {
  const { members, mode, origin } = profile;
  const rows = [];
  const dropKids = hideKids && !hasChild(members); // 아이가 없는 가족에게는 아이 전용 장소를 추천하지 않는다

  for (const place of places) {
    if (dropKids && isKidsPlace(place)) continue;
    const small = place.scale === 'small';
    if (scope === 'near' && !small) continue;
    if (scope === 'big' && small) continue;
    const { km, min } = driveEstimate(origin, place);
    // 보여줄 범위: 사용자가 고른 이동시간 그대로. (예전에는 "가까운 소소한 곳"을 45분에서 잘라 1·2·3시간이 거의 같은 결과였다 — 2026-11-16 수정)
    const limit = maxMin;
    if (min > limit) continue;
    // 가까움의 힘은 "보여줄 범위"가 아니라 사용자가 고른 이동시간으로 정한다.
    // (예전에는 "가까운 소소한 곳"에서 범위가 45분으로 잘려, 이동시간을 3시간으로 늘려도 가까운 곳 덧점이 그대로여서 같은 곳만 위에 올라왔다.)
    const reach = Math.min(maxMin, 300); // "전국"(9999분)은 300분으로 쳐서 계산

    const fam = familyInterest(place, members);
    // 추세를 -1(크게 하락) ~ +1(크게 상승) 사이 값으로 바꾼다.
    // 검색량이 적은 곳(1년 인기 낮음)은 "최근 4주 ÷ 1년 평균"이 조금만 움직여도 크게 튀어서(예: 방탈출 +365%) 믿기 어렵다.
    // 그래서 1년 인기가 60점 미만이면 추세가 점수에 미치는 한도를 그만큼 줄인다(최소 30%). 인기 높은 곳은 그대로 ±1.
    const trendTrust = clamp((place.yearly || 0) / 60, 0.3, 1);
    const tu = clamp((place.trend - 1) / 0.5, -trendTrust, trendTrust);

    // 순위의 뼈대는 "총 검색량"이다: 지난 1년 누적 인기(yearly, 0~100)가 높은 곳이 위로 온다.
    // 최근 증감(추세)은 그 위에 "핫플이냐 여유로운 곳이냐"를 가르는 보조 요소로만 쓴다(최대 ±25%).
    //  - 핫플 모드: 요즘 뜨는 곳(추세 ↑)이 같은 검색량이면 위로
    //  - 여유 모드: 요즘 뜸해진 곳(추세 ↓)·덜 붐비는 곳이 같은 검색량이면 위로
    // (2026-11-16 사용자 지시: "실제 총 검색량을 기준으로 하고, 증감이 핫플인지 여유로운 곳인지를 정한다")
    const volume = clamp((place.yearly || 0) / 100, 0, 1);
    let raw;
    if (mode === 'calm') {
      raw = fam.value * (0.3 + 1.4 * volume) * (1 - 0.25 * tu) * (1 - place.crowd / 250);
    } else {
      raw = fam.value * (0.3 + 1.4 * volume) * (1 + 0.25 * tu);
    }

    // 가까울수록 유리하되, 이동시간 한도를 길게 고를수록 그 힘이 줄어든다(nearWeight 참고).
    // 작은 곳은 "잠깐 들르는 곳"이라 큰 곳보다 거리 영향이 크다(최대 ±70%, 큰 곳 ±25%).
    // 작은 곳의 규모 보정(SMALL_BOOST)도 가까움과 같이 움직인다: 잠깐 들르는 가까운 곳끼리 비교할 때만 크게 주고,
    // 멀리 갈 때는 큰 나들이 장소와 같은 눈높이(1.0에 가깝게)로 비교한다. 그래야 어림 점수인 작은 곳이 진짜 인기 많은 큰 곳을 밀어내지 않는다.
    const boost = 1 + (SMALL_BOOST - 1) * nearWeight(reach);
    raw *= small ? boost * nearFactor(min, reach, 0.7) : nearFactor(min, reach, 0.25);
    // 이동시간을 길게 고를수록 또래 인기가 높은 곳에 큰 덧점(peerBonus 참고)
    raw *= peerBonus(fam.value, reach);

    // 이동시간을 길게 골랐다면 "한도의 절반 가까이 쓰는" 먼 곳의 인기 장소에 덧점(전체·큰 나들이 탭): 1·2·3시간의 결과가 눈에 띄게 달라지게 한다.
    // 한도에 대한 이동시간 비율 x 가 0.4를 넘으면 늘어나 0.8에서 최대(+35%), 가까움의 힘(nearWeight)이 큰 짧은 한도에서는 덜 준다.
    if (scope !== 'near') {
      const x = clamp(min / Math.max(1, reach), 0, 1);
      raw *= 1 + 0.35 * (1 - nearWeight(reach)) * clamp((x - 0.4) / 0.4, 0, 1);
    }

    // 카카오로 채운 동네 장소는 직접 고른 곳보다 아래에 오도록 낮춘다(관광공사 등록 곳은 덜 낮춤).
    // 네이버 검색량이 있는 곳은 실제 인기라 덜 낮춘다(0.9).
    if (place.spot) raw *= place.naver ? 0.9 : place.kto ? 0.75 : 0.5;
    // 핫플 분류 보정(A 항목, 작게): 검색량이 낮아 순위 아래에 묻히는 숨은 명소·신규 발견을 조금 끌어올리고, 모드에 맞는 분류에 소폭 가산한다.
    // 근거가 부족한 분류(hotQ=0)는 반영하지 않는다. 총 검색량 뼈대는 그대로 두고 최대 +20%만 건드린다.
    if (place.hot && place.hotQ !== 0) {
      raw *= place.hot === 'h' ? 1.2 : place.hot === 'n' ? 1.1 : place.hot === 'r' && mode !== 'calm' ? 1.08 : place.hot === 'f' && mode === 'calm' ? 1.08 : 1;
    }

    // 가는 날 20km 안에서 행사가 열리면 덧점 8%
    const eventNear = nearbyEvents(place, tripEvents)[0]?.e || null; // 상세 창 목록의 1번과 같은 행사
    if (eventNear) raw *= 1.08;

    rows.push({ place, km, min, fam: fam.value, parts: fam.parts, kind: classify(place), raw, eventNear });
  }

  rows.sort((a, b) => b.raw - a.raw);
  const top = rows.length ? rows[0].raw || 1 : 1;
  rows.forEach((r, i) => {
    r.rank = i + 1;
    r.rel = r.raw / top;
    r.reasons = reasonsFor(r, mode);
  });
  return rows;
}
