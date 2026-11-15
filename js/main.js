// 앱의 시작점: 상태를 읽고 → 계산하고 → 화면을 그리고 → 누르는 동작을 처리한다.
import { PLACES, CATEGORIES } from './data/places.js';
import { getEvents } from './data/events.js';
import { loadLive } from './data/live.js';
import { loadState, saveState, defaultMaxMin, newId } from './core/store.js';
import { rankPlaces, eventsForTrip, upcomingEvents } from './core/scoring.js';
import { CITIES } from './core/geo.js';
import { nearestLabel } from './core/locate.js';
import { searchLocation } from './core/search.js';
import { findShops, SHOP_KINDS } from './core/nearby.js';
import { findGooglePhotos } from './core/gphotos.js';
import { photosOf } from './data/photos.js';
import { isValidISO, todayISO } from './core/dates.js';
import { tripRange, rangeText } from './ui/util.js';
import { favKey, toggleFav, moveFav, autoRoute, FAV_MAX } from './core/favs.js';
import { renderFavs } from './ui/favs.js';
import { attachSortable } from './ui/sortable.js';
import { renderHome } from './ui/home.js';
import { renderEvents } from './ui/events.js';
import { renderDeals } from './ui/deals.js';
import { renderMy } from './ui/mypage.js';
import { renderSheet } from './ui/sheet.js';
import { mountRoute } from './ui/map.js';
import { mountMap, mountPicker, unmountMaps, resetMapView, fitMapAll, panPicker, mapWidthKm } from './ui/map.js';

const root = document.getElementById('app');
const state = loadState();
let EVENTS = getEvents();
let liveUpdatedAt = null; // 실제 데이터를 모은 시각 (없으면 연습용 데이터)
let installEvent = null; // 브라우저가 건네준 "설치 창 띄우기" 손잡이

const TABS = [
  { v: 'home', label: '추천', full: '추천', icon: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>' },
  { v: 'events', label: '축제', full: '축제·행사', icon: '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>' },
  { v: 'favs', label: '찜', full: '찜한 곳', icon: '<path d="M12 20.5s-7.5-4.6-7.5-10.3A4.4 4.4 0 0 1 12 7.4a4.4 4.400 0 0 1 7.500 2.800c0 5.700-7.500 10.300-7.500 10.300z"/>' },
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
  ensureShops();
  ensureGooglePhotos();
  const c = compute();
  const tab = state.ui.tab;
  const view =
    tab === 'events' ? renderEvents(state, c)
    : tab === 'favs' ? renderFavs(state, c)
    : tab === 'deals' ? renderDeals()
    : tab === 'my' ? renderMy(state)
    : renderHome(state, c);

  const sheetHtml = renderSheet(state, c);
  unmountMaps();
  root.innerHTML = `
    <header class="top">
      <div class="brand"><b>놀픽</b><span>아빠 나들이 추천</span></div>
      ${liveUpdatedAt
        ? `<span class="pill-sample is-live" title="네이버 검색·한국관광공사 데이터">${new Date(liveUpdatedAt).getMonth() + 1}/${new Date(liveUpdatedAt).getDate()} 기준 실제 데이터</span>`
        : '<span class="pill-sample" title="실제 데이터 연결 전입니다">연습용 데이터</span>'}
    </header>
    <main class="view" id="view" tabindex="-1">${view}</main>
    ${sheetHtml}
    <nav class="tabbar" aria-label="화면 이동">
      ${TABS.map(
        (t) => `
        <button type="button" class="tab ${t.v === tab ? 'is-on' : ''}" data-action="tab" data-v="${t.v}" aria-label="${t.full}" ${t.v === tab ? 'aria-current="page"' : ''}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${t.icon}</svg>
          <span>${t.label}</span>
          ${t.v === 'favs' ? `<span class="tab-count" data-fav-count ${state.favs.length ? '' : 'hidden'}>${state.favs.length}</span>` : ''}
        </button>`
      ).join('')}
    </nav>`;

  document.body.classList.toggle('has-sheet', Boolean(sheetHtml));
  watchCardPhotos();
  const slides = document.querySelector('[data-slides]');
  if (slides) syncSlides(slides);

  if (tab === 'home' && state.ui.view === 'map') {
    const el = document.getElementById('map');
    if (el) {
      mountMap(el, {
        origin: state.profile.origin,
        rows: c.ranked.slice(0, 20),
        onPick: (id) => openSheet({ type: 'place', id }),
      });
    }
  }

  if (tab === 'favs') {
    const el = document.getElementById('fav-map');
    if (el) mountRoute(el, { origin: state.profile.origin, points: state.favs });
    const list = document.getElementById('fav-list');
    if (list) attachSortable(list, { onReorder: (from, to) => update(() => { moveFav(state, from, to); }) });
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

// ── 상세 창과 뒤로 가기 ─────────────────────────────────────
// 상세 창을 열 때마다 브라우저의 방문 기록(history)에 한 칸을 쌓는다.
// 그래서 안드로이드 뒤로 가기를 누르면 앱이 꺼지지 않고, 방금 연 창만 닫힌다.
// 장소 창에서 근처 축제를 열었다면 뒤로 가기 한 번에 장소 창으로 돌아온다.
let sheets = []; // 열려 있는 상세 창을 연 순서대로 [{ type, id }]
const sheetPos = []; // 창마다 보던 위치 { top: 세로, left: 사진 순서 }

function syncSheets() {
  state.ui.sheet = sheets[sheets.length - 1] || null;
  state.ui.sheetDepth = sheets.length;
}

function rememberSheetPos() {
  if (!sheets.length) return;
  sheetPos[sheets.length - 1] = {
    top: document.querySelector('.sheet')?.scrollTop || 0,
    left: document.querySelector('[data-slides]')?.scrollLeft || 0,
  };
}

function restoreSheetPos() {
  const pos = sheetPos[sheets.length - 1];
  if (!pos) return;
  const sheet = document.querySelector('.sheet');
  if (sheet) sheet.scrollTop = pos.top;
  watchCardPhotos();
  const slides = document.querySelector('[data-slides]');
  if (slides) { slides.scrollLeft = pos.left; syncSlides(slides); }
}

function openSheet(sheet) {
  rememberSheetPos();
  sheets = [...sheets, sheet];
  sheetPos.length = sheets.length - 1;
  try { history.pushState({ sheets }, ''); } catch (e) { /* 기록을 못 쓰는 환경에서도 창은 열린다 */ }
  update(syncSheets, { persist: false });
}

/** 닫기 버튼·바깥 누르기·Esc 는 모두 "뒤로 가기 한 번"과 같다. */
function closeSheet() {
  if (!sheets.length) return;
  if (Array.isArray(history.state?.sheets) && history.state.sheets.length === sheets.length) {
    history.back(); // 실제로 닫는 일은 아래 popstate 에서 한다
  } else {
    sheets = sheets.slice(0, -1);
    update(syncSheets, { persist: false });
    restoreSheetPos();
  }
}

window.addEventListener('popstate', (ev) => {
  const next = Array.isArray(ev.state?.sheets) ? ev.state.sheets : [];
  const goingBack = next.length < sheets.length;
  if (!goingBack) rememberSheetPos();
  sheets = next;
  update(syncSheets, { persist: false });
  if (goingBack) restoreSheetPos();
});

// ── 근처 맛집·카페 ──────────────────────────────────────────
// 맛집·카페 창이 맨 위에 있는데 아직 찾아 둔 결과가 없으면 찾기 시작한다.
// 결과는 앱을 켜 둔 동안만 기억한다(state.ui 는 폰에 저장하지 않는다).
function ensureShops() {
  const s = state.ui.sheet;
  if (!s || s.type !== 'shops' || !SHOP_KINDS[s.kind]) return;
  if (!state.ui.shops) state.ui.shops = {};
  const key = `${s.id}|${s.kind}`;
  if (state.ui.shops[key]) return;
  const place = PLACES.find((p) => p.id === s.id);
  if (!place) return; // 장소 자료를 아직 못 받았으면 다음에 그릴 때 다시 본다
  state.ui.shops[key] = { status: 'loading' };
  findShops(place, s.kind)
    .then((r) => { state.ui.shops[key] = { status: 'done', ...r }; })
    .catch(() => { state.ui.shops[key] = { status: 'error' }; })
    .then(() => {
      const top = state.ui.sheet;
      if (top && top.type === 'shops' && `${top.id}|${top.kind}` === key) update(() => {}, { persist: false });
    });
}

// ── 구글 사진(실시간) ───────────────────────────────────────
// 장소 상세 창이 열렸는데 사진이 한 장 이하면 구글 지도 사진을 불러와 붙인다. 저장하지 않고 메모리에만 둔다.
function ensureGooglePhotos() {
  const s = state.ui.sheet;
  if (!s || s.type !== 'place') return;
  if (!state.ui.gphotos) state.ui.gphotos = {};
  if (state.ui.gphotos[s.id]) return;
  const place = PLACES.find((p) => p.id === s.id);
  if (!place || photosOf(s.id).length > 1) return;
  state.ui.gphotos[s.id] = { status: 'loading' };
  findGooglePhotos(place)
    .then((photos) => { state.ui.gphotos[s.id] = { status: 'done', photos }; })
    .catch(() => { state.ui.gphotos[s.id] = { status: 'error', photos: [] }; })
    .then(() => {
      const top = state.ui.sheet;
      if (top && top.type === 'place' && top.id === s.id && state.ui.gphotos[s.id].photos?.length) update(() => {}, { persist: false });
    });
}

// 추천 카드에 사진이 없으면, 카드가 화면에 보일 때 구글 지도 대표 사진 한 장을 불러와 끼워 넣는다(저장 안 함).
let cardPhotoIO = null;
function watchCardPhotos() {
  if (!('IntersectionObserver' in window)) return;
  if (!cardPhotoIO) {
    cardPhotoIO = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        const el = en.target;
        cardPhotoIO.unobserve(el);
        const place = PLACES.find((p) => p.id === el.dataset.gphoto);
        if (!place) continue;
        findGooglePhotos(place).then((list) => {
          if (!list[0] || !el.isConnected || el.querySelector('img')) return;
          const img = document.createElement('img');
          img.alt = '';
          img.decoding = 'async';
          img.src = list[0].src;
          img.onerror = () => img.remove();
          el.insertBefore(img, el.querySelector('.pcard-rank'));
        });
      }
    }, { rootMargin: '200px' });
  }
  document.querySelectorAll('[data-gphoto]').forEach((el) => cardPhotoIO.observe(el));
}

// ── 사진 넘겨 보기 ──────────────────────────────────────────
/** 지금 몇 번째 사진인지 숫자와 점을 맞춘다. */
function syncSlides(el) {
  const box = el.closest('.sheet-photo');
  if (!box) return;
  const total = el.children.length;
  const now = Math.min(total, Math.round(el.scrollLeft / Math.max(1, el.clientWidth)) + 1);
  const count = box.querySelector('[data-slide-count]');
  if (count) { count.hidden = total < 2; count.textContent = `${now} / ${total}`; }
  box.querySelectorAll('[data-action="slide"]').forEach((b) => {
    b.hidden = total < 2 || (b.dataset.v === '-1' ? now <= 1 : now >= total);
  });
}

// 사진을 옆으로 넘길 때(scroll 은 위로 전달되지 않아서 capture 로 받는다)
root.addEventListener('scroll', (ev) => {
  if (ev.target instanceof Element && ev.target.matches('[data-slides]')) syncSlides(ev.target);
}, true);

// 못 불러온 사진은 빼고 장수를 다시 센다
root.addEventListener('error', (ev) => {
  const img = ev.target;
  if (!(img instanceof HTMLImageElement) || !img.matches('[data-slides] img')) return;
  const el = img.parentElement;
  img.remove();
  syncSlides(el);
}, true);

// ── 찜 ──────────────────────────────────────────────────────
/** 찜에 담을 때 같이 적어 둘 이름·좌표. 자료를 못 찾으면 null */
function favSnapshot(type, id) {
  if (type === 'place') {
    const p = PLACES.find((x) => x.id === id);
    return p ? { name: p.name, lat: p.lat, lng: p.lng, sub: [p.region, CATEGORIES[p.cat]?.label].filter(Boolean).join(' · ') } : null;
  }
  if (type === 'event') {
    const e = EVENTS.find((x) => x.id === id);
    return e ? { name: e.title, lat: e.lat, lng: e.lng, sub: [rangeText(e.start, e.end), e.region].filter(Boolean).join(' · '), start: e.start, end: e.end } : null;
  }
  if (type === 'shop') {
    for (const [key, data] of Object.entries(state.ui.shops || {})) {
      const s = data.items?.find((x) => x.id === id);
      if (s) return { name: s.name, lat: s.lat, lng: s.lng, sub: [s.type, s.addr].filter(Boolean).join(' · '), addr: s.addr, nq: s.nq || s.name, gid: s.gid || '', kind: key.split('|')[1] };
    }
  }
  return null;
}

/** 아래 탭의 찜 숫자 */
function syncFavCount() {
  const el = document.querySelector('[data-fav-count]');
  if (!el) return;
  el.textContent = String(state.favs.length);
  el.hidden = !state.favs.length;
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
    case 'tab': {
      // 창이 열린 채 탭을 옮기면 쌓아 둔 방문 기록도 함께 되돌린다.
      const depth = sheets.length;
      sheets = [];
      update(() => { state.ui.tab = v; syncSheets(); state.ui.pick = null; state.ui.locResults = []; state.ui.locMsg = ''; }, { keepScroll: false });
      if (depth && Array.isArray(history.state?.sheets)) history.go(-depth);
      break;
    }
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
      openSheet({ type: 'place', id });
      break;
    case 'open-event':
      // 장소 상세 창의 "근처 축제·공연"도 여기로 온다. 탭은 그대로 두고 그 위에 행사 창을 연다.
      openSheet({ type: 'event', id });
      break;
    case 'close-sheet':
      closeSheet();
      break;
    case 'fav': {
      // 하트: 찜에 넣거나 뺀다.
      const type = el.dataset.type;
      const key = favKey(type, id);
      const had = state.favs.some((f) => f.key === key);
      const snap = had ? {} : favSnapshot(type, id);
      if (!snap) break;
      const result = toggleFav(state, { key, type, id, ...snap });
      if (result === 'full') { window.alert(`찜은 ${FAV_MAX}곳까지 담을 수 있어요. 찜 탭에서 몇 곳을 빼 주세요.`); break; }
      saveState(state);
      if (state.ui.tab === 'favs' && !state.ui.sheet) { update(() => {}, { persist: false }); break; }
      // 화면 전체를 다시 그리면 상세 창이 맨 위로 올라가 버려서, 하트 모양과 탭의 숫자만 바꾼다.
      root.querySelectorAll('[data-action="fav"]').forEach((b) => {
        if (b.dataset.type !== type || b.dataset.id !== id) return;
        b.classList.toggle('is-on', result === 'on');
        b.setAttribute('aria-pressed', result === 'on' ? 'true' : 'false');
        b.setAttribute('aria-label', result === 'on' ? '찜에서 빼기' : '찜하기');
      });
      syncFavCount();
      break;
    }
    case 'fav-remove':
      update(() => { state.favs.splice(Number(v), 1); });
      break;
    case 'fav-auto':
      update(() => { autoRoute(state, state.profile.origin); });
      break;
    case 'open-shops':
      if (!SHOP_KINDS[v]) break;
      // 지난번에 못 불러왔으면 이번에 다시 찾는다.
      if (state.ui.shops?.[`${id}|${v}`]?.status === 'error') delete state.ui.shops[`${id}|${v}`];
      openSheet({ type: 'shops', id, kind: v });
      break;
    case 'retry-shops': {
      const s = state.ui.sheet;
      if (s?.type === 'shops' && state.ui.shops) {
        delete state.ui.shops[`${s.id}|${s.kind}`];
        update(() => {}, { persist: false });
      }
      break;
    }
    case 'slide': {
      const el = document.querySelector('[data-slides]');
      if (el) el.scrollBy({ left: Number(v) * el.clientWidth, behavior: 'smooth' });
      break;
    }
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
    case 'pick-result': {
      const r = state.ui.locResults?.[Number(v)];
      if (r) {
        update(() => {
          state.profile.origin = { type: 'search', name: r.name, lat: r.lat, lng: r.lng };
          state.ui.locResults = [];
          state.ui.locMsg = `검색 위치를 "${r.name}"(으)로 정했어요.`;
          state.ui.pick = null;
          state.ui.geoMsg = '';
        });
      }
      break;
    }
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

// ── 주요 검색 위치: 글자로 찾기 ───────────────────────────────
root.addEventListener('submit', async (ev) => {
  const form = ev.target.closest('[data-form="loc-search"]');
  if (!form) return;
  ev.preventDefault();
  const q = String(new FormData(form).get('q') || '').trim().slice(0, 60);
  if (!q) return;
  update(() => { state.ui.locQuery = q; state.ui.locResults = []; state.ui.locMsg = '찾는 중…'; }, { persist: false });
  const { results } = await searchLocation(q);
  update(() => {
    state.ui.locResults = results;
    state.ui.locMsg = results.length ? '아래에서 고르면 검색 위치가 바뀌어요.' : '찾지 못했어요. 다른 이름이나 주소로 검색하거나 지도에서 골라 주세요.';
  }, { persist: false });
});

// 상세 창이 열려 있을 때 Esc 키로 닫기
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && state.ui.sheet) closeSheet();
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

if (Array.isArray(history.state?.sheets)) sheets = history.state.sheets;
syncSheets();
render();

// 실제 데이터를 불러오면 다시 그린다(못 불러오면 연습용 데이터 그대로).
loadLive()
  .then(({ updatedAt, events }) => {
    if (events && events.length) EVENTS = events;
    liveUpdatedAt = updatedAt;
    if (updatedAt) update(() => {}, { persist: false });
  })
  .catch(() => {});
