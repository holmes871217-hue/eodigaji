// 찜 화면: 위에는 지도(번호 핀 + 순서대로 이은 선), 아래에는 끌어서 순서를 바꾸는 목록
import { routeKm, FAV_MAX } from '../core/favs.js';
import { haversineKm } from '../core/geo.js';
import { SHOP_KINDS } from '../core/nearby.js';
import { esc, naverQuery } from './util.js';

const kmText = (km) => (km < 1 ? `${Math.max(10, Math.round(km * 100) * 10)}m` : km < 10 ? `${km.toFixed(1)}km` : `${Math.round(km)}km`);

function typeLabel(f) {
  if (f.type === 'shop') return SHOP_KINDS[f.kind]?.label || '가게';
  return f.type === 'event' ? '축제·공연' : '장소';
}

function favRow(f, i, favs, c) {
  // 장소·행사는 누르면 상세 창. 가게, 그리고 지금 날짜 목록에 없는 행사는 네이버 지도로 간다.
  const openable =
    f.type === 'place' ? c.rankedAll.some((r) => r.place.id === f.id)
    : f.type === 'event' ? (c.eventsAll || [...c.tripEvents, ...c.upcoming]).some((e) => e.id === f.id)
    : false;
  const leg = i > 0 ? `앞에서 ${kmText(haversineKm(favs[i - 1], f))}` : '';
  const body = `
    <span class="fav-num" aria-hidden="true">${i + 1}</span>
    <span class="fav-body">
      <span class="fav-name">${esc(f.name)}</span>
      <span class="card-meta"><span class="badge fav-type is-${esc(f.type === 'shop' ? f.kind : f.type)}">${esc(typeLabel(f))}</span>${esc([f.sub, leg].filter(Boolean).join(' · '))}</span>
    </span>`;
  const main = openable
    ? `<button type="button" class="fav-main" data-action="open-${f.type}" data-id="${esc(f.id)}">${body}</button>`
    : `<a class="fav-main" href="https://map.naver.com/p/search/${encodeURIComponent(naverQuery(f.nq || f.name, f.addr))}" target="_blank" rel="noopener noreferrer">${body}</a>`;
  return `
    <li class="fav" data-key="${esc(f.key)}">
      ${main}
      <button type="button" class="heart is-on" data-action="fav-remove" data-v="${i}" aria-label="${esc(f.name)} 찜에서 빼기"><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-7.5-10.3A4.4 4.4 0 0 1 12 7.4a4.4 4.4 0 0 1 7.5 2.8c0 5.700-7.500 10.300-7.500 10.300z"/></svg></button>
      <button type="button" class="fav-handle" data-drag aria-label="${esc(f.name)} 순서 바꾸기. 끌거나 위·아래 화살표를 누르세요">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.200" stroke-linecap="round" aria-hidden="true"><path d="M5 8h14M5 12h14M5 16h14"/></svg>
      </button>
    </li>`;
}

export function renderFavs(state, c) {
  const favs = state.favs || [];
  if (!favs.length) {
    return `
      <div class="headline">
        <h1>찜·코스</h1>
      </div>
      <div class="empty fav-empty">
        <b>아직 찜한 곳이 없어요.</b>
        <span>추천·축제 탭에서 오른쪽 위 ♥를 누르면 여기에 담겨요. 장소 상세의 근처 맛집·카페도 담을 수 있어요.</span>
      </div>
    <div class="trend-tools">
      <button type="button" class="trend-open" data-action="open-course">🗺 여행 코스 자동 만들기 (시간표)</button>
      <button type="button" class="trend-open" data-action="open-trend">🔥 전국 지역 트렌드 지도 보기</button>
    </div>
      <div class="sheet-actions">
        <button type="button" class="btn-primary" data-action="tab" data-v="home">추천 보러 가기</button>
        <button type="button" class="btn-secondary" data-action="tab" data-v="events">축제 보러 가기</button>
      </div>`;
  }
  const km = routeKm(favs);
  return `
    <div class="headline fav-head">
      <h1>찜·코스</h1>
    </div>
    <div class="trend-tools">
      <button type="button" class="trend-open" data-action="open-course">🗺 여행 코스 자동 만들기 (시간표)</button>
      <button type="button" class="trend-open" data-action="open-trend">🔥 전국 지역 트렌드 지도 보기</button>
    </div>
    <div class="map-wrap">
      <div id="fav-map" class="map map-fav" role="application" aria-label="찜한 곳 지도. 번호는 가는 순서예요"></div>
    </div>

    <div class="row-between">
      <h2 class="h2">가는 순서 <span class="count">${favs.length}</span>곳</h2>
      ${favs.length > 2 ? '<button type="button" class="btn-secondary sm" data-action="fav-auto">가까운 순으로 정리</button>' : ''}
    </div>
    <p class="muted">${favs.length > 1 ? `순서대로 이으면 직선거리로 약 ${kmText(km)}예요. ` : ''}오른쪽 손잡이(≡)를 잡고 끌면 순서가 바뀌어요.</p>
    <ol class="fav-list" id="fav-list">
      ${favs.map((f, i) => favRow(f, i, favs, c)).join('')}
    </ol>
    <p class="note">찜은 이 폰에만 저장돼요(최대 ${FAV_MAX}곳). 지도의 선은 길이 아니라 순서를 보여 주는 직선이에요.</p>`;
}
