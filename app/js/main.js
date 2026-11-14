// 앱의 시작점: 상태를 읽고 → 계산하고 → 화면을 그리고 → 누르는 동작을 처리한다.
import { PLACES } from './data/places.js';
import { getEvents } from './data/events.js';
import { loadState, saveState, defaultMaxMin, newId } from './core/store.js';
import { rankPlaces, eventsForTrip, upcomingEvents } from './core/scoring.js';
import { CITIES } from './core/geo.js';
import { nearestLabel } from './core/locate.js';
import { isValidISO, todayISO } from './core/dates.js';
import { tripRange } from './ui/util.js';
import { renderHome } from './ui/home.js';
import { renderEvents } from './ui/events.js';
import { renderDeals } from './ui/deals.js';
import { renderMy } from './ui/mypage.js';
import { renderSheet } from './ui/sheet.js';
import { mountMap, mountPicker, unmountMaps, resetMapView, fitMapAll, panPicker, mapWidthKm } from './ui/map.js';

const root = document.getElementById('app');
const state = loadState();
const EVENTS = getEvents();
let installEvent = null; // 브라우저가 건네준 "설치 창 띄우기" 손잡이

const TABS = [
  { v: 'home', label: '추천', full: '추천', icon: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>' },
  { v: 'events', label: '축제', full: '축제·행사', icon: '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>' },
  { v: 'deals', label: '특가', full: '특가', icon: '<path d="M3.5 12.5V4.5h8l9 9-8 8z"/><circle cx="8" cy="9" r="1.5"/>' },
  { v: 'my', label: '마이', full: '마이페이지', icon: '<circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6"/>' },
];

/** 현재 설정으로 추천 결과를 계산한다. */
function compute() {
  const p = state.profile;
  const { start, end } = tripRange(p);
  const tripEvents = eventsForTrip(EVENTS, start, end, p.origin);
  const upcoming = upcomingEvents(EVENTS, end, p.origin);
  const ranked = rankPlaces(PLACES, p, tripEvents, state.ui.maxMin, state.ui.scope);
  // 상세 창은 이동시간 필터와 상관없이 열 수 있어야 해서 전체 순위도 계산해 둔다.
  const rankedAll = state.ui.maxMin >= 9999 && state.ui.scope === 'all' ? ranked : rankPlaces(PLACES, p, tripEvents, 9999, 'all');
  return { tripEvents, upcoming, ranked, rankedAll };
}

function render() {
  const c = compute();
  const tab = state.ui.tab;
  const view =
    tab === 'events' ? renderEvents(state, c)
    : tab === 'deals' ? renderDeals()
    : tab === 'my' ? renderMy(state)
    : renderHome(state, c);

  unmountMaps();
  root.innerHTML = `
    <header class="top">
      <div class="brand"><b>어디가지</b><span>아빠 나들이 추천</span></div>
      <span class="pill-sample" title="실제 데이터 연결 전입니다">연습용 데이터</span>
    </header>
    <main class="view" id="view" tabindex="-1">${view}</main>
    ${renderSheet(state, c)}
    <nav class="tabbar" aria-label="화면 이동">
      ${TABS.map(
        (t) => `
        <button type="button" class="tab ${t.v === tab ? 'is-on' : ''}" data-action="tab" data-v="${t.v}" aria-label="${t.full}" ${t.v === tab ? 'aria-current="page"' : ''}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${t.icon}</svg>
          <span>${t.label}</span>
        </button>`
      ).join('')}
    </nav>`;

  document.body.classList.toggle('has-sheet', Boolean(state.ui.sheet));

  if (tab === 'home' && state.ui.view === 'map') {
    const el = document.getElementById('map');
    if (el) {
      mountMap(el, {
        origin: state.profile.origin,
        rows: c.ranked.slice(0, 20),
        onPick: (id) => update(() => { state.ui.sheet = { type: 'place', id }; }, { persist: false }),
      });
    }
  }

  if (tab === 'my') {
    const el = document.getElementById('pick-map');
    if (el) {
      const center = state.ui.pick || state.profile.origin;
      const label = document.getElementById('pick-label');
      if (label && state.ui.pick) label.textContent = nearestLabel(state.ui.pick);
      mountPicker(el, {
        center,
        // 지도를 움직일 때는 화면 전체를 다시 그리지 않고 핀 위치 글자만 바꾼다.
        onMove: (pos) => {
          state.ui.pick = pos;
          const l = document.getElementById('pick-label');
          if (l) l.textContent = nearestLabel(pos);
        },
      });
    }
  }
}

function update(fn, { keepScroll = true, persist = true } = {}) {
  const y = window.scrollY;
  fn();
  if (persist) saveState(state);
  render();
  window.scrollTo(0, keepScroll ? y : 0);
}

function member(id) {
  return state.profile.members.find((m) => m.id === id);
}

function useGps() {
  if (!('geolocation' in navigator)) {
    update(() => { state.ui.geoMsg = '이 기기에서는 현재 위치를 쓸 수 없어요.'; });
    return;
  }
  update(() => { state.ui.geoMsg = '위치를 찾는 중…'; }, { persist: false });
  navigator.geolocation.getCurrentPosition(
    (pos) => update(() => {
      const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      state.profile.origin = { type: 'gps', name: `현재 위치 (${nearestLabel(here)})`, ...here };
      state.ui.pick = null;
      state.ui.geoMsg = '';
    }),
    () => update(() => { state.ui.geoMsg = '위치를 가져오지 못했어요. 위치 권한을 허용하거나 아래 지도에서 골라 주세요.'; }),
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
  );
}

// ── 누르는 동작 ─────────────────────────────────────────────
root.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-action]');
  if (!el || !root.contains(el)) return;
  const { action, v, id } = el.dataset;

  switch (action) {
    case 'tab':
      update(() => { state.ui.tab = v; state.ui.sheet = null; state.ui.pick = null; }, { keepScroll: false });
      break;
    case 'mode':
      update(() => { state.profile.mode = v === 'calm' ? 'calm' : 'hot'; });
      break;
    case 'maxmin':
      update(() => { state.ui.maxMin = Number(v); });
      break;
    case 'scope':
      update(() => { state.ui.scope = ['near', 'all', 'big'].includes(v) ? v : 'all'; });
      break;
    case 'view':
      update(() => { state.ui.view = v === 'map' ? 'map' : 'list'; });
      break;
    case 'map-reset':
      resetMapView();
      break;
    case 'map-fit':
      fitMapAll();
      break;
    case 'evtype':
      update(() => { state.ui.evType = v; });
      break;
    case 'open-place':
      update(() => { state.ui.sheet = { type: 'place', id }; }, { persist: false });
      break;
    case 'open-event':
      update(() => { state.ui.sheet = { type: 'event', id }; }, { persist: false });
      break;
    case 'close-sheet':
      update(() => { state.ui.sheet = null; }, { persist: false });
      break;
    case 'dismiss-hint':
      update(() => { state.ui.hint = false; });
      break;
    case 'commit-pick':
      update(() => {
        const pos = state.ui.pick || { lat: state.profile.origin.lat, lng: state.profile.origin.lng };
        state.profile.origin = { type: 'map', name: nearestLabel(pos), lat: pos.lat, lng: pos.lng };
        state.ui.pick = null;
        state.ui.geoMsg = '';
      });
      break;
    case 'add-member':
      update(() => {
        state.profile.members.push({ id: newId(), label: '', age: 35, gender: 'f', weight: 1 });
        state.ui.hint = false;
      });
      break;
    case 'remove-member':
      update(() => {
        if (state.profile.members.length > 1) {
          state.profile.members = state.profile.members.filter((m) => m.id !== id);
        }
      });
      break;
    case 'gender':
      update(() => { const m = member(id); if (m) m.gender = v === 'f' ? 'f' : 'm'; state.ui.hint = false; });
      break;
    case 'weight':
      update(() => { const m = member(id); if (m) m.weight = Math.max(1, Math.min(5, Number(v) || 1)); state.ui.hint = false; });
      break;
    case 'nights':
      update(() => {
        state.profile.nights = Math.max(0, Math.min(3, Number(v) || 0));
        state.ui.maxMin = defaultMaxMin(state.profile.nights);
      });
      break;
    case 'use-gps':
      useGps();
      break;
    case 'install':
      // 브라우저가 준비해 둔 "홈 화면에 설치" 창을 띄운다.
      if (installEvent) {
        installEvent.prompt();
        installEvent = null;
        update(() => { state.ui.canInstall = false; }, { persist: false });
      }
      break;
    default:
      break;
  }
});

// ── 입력값 바꾸기 (입력을 마쳤을 때 반영) ───────────────────
root.addEventListener('change', (ev) => {
  const el = ev.target.closest('[data-field]');
  if (!el) return;
  const { field, id } = el.dataset;

  if (field === 'age') {
    const n = Math.round(Number(el.value));
    update(() => {
      const m = member(id);
      if (m && el.value !== '' && Number.isFinite(n)) m.age = Math.max(0, Math.min(110, n));
      state.ui.hint = false;
    });
  } else if (field === 'label') {
    update(() => { const m = member(id); if (m) m.label = el.value.trim().slice(0, 10); });
  } else if (field === 'date') {
    update(() => {
      if (isValidISO(el.value) && el.value >= todayISO()) state.profile.date = el.value;
    });
  } else if (field === 'jump') {
    // 지도만 그 지역으로 옮긴다(검색 위치는 "이 위치로 정하기"를 눌러야 바뀜).
    const city = CITIES.find((c) => c.name === el.value);
    if (city) panPicker(city.lat, city.lng);
  }
});

// 상세 창이 열려 있을 때 Esc 키로 닫기
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && state.ui.sheet) {
    update(() => { state.ui.sheet = null; }, { persist: false });
  }
});

// 검수용: 지도 가로에 보이는 실제 거리(km)를 확인할 수 있게 열어 둔다.
window.__mapWidthKm = mapWidthKm;

// ── 웹앱(PWA) 설치 ──────────────────────────────────────────
// 브라우저가 "이 앱은 설치할 수 있다"고 알려 주면 마이페이지에 설치 버튼을 보여 준다.
window.addEventListener('beforeinstallprompt', (ev) => {
  ev.preventDefault();
  installEvent = ev;
  state.ui.canInstall = true;
  if (state.ui.tab === 'my' && !state.ui.sheet) update(() => {}, { persist: false });
});
window.addEventListener('appinstalled', () => {
  installEvent = null;
  update(() => { state.ui.canInstall = false; }, { persist: false });
});

// 이미 홈 화면 아이콘으로 열었는지(설치된 상태인지)
state.ui.installed =
  (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;

// 서비스 워커 등록: 인터넷이 끊겨도 앱이 열리게 한다.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // 등록에 실패해도 앱은 평소처럼 동작한다(오프라인에서만 안 열림).
    });
  });
}

render();
