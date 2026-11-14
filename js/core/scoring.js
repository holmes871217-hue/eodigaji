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
  return place.interest[segKey(m.gender, m.age)] ?? 0;
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
  return Math.round((trend - 1) * 100);
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
  if (pct >= 10) out.push({ kind: 'up', text: `검색 +${pct}%` });
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
export function rankPlaces(places, profile, tripEvents, maxMin) {
  const { members, mode, origin } = profile;
  const rows = [];

  for (const place of places) {
    const { km, min } = driveEstimate(origin, place);
    if (min > maxMin) continue;

    const fam = familyInterest(place, members);
    // 추세를 -1(크게 하락) ~ +1(크게 상승) 사이 값으로 바꾼다.
    const tu = clamp((place.trend - 1) / 0.5, -1, 1);

    let raw;
    if (mode === 'calm') {
      // 여유로운 곳: 검증된 누적 인기 + 가족 관심도, 최근 뜸해질수록·덜 붐빌수록 위로
      raw = (0.55 * fam.value + 0.45 * place.yearly) * (1 - 0.5 * tu) * (1 - place.crowd / 250);
    } else {
      // 핫플레이스: 가족 관심도가 높고 최근 뜨는 곳일수록 위로
      raw = fam.value * (1 + 0.5 * tu);
    }

    // 가까울수록 약간 유리 (최대 12%)
    raw *= 1 - 0.12 * Math.min(1, min / 240);

    // 가는 날 20km 안에서 행사가 열리면 덧점 8%
    const eventNear = tripEvents.find((e) => haversineKm(e, place) <= 20) || null;
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
