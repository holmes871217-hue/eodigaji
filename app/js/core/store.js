// 앱의 상태(설정값)를 보관하고 폰 안(localStorage)에 저장한다.
import { nextSaturday, todayISO, isValidISO } from './dates.js';
import { CITIES } from './geo.js';

const KEY = 'eodigaji.v1';

export const TIME_OPTIONS = [
  { v: 30, label: '30분' },
  { v: 60, label: '1시간' },
  { v: 120, label: '2시간' },
  { v: 180, label: '3시간' },
  { v: 9999, label: '전국' },
];

export const NIGHT_OPTIONS = [
  { v: 0, label: '당일치기' },
  { v: 1, label: '1박' },
  { v: 2, label: '2박' },
  { v: 3, label: '3박 이상' },
];

/** 기간에 따른 기본 이동시간: 당일 2시간, 1박 3시간, 2박 이상 전국 */
export function defaultMaxMin(nights) {
  if (nights <= 0) return 120;
  if (nights === 1) return 180;
  return 9999;
}

let seq = 0;
export function newId() {
  seq += 1;
  return `m${Date.now().toString(36)}${seq}`;
}

function defaults() {
  const seoul = CITIES[0];
  return {
    profile: {
      // 처음 실행하면 예시로 '나 + 아이' 한 명이 들어 있다. 마이페이지에서 바꾼다.
      members: [
        { id: newId(), label: '나', age: 38, gender: 'm', weight: 1 },
        { id: newId(), label: '아이', age: 7, gender: 'f', weight: 3 },
      ],
      mode: 'hot', // 'hot' 핫플레이스 | 'calm' 여유로운 곳
      date: nextSaturday(),
      nights: 0,
      origin: { type: 'city', name: seoul.name, lat: seoul.lat, lng: seoul.lng },
    },
    ui: {
      tab: 'home', // home | events | deals | my
      maxMin: 120,
      scope: 'all', // near(가까운 소소한 곳) | all(전체) | big(큰 나들이)
      view: 'list', // list | map
      evType: 'all',
      sheet: null,
      hint: true,
      geoMsg: '',
      pick: null, // 마이페이지 지도에서 아직 확정하지 않은 가운데 좌표 { lat, lng }
      canInstall: false, // 브라우저가 설치 창을 띄울 준비가 됐는지
      installed: false, // 이미 홈 화면 아이콘으로 열었는지
    },
  };
}

export function loadState() {
  const state = defaults();
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && saved.profile && Array.isArray(saved.profile.members) && saved.profile.members.length) {
      Object.assign(state.profile, saved.profile);
      if (typeof saved.maxMin === 'number') state.ui.maxMin = saved.maxMin;
      if (saved.hint === false) state.ui.hint = false;
      if (['near', 'all', 'big'].includes(saved.scope)) state.ui.scope = saved.scope;
    }
  } catch (e) {
    // 저장소를 못 쓰는 환경(시크릿 모드 등)에서는 기본값으로 시작
  }
  // 저장된 날짜가 지났으면 다가오는 토요일로 바꾼다.
  if (!isValidISO(state.profile.date) || state.profile.date < todayISO()) {
    state.profile.date = nextSaturday();
  }
  return state;
}

export function saveState(state) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ profile: state.profile, maxMin: state.ui.maxMin, hint: state.ui.hint, scope: state.ui.scope })
    );
  } catch (e) {
    // 저장 실패는 무시 (앱은 계속 동작)
  }
}
