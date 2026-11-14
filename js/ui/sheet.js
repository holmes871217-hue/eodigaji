// 아래에서 올라오는 상세 창(바텀 시트)
import { CATEGORIES } from '../data/places.js';
import { photoOf } from '../data/photos.js';
import { EVENT_TYPES } from '../data/events.js';
import { KIND_LABEL, crowdLabel, trendPct } from '../core/scoring.js';
import { formatMin, tripLabel, haversineKm } from '../core/geo.js';
import { memberLabel } from '../core/segments.js';
import { esc, icon, rangeText } from './util.js';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

/** 가는 날 이 장소 20km 안에서 열리는 축제·공연 (가까운 순, 최대 5개) */
function nearbyEvents(p, tripEvents) {
  return tripEvents
    .map((e) => ({ e, km: haversineKm(e, p) }))
    .filter((x) => x.km <= 20)
    .sort((a, b) => a.km - b.km)
    .slice(0, 5);
}

function placeSheet(r, tripEvents) {
  const p = r.place;
  const cat = CATEGORIES[p.cat] || { label: '', icon: '📍' };
  const pct = trendPct(p.trend);
  const q = encodeURIComponent(p.name);
  const photo = photoOf(p.id);
  const near = nearbyEvents(p, tripEvents);
  const tips = (p.tip || '').split(/\s+·\s+/).map((s) => s.trim()).filter(Boolean);

  return `
    <div class="sheet-photo ph-${esc(p.cat)}">
      <span class="pcard-fallback" aria-hidden="true">${cat.icon}</span>
      ${photo ? `<img src="${esc(photo.src)}" alt="${esc(p.name)} 사진" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
    </div>
    <div class="sheet-head">
      <div>
        <h2 class="sheet-title" id="sheet-title">${esc(p.name)}<span class="badge badge-${r.kind}">${KIND_LABEL[r.kind]}</span></h2>
        <p class="card-meta">${esc(p.region)} · ${esc(cat.label)} · 검색 위치에서 ${tripLabel(r.km, r.min)} (${r.km < 10 ? r.km.toFixed(1) : Math.round(r.km)}km)</p>
      </div>
    </div>

    ${tips.length || p.overview ? `
    <section class="about" aria-label="볼거리 요약">
      ${tips.length ? `<h3 class="h3">이런 걸 볼 수 있어요</h3>
      <ul class="tips">${tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
      ${p.overview ? `<p class="overview">${esc(p.overview)}</p><p class="credit">소개 글: 한국관광공사</p>` : ''}
    </section>` : ''}

    ${near.length ? `
    <h3 class="h3">가는 날 근처 축제·공연 <span class="count">${near.length}</span></h3>
    <ul class="near-list">
      ${near.map(({ e, km }) => {
        const d = new Date(`${e.start}T00:00:00`);
        return `
        <li>
          <button type="button" class="near-item" data-action="goto-event" data-id="${esc(e.id)}">
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
    <p class="muted">누르면 축제 탭에서 자세히 볼 수 있어요.</p>` : ''}

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

    <p class="muted">한 달 블로그 언급 약 ${p.buzz.toLocaleString('ko-KR')}건 · 1년 누적 인기 ${p.yearly}점</p>
    <p class="sample-note">${p.sample
      ? '연습용 숫자예요. 실제 데이터 연결 전이라 참고만 해 주세요.'
      : `검색 인기·추세·블로그 수는 네이버 검색 데이터("${esc(p.keyword || p.name)}" 기준)예요.${p.local ? ' 사람별 점수는 1년 인기에 장소 분류별 경향을 더한 추정이에요.' : ''} 혼잡 예측은 아직 예시 값이에요.`}${photo ? ` <a href="${esc(photo.page)}" target="_blank" rel="noopener noreferrer">사진 출처: ${esc(photo.label || '위키미디어 공용')}</a>` : ''}</p>

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
    ${e.photo ? `<div class="sheet-photo event-photo ${e.source === 'kopis' ? 'is-poster' : ''}"><img src="${esc(e.photo)}" alt="${esc(e.title)} ${e.source === 'kopis' ? '포스터' : '사진'}" referrerpolicy="no-referrer" onerror="this.parentNode.remove()"></div>` : ''}
    <p class="sample-note">${e.sample
      ? '연습용 일정이에요. 실제 날짜와 다를 수 있으니 가기 전에 꼭 확인해 주세요.'
      : e.source === 'kopis'
        ? '공연 정보: KOPIS(공연예술통합전산망). 회차와 예매는 공연 정보 페이지에서 확인해 주세요.'
        : '한국관광공사 행사 정보 기준이에요. 일정이 바뀔 수 있으니 가기 전에 꼭 확인해 주세요.'}</p>
    <div class="sheet-actions">
      ${e.link
        ? `<a class="btn-primary" href="${esc(e.link)}" target="_blank" rel="noopener noreferrer">공연 정보 보기</a>`
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
    if (row) inner = placeSheet(row, c.tripEvents);
  } else if (s.type === 'event') {
    const ev = [...c.tripEvents, ...c.upcoming].find((e) => e.id === s.id);
    if (ev) inner = eventSheet(ev);
  }
  if (!inner) return '';
  return `
    <div class="scrim" data-action="close-sheet"></div>
    <section class="sheet ${s.type === 'place' ? 'has-photo' : ''}" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <button type="button" class="sheet-close" data-action="close-sheet" aria-label="닫기">닫기</button>
      ${inner}
    </section>`;
}
