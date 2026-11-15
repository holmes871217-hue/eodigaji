// 아래에서 올라오는 상세 창(바텀 시트)
import { CATEGORIES } from '../data/places.js';
import { photoOf, photosOf } from '../data/photos.js';
import { EVENT_TYPES } from '../data/events.js';
import { KIND_LABEL, crowdLabel, trendPct, nearbyEvents } from '../core/scoring.js';
import { formatMin, tripLabel } from '../core/geo.js';
import { memberLabel } from '../core/segments.js';
import { SHOP_KINDS } from '../core/nearby.js';
import { esc, icon, rangeText, heartBtn, naverQuery, googleMapUrl } from './util.js';
import { favSet, favKey } from '../core/favs.js';
import { cityToursFor } from '../data/citytour.js';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

/** 가는 날 이 장소 20km 안에서 열리는 축제·공연 (가까운 순, 최대 5개) */
// 목록은 core/scoring.js 의 nearbyEvents 를 그대로 쓴다(추천 카드의 "근처 …" 표시와 같은 결과).

/** 관광공사 주차 안내 글을 읽기 좋게 다듬는다. "가능요금 (무료)" → "가능", "요금 (무료)" */
function tidy(text) {
  return String(text || '')
    .replace(/(가능|불가능|불가|있음|없음)\s*(요금)/g, '$1\n$2')
    .replace(/\s*※\s*/g, '\n※ ')
    .replace(/(\S)\[/g, '$1\n[')
    .replace(/(^|\s)-\s+/g, '\n')
    .replace(/([^\s\d(~])-\s+/g, '$1\n')
    .split('\n').map((s) => s.trim()).filter(Boolean);
}

/**
 * 주차 안내 한 묶음.
 * @returns {{state: 'yes'|'no'|'unknown', title: string, short: string, lines: string[]}}
 *   short 는 추천 카드에 붙이는 짧은 말(없으면 빈 글자)
 */
export function parkingInfo(p) {
  const main = tidy(p.parking);
  const fee = tidy(p.parkingFee);
  if (!main.length && !fee.length) {
    return { state: 'unknown', title: '주차 안내가 등록돼 있지 않아요', short: '', lines: ['오른쪽 "근처 주차장" 버튼으로 가까운 주차장을 찾아보세요.'] };
  }
  const first = main[0] || '';
  const no = /^(불가|없음)/.test(first);
  const all = [...main, ...fee].join(' ');
  const free = !no && /무료/.test(all) && !/유료|\d[\d,]*\s*원/.test(all);
  const lines = [
    // "가능"·"있음"만 적힌 줄은 제목과 같은 말이라 뺀다. "가능 (500대)"는 대수만 남긴다.
    ...main.map((t) => t.replace(/^(가능|있음|불가능|불가|없음)\s*/, '').replace(/^\((.*)\)$/, '$1')).filter(Boolean),
    ...fee.map((t, i) => (i === 0 && !/^요금/.test(t) ? `요금: ${t}` : t)),
  ];
  return {
    state: no ? 'no' : 'yes',
    title: no ? '주차 불가' : free ? '주차 가능 · 무료' : '주차 가능',
    short: no ? '주차 불가' : free ? '주차 무료' : '주차 가능',
    lines: lines.length ? lines : [no ? '대중교통이나 근처 주차장을 이용해 주세요.' : '요금·대수는 가기 전에 확인해 주세요.'],
  };
}

const distText = (km) => (km < 1 ? `${Math.max(10, Math.round(km * 100) * 10)}m` : `${km.toFixed(1)}km`);

/** 카카오로 찾은 가게의 카카오맵 장소 번호(없으면 ''). 이름 검색이 안 되는 곳도 이 링크는 정확히 열린다. */
const kakaoId = (s) => (/^k-\d+$/.test(s.id || '') ? s.id.slice(2) : '');

/** 카카오맵에서 이 가게를 여는 주소. 카카오로 찾은 가게는 장소 번호로, 아니면 이름+좌표로 그 자리에 핀을 꽂는다(이름 검색이 안 맞아도 열린다). */
const kakaoPinUrl = (s) => (kakaoId(s) ? `https://place.map.kakao.com/${kakaoId(s)}` : `https://map.kakao.com/link/map/${encodeURIComponent(s.name)},${s.lat},${s.lng}`);

/** 장소 근처 맛집·카페 5곳. 가게를 누르면 네이버 지도로 간다. */
function shopsSheet(place, kind, data, favs) {
  const k = SHOP_KINDS[kind];
  const head = `
    <div class="sheet-head">
      <div>
        <h2 class="sheet-title" id="sheet-title">${esc(place.name)} 근처 ${k.label}</h2>
        <p class="card-meta">${data?.source === 'kakao' ? '가까운 순 5곳' : '가깝고 평점 높은 순 5곳'} · 누르면 네이버 지도, ♥는 찜</p>
      </div>
    </div>`;
  if (!data || data.status === 'loading') {
    return `${head}<div class="empty shop-wait" role="status"><b>${k.icon} 근처 ${k.label} 찾는 중…</b></div>`;
  }
  if (data.status === 'error') {
    return `${head}
      <div class="empty"><b>${k.label} 목록을 불러오지 못했어요.</b><span>인터넷 연결을 확인하고 다시 눌러 주세요.</span></div>
      <div class="sheet-actions">
        <button type="button" class="btn-primary" data-action="retry-shops">다시 찾기</button>
        <a class="btn-secondary" href="https://map.naver.com/p/search/${encodeURIComponent(`${place.name} ${k.label}`)}" target="_blank" rel="noopener noreferrer">네이버 지도에서 찾기</a>
      </div>`;
  }
  if (!data.items.length) {
    return `${head}
      <div class="empty"><b>10km 안에서는 찾지 못했어요.</b></div>
      <div class="sheet-actions">
        <a class="btn-primary" href="https://map.naver.com/p/search/${encodeURIComponent(`${place.name} ${k.label}`)}" target="_blank" rel="noopener noreferrer">네이버 지도에서 찾기</a>
      </div>`;
  }
  return `${head}
    <ol class="shop-list">
      ${data.items.map((s, i) => `
      <li>
        <a class="shop has-g" href="https://map.naver.com/p/search/${encodeURIComponent(kind === 'park' && s.addr ? s.addr : naverQuery(s.nq || s.name, s.addr))}" target="_blank" rel="noopener noreferrer">
          <span class="shop-rank" aria-hidden="true">${i + 1}</span>
          <span class="shop-body">
            <span class="shop-name">${esc(s.nq || s.name)}</span>
            <span class="shop-meta">
              ${s.rating != null ? `<span class="shop-star"><i aria-hidden="true">★</i> ${s.rating.toFixed(1)}</span><span>리뷰 ${s.reviews.toLocaleString('ko-KR')}</span>` : ''}
              <span>여기서 ${distText(s.km)}</span>
            </span>
            <span class="card-meta">${esc([s.type, s.addr].filter(Boolean).join(' · '))}</span>
            ${s.fee ? `<span class="shop-fee"><b>${esc(s.fee)}</b>${s.feeSub ? `<small>${esc(s.feeSub)}</small>` : ''}</span>` : ''}
          </span>
        </a>
        ${heartBtn('shop', s.id, favs.has(favKey('shop', s.id)), 'on-shop')}
        <span class="shop-chips">
          <a class="shop-g" href="${esc(kakaoPinUrl(s))}" target="_blank" rel="noopener noreferrer" aria-label="${esc(s.name)} 카카오맵에서 보기">카카오맵</a>
          ${s.gid ? `<a class="shop-g" href="${esc(googleMapUrl(s.name, s.gid))}" target="_blank" rel="noopener noreferrer" aria-label="${esc(s.name)} 구글 지도에서 보기">구글 지도</a>` : ''}
        </span>
      </li>`).join('')}
    </ol>
    <p class="sample-note">${data.source === 'google'
      ? '평점·리뷰 수는 Google 지도 기준이에요(네이버는 평점을 외부에 제공하지 않아요). 네이버 지도에서 가게가 안 나오면 오른쪽 아래 "카카오맵"·"구글 지도"를 눌러 보세요(그 자리에 핀을 바로 꽂아 줘요). 리뷰가 적은 곳은 순서에서 조금 뒤로 보내고, 멀수록 점수를 조금 깎았어요.'
      : kind === 'park' ? `카카오맵에 등록된 주차장을 가까운 순으로 보여 드려요("전용"이 붙은 곳은 뺐어요). ${data.fees ? '요금·운영 정보는 서울 열린데이터광장(서울시 관리 주차장) 기준이에요. ' : ''}가기 전에 현장 안내를 꼭 확인해 주세요.` : '지금은 평점을 불러올 수 없어서 카카오맵 기준 가까운 순으로 보여 드려요.'} 거리는 직선거리예요.</p>`;
}

/** 이 장소가 있는 시·군·구의 시티투어 안내(코스 2개까지) */
function tourBox(p) {
  const tours = cityToursFor(p);
  if (!tours.length) return '';
  const shown = tours.slice(0, 2);
  const town = String(p.region || '').split(' ')[1] || '';
  return `
    <section class="tour" aria-label="시티투어 안내">
      <div class="tour-head"><span class="tour-icon" aria-hidden="true">🚌</span><b>${esc(town)} 시티투어 ${tours.length}개 코스</b></div>
      <ul class="tour-list">
        ${shown.map((t) => `
        <li>
          <b>${esc(t.c)}</b>
          ${t.run ? `<span>운행 ${esc(t.run)}</span>` : ''}
          ${t.fee ? `<span>요금 ${esc(t.fee)}</span>` : ''}
          ${t.brd ? `<span>탑승 ${esc(t.brd)}</span>` : ''}
          <span class="tour-links">${t.url ? `<a href="${esc(t.url)}" target="_blank" rel="noopener noreferrer">자세히 보기</a>` : ''}${t.tel ? `<a href="tel:${esc(t.tel.replace(/[^\d+]/g, ''))}">전화 ${esc(t.tel)}</a>` : ''}</span>
        </li>`).join('')}
      </ul>
      ${tours.length > shown.length ? `<p class="muted">나머지 ${tours.length - shown.length}개 코스는 위 "자세히 보기"나 시·군 관광 누리집에서 확인하세요.</p>` : ''}
      <p class="muted">지자체가 공공데이터포털에 등록한 정보예요. 운행 일정은 바뀔 수 있어요.</p>
    </section>`;
}

function placeSheet(r, tripEvents, gp) {
  const p = r.place;
  const cat = CATEGORIES[p.cat] || { label: '', icon: '📍' };
  const pct = trendPct(p.trend);
  const q = encodeURIComponent(p.name);
  const photo = photoOf(p.id);
  const basePhotos = photosOf(p.id); // 옆으로 넘겨 보는 사진(최대 10장)
  // 사진이 한 장 이하면 구글 지도 사진(실시간, 저장 안 함)을 뒤에 붙인다.
  const gPhotos = basePhotos.length <= 1 ? (gp?.photos || []) : [];
  const photos = [...basePhotos, ...gPhotos.map((g) => g.src)];
  const gBy = [...new Set(gPhotos.map((g) => g.by).filter(Boolean))].slice(0, 3);
  const near = nearbyEvents(p, tripEvents);
  const tips = (p.tip || '').split(/\s+·\s+/).map((s) => s.trim()).filter(Boolean);
  const park = parkingInfo(p);

  return `
    <div class="sheet-photo ph-${esc(p.cat)}">
      <span class="pcard-fallback" aria-hidden="true">${cat.icon}</span>
      ${photos.length ? `
      <div class="slides" data-slides tabindex="0" role="group" aria-label="${esc(p.name)} 사진 ${photos.length}장${photos.length > 1 ? ', 옆으로 넘겨 보세요' : ''}">
        ${photos.map((src, i) => `<img src="${esc(src)}" alt="${esc(p.name)} 사진 ${i + 1}" ${src.startsWith('https://places.googleapis.com/') ? '' : 'referrerpolicy="no-referrer"'} ${i ? 'loading="lazy"' : ''} draggable="false">`).join('')}
      </div>
      <span class="slide-count" data-slide-count aria-hidden="true" ${photos.length > 1 ? '' : 'hidden'}>1 / ${photos.length}</span>
      <button type="button" class="slide-nav is-prev" data-action="slide" data-v="-1" aria-label="이전 사진" hidden>${icon('chevron', 20)}</button>
      <button type="button" class="slide-nav is-next" data-action="slide" data-v="1" aria-label="다음 사진" ${photos.length > 1 ? '' : 'hidden'}>${icon('chevron', 20)}</button>` : ''}
    </div>
    <div class="sheet-head">
      <div>
        <h2 class="sheet-title" id="sheet-title">${esc(p.name)}<span class="badge badge-${r.kind}">${KIND_LABEL[r.kind]}</span></h2>
        <p class="card-meta">${esc(p.region)} · ${esc(cat.label)} · 검색 위치에서 ${tripLabel(r.km, r.min)} (${r.km < 10 ? r.km.toFixed(1) : Math.round(r.km)}km)</p>
      </div>
    </div>

    <div class="park ${park.state === 'no' ? 'is-no' : ''}">
      <span class="park-icon" aria-hidden="true">P</span>
      <div class="park-body">
        <b>${esc(park.title)}</b>
        ${park.lines.map((t) => `<span>${esc(t)}</span>`).join('')}
      </div>
      <button type="button" class="park-link" data-action="open-shops" data-id="${esc(p.id)}" data-v="park">근처 주차장</button>
    </div>

    ${tourBox(p)}

    <div class="shop-btns" role="group" aria-label="근처 가게 찾기">
      ${Object.entries(SHOP_KINDS).filter(([k]) => k !== 'park').map(([k, s]) => `
      <button type="button" class="shop-btn" data-action="open-shops" data-id="${esc(p.id)}" data-v="${k}">
        <span class="shop-btn-icon" aria-hidden="true">${s.icon}</span>
        <span><b>근처 ${s.label}</b><small>평점 높은 5곳</small></span>
      </button>`).join('')}
    </div>

    ${tips.length || p.overview || p.stdOverview || p.spot ? `
    <section class="about" aria-label="볼거리 요약">
      ${tips.length ? `<h3 class="h3">이런 걸 볼 수 있어요</h3>
      <ul class="tips">${tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
      ${p.spot ? `<h3 class="h3">어떤 곳인가요</h3>
      <ul class="tips"><li>${p.std ? `공공데이터포털 ${p.sub === '특화거리' ? '지역특화거리' : '관광지'} 등록 정보` : '카카오맵 분류'}: ${esc(p.sub || cat.label)}</li>${p.kakaoUrl ? `<li><a href="${esc(p.kakaoUrl)}" target="_blank" rel="noopener noreferrer">카카오맵에서 사진·후기 보기</a></li>` : ''}</ul>` : ''}
      ${p.overview ? `<p class="overview">${esc(p.overview)}</p><p class="credit">소개 글: 한국관광공사</p>` : p.stdOverview ? `<p class="overview">${esc(p.stdOverview)}</p><p class="credit">소개 글: 지자체 등록 정보(공공데이터포털)</p>` : ''}
    </section>` : ''}

    ${near.length ? `
    <h3 class="h3">가는 날 근처 축제·공연 <span class="count">${near.length}</span></h3>
    <ul class="near-list">
      ${near.map(({ e, km }) => {
        const d = new Date(`${e.start}T00:00:00`);
        return `
        <li>
          <button type="button" class="near-item" data-action="open-event" data-id="${esc(e.id)}">
            <span class="near-date type-${esc(e.type)}"><b>${d.getMonth() + 1}/${d.getDate()}</b><small>${DOW[d.getDay()]}</small></span>
            <span class="near-body">
              <span class="near-title">${esc(e.title)}</span>
              <span class="card-meta">${esc(EVENT_TYPES[e.type] || '행사')} · ${esc(rangeText(e.start, e.end))} · 여기서 ${km < 10 ? km.toFixed(1) : Math.round(km)}km</span>
            </span>
            <span class="near-go" aria-hidden="true">${icon('chevron', 18)}</span>
          </button>
        </li>`;
      }).join('')}
    </ul>
    <p class="muted">누르면 자세히 볼 수 있어요. 뒤로 가면 이 장소로 돌아와요.</p>` : ''}

    <div class="stats">
      <div class="stat"><b>${Math.round(r.fam)}</b><span>우리 가족 관심도</span></div>
      <div class="stat"><b class="${pct >= 0 ? 'up' : 'down'}">${pct >= 0 ? '+' : ''}${pct}%</b><span>최근 4주 추세</span></div>
      <div class="stat"><b>${crowdLabel(p.crowd)}</b><span>혼잡 예측</span></div>
    </div>

    <h3 class="h3">사람별 점수</h3>
    <ul class="bars">
      ${r.parts
        .map(
          (x) => `
        <li>
          <span class="bar-name">${esc(memberLabel(x.member, x.index))} <em>${x.member.age}세 · 가중치 ${x.weight}</em></span>
          <span class="bar"><i style="width:${x.score}%"></i></span>
          <span class="bar-num">${x.score}</span>
        </li>`
        )
        .join('')}
    </ul>

    ${p.spot ? '' : `<p class="muted">한 달 블로그 언급 약 ${p.buzz.toLocaleString('ko-KR')}건 · 1년 누적 인기 ${p.yearly}점</p>`}
    <p class="sample-note">${p.std
      ? `지자체가 공공데이터포털에 등록한 ${p.sub === '특화거리' ? '지역특화거리' : '관광지'}예요. 인기 점수는 등록 여부와 규모로 어림한 값이라 참고만 해 주세요.`
      : p.spot
      ? '카카오 장소 검색으로 찾은 동네 장소예요. 인기 점수는 관광공사 등록 여부와 검색 순위로 어림한 값이라 참고만 해 주세요.'
      : p.sample
      ? '연습용 숫자예요. 실제 데이터 연결 전이라 참고만 해 주세요.'
      : `검색 인기·추세·블로그 수는 네이버 검색 데이터("${esc(p.keyword || p.name)}" 기준)예요.${p.local ? ' 사람별 점수는 1년 인기에 장소 분류별 경향을 더한 추정이에요.' : ''} 혼잡 예측은 아직 예시 값이에요.`}${photo ? ` <a href="${esc(photo.page)}" target="_blank" rel="noopener noreferrer">사진 출처: ${esc(photo.label || '위키미디어 공용')}</a>` : ''}${gPhotos.length ? ` 일부 사진은 Google 지도에서 그때그때 불러왔어요${gBy.length ? `(${esc(gBy.join(', '))})` : ''}.` : ''}</p>

    <div class="sheet-actions">
      <a class="btn-primary" href="https://map.naver.com/p/search/${q}" target="_blank" rel="noopener noreferrer">네이버 지도에서 보기</a>
      <a class="btn-secondary" href="https://map.kakao.com/link/to/${q},${p.lat},${p.lng}" target="_blank" rel="noopener noreferrer">카카오맵 길찾기</a>
    </div>`;
}

function eventSheet(e) {
  const q = encodeURIComponent(e.title);
  return `
    <div class="sheet-head">
      <div>
        <h2 class="sheet-title" id="sheet-title">${esc(e.title)}<span class="badge badge-type">${esc(EVENT_TYPES[e.type] || '행사')}</span></h2>
        <p class="card-meta">${esc(rangeText(e.start, e.end))} · ${esc(e.region)}</p>
      </div>
    </div>
    <div class="stats">
      <div class="stat"><b>약 ${formatMin(e.min)}</b><span>검색 위치에서</span></div>
      <div class="stat"><b>${Math.round(e.km)}km</b><span>직선거리</span></div>
      <div class="stat"><b>${e.kid ? '좋음' : '보통'}</b><span>아이 동반</span></div>
    </div>
    <p class="desc">${esc(e.desc)}</p>
    ${e.photo ? `<div class="sheet-photo event-photo ${e.source === 'kopis' || e.source === 'seoul' ? 'is-poster' : ''}"><img src="${esc(e.photo)}" alt="${esc(e.title)} ${e.source === 'kopis' || e.source === 'seoul' ? '포스터' : '사진'}" referrerpolicy="no-referrer" onerror="this.parentNode.remove()"></div>` : ''}
    <p class="sample-note">${e.sample
      ? '연습용 일정이에요. 실제 날짜와 다를 수 있으니 가기 전에 꼭 확인해 주세요.'
      : e.source === 'kopis'
        ? '공연 정보: KOPIS(공연예술통합전산망). 회차와 예매는 공연 정보 페이지에서 확인해 주세요.'
        : e.source === 'std'
        ? '지자체가 공공데이터포털에 등록한 정보 기준이에요. 일정·요금·장소가 바뀌거나 취소될 수 있으니 가기 전에 꼭 확인해 주세요.'
        : e.source === 'seoul'
        ? '서울시 문화행사 정보(서울 열린데이터광장) 기준이에요. 일정·요금·예약 여부가 바뀔 수 있으니 가기 전에 꼭 확인해 주세요.'
        : '한국관광공사 행사 정보 기준이에요. 일정이 바뀔 수 있으니 가기 전에 꼭 확인해 주세요.'}</p>
    <div class="sheet-actions">
      ${e.link
        ? `<a class="btn-primary" href="${esc(e.link)}" target="_blank" rel="noopener noreferrer">${e.source === 'seoul' || e.source === 'std' ? '행사 정보 보기' : '공연 정보 보기'}</a>`
        : `<a class="btn-primary" href="https://search.naver.com/search.naver?query=${q}" target="_blank" rel="noopener noreferrer">네이버에서 일정 확인</a>`}
      <a class="btn-secondary" href="https://map.kakao.com/link/to/${q},${e.lat},${e.lng}" target="_blank" rel="noopener noreferrer">카카오맵 길찾기</a>
    </div>`;
}

export function renderSheet(state, c) {
  const s = state.ui.sheet;
  if (!s) return '';
  let inner = '';
  if (s.type === 'place') {
    const row = c.rankedAll.find((r) => r.place.id === s.id);
    if (row) inner = placeSheet(row, c.tripEvents, state.ui.gphotos?.[s.id]);
  } else if (s.type === 'event') {
    const ev = [...c.tripEvents, ...c.upcoming].find((e) => e.id === s.id);
    if (ev) inner = eventSheet(ev);
  } else if (s.type === 'shops' && SHOP_KINDS[s.kind]) {
    const row = c.rankedAll.find((r) => r.place.id === s.id);
    if (row) inner = shopsSheet(row.place, s.kind, state.ui.shops?.[`${s.id}|${s.kind}`], favSet(state));
  }
  if (!inner) return '';
  const canFav = s.type === 'place' || s.type === 'event'; // 가게 목록 창은 줄마다 하트가 있다
  const back = state.ui.sheetDepth > 1; // 다른 상세 창 위에 열린 창이면 "뒤로"
  return `
    <div class="scrim" data-action="close-sheet"></div>
    <section class="sheet ${s.type === 'place' ? 'has-photo' : ''} ${canFav ? 'has-fav' : ''}" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      ${canFav ? heartBtn(s.type, s.id, favSet(state).has(favKey(s.type, s.id)), 'sheet-fav') : ''}
      <button type="button" class="sheet-close" data-action="close-sheet" aria-label="${back ? '이전 화면으로' : '닫기'}">${back ? '뒤로' : '닫기'}</button>
      ${inner}
    </section>`;
}
