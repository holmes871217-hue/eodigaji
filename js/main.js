// 앱의 시작점: 상태를 읽고 → 계산하고 → 화면을 그리고 → 누르는 동작을 처리한다.
import { PLACES, CATEGORIES } from './data/places.js';
import { getEvents } from './data/events.js';
import { loadLive } from './data/live.js';
import { loadState, saveState, defaultMaxMin, newId } from './core/store.js';
import { rankPlaces, eventsForTrip, upcomingEvents, hasChild, isKidsEvent } from './core/scoring.js';
import { CITIES } from './core/geo.js';
import { nearestLabel } from './core/locate.js';
import { searchLocation } from './core/search.js';
import { findShops, SHOP_KINDS } from './core/nearby.js';
import { findGooglePhotos } from './core/gphotos.js';
import { loadTaste, saveTaste, togglePref, migratePrefs, recordView, setHidden, setVisited, setRating, clearHidden, makeTasteScorer } from './core/taste.js';
import { photosOf } from './data/photos.js';
import { isValidISO, todayISO } from './core/dates.js';
import { tripRange, rangeText } from './ui/util.js';
import { favKey, toggleFav, moveFav, autoRoute, FAV_MAX } from './core/favs.js';
import { renderFavs } from './ui/favs.js';
import { attachSortable } from './ui/sortable.js';
import { renderHome } from './ui/home.js';
import { renderEvents } from './ui/events.js';
import { renderDeals } from './ui/deals.js';
import { renderGolf } from './ui/golf.js';
import { loadGolf } from './core/golf.js';
import { renderMy } from './ui/mypage.js';
import { renderSheet } from './ui/sheet.js';
import { mountRoute } from './ui/map.js';
import { mountTrendMap } from './ui/map.js';
import { buildCourse } from './core/course.js';
import { getRegions } from './data/regions.js';
import { mountMap, mountPicker, unmountMaps, resetMapView, fitMapAll, panPicker, mapWidthKm } from './ui/map.js';

const root = document.getElementById('app');
const state = loadState();
// 개인 취향·행동 데이터(C 항목): 새 키 eodigaji.taste.v1 에 따로 저장한다. 화면이 읽을 수 있게 state.ui 에 걸어 둔다(state.ui 는 폰에 저장되지 않는다).
const taste = loadTaste();
state.ui.taste = taste;
if (migratePrefs(taste, state.profile.members[0]?.id)) saveTaste(taste); // 예전 공통 취향 → 나의 취향
state.ui.course = { start: '09:00', end: '18:00', mode: 'car', result: null }; // 코스 만들기 입력과 결과(저장하지 않음)
const tasteScorer = () => makeTasteScorer(taste, PLACES, state.favs.filter((f) => f.type === 'place').map((f) => f.id), state.profile.members);
let EVENTS = getEvents();
let liveUpdatedAt = null; // 실제 데이터를 모은 시각 (없으면 연습용 데이터)
let golfData; // 골프 자료(undefined: 아직 안 받음, null: 실패)
let installEvent = null; // 브라우저가 건네준 "설치 창 띄우기" 손잡이

const TABS = [
  { v: 'home', label: '추천', full: '추천', icon: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>' },
  { v: 'events', label: '축제', full: '축제·행사', icon: '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>' },
  { v: 'favs', label: '찜·코스', full: '찜·코스', icon: '<path d="M12 20.5s-7.5-4.6-7.5-10.3A4.4 4.4 0 0 1 12 7.4a4.4 4.400 0 0 1 7.500 2.800c0 5.700-7.500 10.300-7.500 10.300z"/>' },
  { v: 'deals', label: '특가', full: '특가', icon: '<path d="M3.5 12.5V4.5h8l9 9-8 8z"/><circle cx="8" cy="9" r="1.5"/>' },
  { v: 'golf', label: '골픽', full: '골픽', icon: '<path d="M7 21V3.5l10 4-10 4"/><path d="M4 21h10"/>' },
  { v: 'my', label: '마이', full: '마이페이지', icon: '<circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6"/>' },
];

/** 현재 설정으로 추천 결과를 계산한다. */
function compute() {
  const p = state.profile;
  const { start, end } = tripRange(p);
  // 동행인에 아이가 없으면 아이 전용 행사(아동 공연 등)는 목록과 "근처 축제" 표시에서 뺀다.
  const hideKids = !hasChild(p.members);
  const shownEvents = hideKids ? EVENTS.filter((e) => !isKidsEvent(e)) : EVENTS;
  const tripEvents = eventsForTrip(shownEvents, start, end, p.origin);
  const upcoming = upcomingEvents(shownEvents, end, p.origin);
  // 상세 창·찜 목록이 행사를 찾을 때는 뺀 행사도 포함한다(예전에 찜했거나 직접 열 수 있게)
  const eventsAll = hideKids ? [...eventsForTrip(EVENTS, start, end, p.origin), ...upcomingEvents(EVENTS, end, p.origin)] : [...tripEvents, ...upcoming];
  const scorer = tasteScorer();
  const ranked = rankPlaces(PLACES, p, tripEvents, state.ui.maxMin, state.ui.scope, { taste: scorer });
  // 상세 창은 이동시간 필터와 상관없이 열 수 있어야 해서 전체 순위도 계산해 둔다.
  // 상세 창·찜 목록이 장소를 찾을 때 쓰는 전체 순위: 아이 전용 장소도 빼지 않는다(예전에 찜했거나 직접 열 수 있게)
  // 상세 창은 숨긴 곳도 열 수 있어야 해서(hideHidden:false) 취향 보정이 있으면 전체 순위를 따로 계산한다.
  const rankedAll = !scorer.active && hasChild(p.members) && state.ui.maxMin >= 9999 && state.ui.scope === 'all' ? ranked : rankPlaces(PLACES, p, tripEvents, 9999, 'all', { hideKids: false, taste: scorer, hideHidden: false });
  return { tripEvents, upcoming, eventsAll, ranked, rankedAll };
}

function ensureGolf() {
  if (state.ui.tab !== 'golf' || golfData !== undefined || state.ui.golfLoading) return;
  state.ui.golfLoading = true;
  loadGolf().then((d) => { golfData = d; state.ui.golfLoading = false; if (state.ui.tab === 'golf') update(() => {}, { persist: false }); });
}

function render() {
  ensureGolf();
  ensureShops();
  ensureGooglePhotos();
  const c = compute();
  c.golf = golfData; // 골픽 상세 창이 쓴다
  const tab = state.ui.tab;
  const view =
    tab === 'events' ? renderEvents(state, c)
    : tab === 'favs' ? renderFavs(state, c)
    : tab === 'deals' ? renderDeals()
    : tab === 'golf' ? renderGolf(state, golfData)
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

  if (state.ui.sheet?.type === 'course' && state.ui.course.result?.ok) {
    const el = document.getElementById('course-map');
    const pts = state.ui.course.result.items.filter((i) => i.type === 'visit').map((i) => ({ lat: i.place.lat, lng: i.place.lng, name: i.place.name }));
    if (el) mountRoute(el, { origin: state.profile.origin, points: pts, key: 'course' });
  }

  if (state.ui.sheet?.type === 'trend') {
    const el = document.getElementById('trend-map');
    if (el) mountTrendMap(el, { regions: getRegions() });
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
      mountPicker(el, {
        center: state.profile.origin,
        // 지도를 한 번 누르면 그 자리가 새 검색 위치가 된다. 화면 전체를 다시 그리면 지도가 움직이니, 위치 글자만 바꾼다.
        onTap: (pos) => {
          const name = nearestLabel(pos);
          state.profile.origin = { type: 'map', name, lat: pos.lat, lng: pos.lng };
          state.ui.geoMsg = '';
          saveState(state);
          for (const node of document.querySelectorAll('.loc-now b, #pick-label')) node.textContent = name;
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

// ── 코스: 식사 장소 자동 찾기 ──────────────────────────────────
const shopPlace = (s, kind) => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng, cat: kind === 'cafe' ? 'cafe' : 'food', shop: true, kind, sub: s.sub || s.type || '', addr: s.addr || '', nq: s.nq || s.name, gid: s.gid || '', rating: s.rating ?? null, br: s.br || null });
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
/** 이 지점 근처에서 가장 알맞은 가게 하나(이미 쓴 곳은 제외). 못 찾으면 null */
async function nearestShop(near, kind, used) {
  try {
    const r = await withTimeout(findShops({ lat: near.lat, lng: near.lng, name: near.name }, kind), 9000);
    const it = (r.items || []).find((x) => !used.has(x.id) && !used.has(x.name));
    if (!it) return null;
    used.add(it.id); used.add(it.name);
    return { ...shopPlace(it, kind), auto: true };
  } catch (e) { return null; }
}
/**
 * 식사 시간에 정해 둔 맛집이 없으면 그 지점 근처 맛집을 찾아 넣고, 맛집마다 이어서 갈 카페도 붙인다.
 * 찾지 못하거나 시간이 모자라면 처음 코스를 그대로 둔다(null).
 */
async function addMeals(first, candidates, args) {
  const used = new Set(candidates.filter((c) => c.place.shop).flatMap((c) => [c.place.id, c.place.name]));
  const favFoods = candidates.filter((c) => c.place.shop && c.place.cat === 'food');
  const favCafes = candidates.filter((c) => c.place.shop && c.place.cat === 'cafe');
  const slots = first.items.filter((i) => i.type === 'meal' && i.near); // 식당을 못 정한 점심·저녁
  // 오래 머무는 곳 안에서 점심을 먹는 것으로 처리된 코스도, 맛집이 없으면 그 근처 맛집으로 바꾼다
  const inside = first.items.find((i) => i.type === 'visit' && i.lunchIn);
  if (inside && !favFoods.length) slots.push({ near: { lat: inside.place.lat, lng: inside.place.lng, name: inside.place.name } });
  const autoFoods = [];
  for (const m of slots) { const f = await nearestShop(m.near, 'food', used); if (f) autoFoods.push(f); }
  const allFoods = [...favFoods.map((c) => c.place), ...autoFoods];
  if (!allFoods.length) return null;
  const cafes = [];
  for (let i = 0; i < allFoods.length; i++) {
    const have = favCafes[i]?.place;
    cafes.push(have || (await nearestShop(allFoods[i], 'cafe', used)));
  }
  const sights = candidates.filter((c) => !c.place.shop);
  const mk = (foods, cafeList) => buildCourse({ ...args, lunchIn: false, candidates: [...sights, ...foods.map((place) => ({ place, score: 1e9, fav: true })), ...cafeList.filter(Boolean).map((place) => ({ place, score: 1e9, fav: true }))] });
  // 모두 넣어 보고, 시간이 안 되면 점심 한 곳(+카페)만, 그래도 안 되면 맛집만
  for (const [f, c] of [[allFoods, cafes], [allFoods.slice(0, 1), cafes.slice(0, 1)], [allFoods.slice(0, 1), []]]) {
    const r = mk(f, c);
    if (r.ok && r.items.filter((i) => i.type === 'visit' && i.meal).length) return r;
  }
  return null;
}

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
      update(() => { state.ui.tab = v; syncSheets(); state.ui.locResults = []; state.ui.locMsg = ''; }, { keepScroll: false });
      if (depth && Array.isArray(history.state?.sheets)) history.go(-depth);
      break;
    }
    case 'golf-mode':
      update(() => { state.ui.golf.mode = v === 'abroad' ? 'abroad' : 'dom'; state.ui.golf.max = 20; });
      break;
    case 'golf-day':
      update(() => { state.ui.golf.day = v; state.ui.golf.max = 20; }, { persist: false });
      break;
    case 'golf-time':
      update(() => { state.ui.golf.maxMin = Number(v) || 120; state.ui.golf.max = 20; });
      break;
    case 'golf-country':
      update(() => { state.ui.golf.country = v || ''; state.ui.golf.city = ''; state.ui.golf.max = 20; }, { persist: false });
      break;
    case 'golf-city':
      update(() => { state.ui.golf.city = v || ''; state.ui.golf.max = 20; }, { persist: false });
      break;
    case 'golf-open':
      openSheet({ type: 'golf', id });
      break;
    case 'golf-tour':
      openSheet({ type: 'golf-tour', id });
      break;
    case 'golf-more':
      update(() => { state.ui.golf.max = (state.ui.golf.max || 20) + 20; }, { persist: false });
      break;
    case 'mode':
      update(() => { state.profile.mode = v === 'calm' ? 'calm' : 'hot'; state.ui.listMax = 20; });
      break;
    case 'maxmin':
      update(() => { state.ui.maxMin = Number(v); state.ui.listMax = 20; });
      break;
    case 'scope':
      update(() => { state.ui.scope = ['near', 'all', 'big'].includes(v) ? v : 'all'; state.ui.listMax = 20; });
      break;
    case 'more':
      // 추천 목록을 20곳 더 보여 준다(조건을 바꾸면 다시 20곳부터).
      update(() => { state.ui.listMax = (state.ui.listMax || 20) + 20; }, { persist: false });
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
      recordView(taste, id); saveTaste(taste); // 조회 기록(C 항목)
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
      if (result === 'full') { window.alert(`찜은 ${FAV_MAX}곳까지 담을 수 있어요. 찜·코스 탭에서 몇 곳을 빼 주세요.`); break; }
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
    case 'fav-clear':
      if (!state.favs.length) break;
      if (!window.confirm(`찜·코스 목록 ${state.favs.length}곳을 모두 지울까요?`)) break;
      update(() => { state.favs = []; state.ui.course.result = null; });
      break;
    case 'fav-auto':
      update(() => { autoRoute(state, state.profile.origin); });
      break;
    case 'open-course':
      state.ui.course.result = null;
      openSheet({ type: 'course' });
      break;
    case 'course-mode':
      state.ui.course.mode = v === 'transit' ? 'transit' : 'car';
      state.ui.course.result = null;
      update(() => {}, { persist: false });
      break;
    case 'course-make': {
      const cs = state.ui.course;
      if (cs.busy) break;
      const c = compute();
      const placeById = new Map(PLACES.map((pl) => [pl.id, pl]));
      const favPlaces = state.favs.filter((f) => f.type === 'place').map((f) => placeById.get(f.id)).filter(Boolean);
      const favIds = new Set(favPlaces.map((pl) => pl.id));
      // 찜해 둔 맛집·카페는 식사 시간에 맞춰 코스에 넣는다
      const favShops = state.favs.filter((f) => f.type === 'shop' && (f.kind === 'food' || f.kind === 'cafe')).map((f) => shopPlace(f, f.kind));
      // 찜한 곳을 먼저, 그다음 추천 상위(이동시간 한도 안, 가족·취향이 반영된 순서) 15곳
      const candidates = [
        ...favPlaces.map((place) => ({ place, score: 1e9, fav: true })),
        ...favShops.map((place) => ({ place, score: 1e9, fav: true })),
        ...c.ranked.filter((r) => !favIds.has(r.place.id)).slice(0, 15).map((r) => ({ place: r.place, score: r.raw })),
      ];
      const args = { origin: state.profile.origin, date: state.profile.date, start: cs.start, end: cs.end, mode: cs.mode };
      const first = buildCourse({ ...args, candidates });
      cs.result = first;
      cs.busy = first.ok; // 코스가 만들어졌으면 식사 장소를 찾는 동안 잠깐 "찾는 중"을 보여 준다
      update(() => {}, { persist: false });
      if (first.ok) {
        const token = (cs.token = (cs.token || 0) + 1);
        addMeals(first, candidates, args).then((better) => { if (cs.token === token && better) cs.result = better; }).catch(() => {}).then(() => {
          if (cs.token !== token) return;
          cs.busy = false;
          if (state.ui.sheet?.type === 'course') update(() => {}, { persist: false });
        });
      }
      break;
    }
    case 'course-save': {
      const cs = state.ui.course;
      const visits = (cs.result?.items || []).filter((i) => i.type === 'visit').map((i) => i.place);
      if (!visits.length) break;
      const keep = state.favs.filter((f) => !visits.some((p) => p.id === f.id && f.type === (p.shop ? 'shop' : 'place')));
      const placed = visits.map((p) => {
        const type = p.shop ? 'shop' : 'place';
        const old = state.favs.find((f) => f.type === type && f.id === p.id);
        if (old) return old;
        if (p.shop) return { key: favKey('shop', p.id), type: 'shop', id: p.id, name: p.name, lat: p.lat, lng: p.lng, sub: p.sub || '', addr: p.addr || '', nq: p.nq || p.name, gid: p.gid || '', kind: p.kind };
        return { key: favKey('place', p.id), type: 'place', id: p.id, ...favSnapshot('place', p.id) };
      });
      if (placed.length + keep.length > FAV_MAX) { window.alert(`찜은 ${FAV_MAX}곳까지 담을 수 있어요. 찜·코스 탭에서 몇 곳을 빼 주세요.`); break; }
      state.favs = [...placed, ...keep]; // 코스 순서대로 맨 위에, 나머지 찜은 그 아래에 그대로 둔다
      saveState(state);
      sheets = [];
      try { history.replaceState(null, ''); } catch (e) { /* 무시 */ }
      update(() => { syncSheets(); state.ui.tab = 'favs'; });
      break;
    }
    case 'taste-pref':
      togglePref(taste, v, id); saveTaste(taste);
      update(() => {}, { persist: false });
      break;
    case 'taste-hide':
      setHidden(taste, id, !taste.places[id]?.h); saveTaste(taste);
      update(() => {}, { persist: false });
      break;
    case 'taste-visit':
      setVisited(taste, id, !taste.places[id]?.d); saveTaste(taste);
      update(() => {}, { persist: false });
      break;
    case 'taste-rate':
      setRating(taste, id, Number(v)); saveTaste(taste);
      update(() => {}, { persist: false });
      break;
    case 'taste-unhide-all':
      clearHidden(taste); saveTaste(taste);
      update(() => {}, { persist: false });
      break;
    case 'open-trend':
      openSheet({ type: 'trend' });
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
          if (taste.mp) { delete taste.mp[id]; saveTaste(taste); }
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
        state.ui.listMax = 20;
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
  } else if (field === 'course-start' || field === 'course-end') {
    state.ui.course[field === 'course-start' ? 'start' : 'end'] = el.value;
    state.ui.course.result = null;
    update(() => {}, { persist: false });
  } else if (field === 'golf-date') {
    // 골픽 치는 날짜(달력에서 고름)
    if (isValidISO(el.value) && el.value >= todayISO()) update(() => { state.ui.golf.day = el.value; state.ui.golf.max = 20; }, { persist: false });
  } else if (field === 'jump') {
    // 지역을 고르면 그 지역의 지정 위치가 곧바로 검색 위치가 된다(안산·수원·오산·평택은 정해 둔 거점, 나머지는 도심).
    const city = CITIES.find((c) => c.name === el.value);
    if (city) update(() => { state.profile.origin = { type: 'city', name: city.name, lat: city.lat, lng: city.lng }; state.ui.geoMsg = ''; state.ui.locResults = []; state.ui.locMsg = ''; });
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
