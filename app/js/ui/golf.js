// 골프 화면: 국내(차로 갈 수 있는 골프장, 1인 총비용 낮은 순) / 해외(나라·도시별 골프 상품, 가격 낮은 순)
import { esc } from './util.js';
import { courseTree, courseList, fareOf, fuelCost, transportCost, FUEL_LABEL, CONTINENTS, CONTINENT_OF, golfDomestic, golfDrive, golfDays, golfCountries, golfAbroad, won, localPrice, COUNTRY_CUR } from '../core/golf.js';
import { formatMin } from '../core/geo.js';
import { todayISO } from '../core/dates.js';
import { CITIES } from '../core/geo.js';

const GOLF_TIMES = [60, 90, 120, 150, 180];
const SRC = { ts: '티스캐너', gp: '골팡', tu: '티업엔조이', gm: '골프몬' };
const WD = ['일', '월', '화', '수', '목', '금', '토'];

const dayLabel = (iso) => { const d = new Date(`${iso}T00:00:00`); return `${d.getMonth() + 1}/${d.getDate()} (${WD[d.getDay()]})`; };
const kst = (iso) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const depLabel = (dep) => (dep ? `${Number(dep.slice(4, 6))}/${Number(dep.slice(6, 8))} ${dep.slice(8, 10)}:${dep.slice(10, 12)} 출발 예상` : '');
const hm = (min) => (min >= 60 ? `${Math.floor(min / 60)}시간${min % 60 ? ` ${min % 60}분` : ''}` : `${min}분`);

const PIN = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>';

/** 검색 지역 고르기 창(라운딩 일정 달력처럼 눌러서 고른다): 현재 위치 · 장소 검색 · 지역 선택 */
export function golfLocSheet(state) {
  const o = state.profile.origin || {};
  const ui = state.ui;
  return `
    <div class="sheet-head">
      <div>
        <h2 class="sheet-title" id="sheet-title">검색 지역</h2>
        <p class="card-meta">지금: <b>${esc(o.name || '내 위치')}</b></p>
        <p class="card-meta">이곳에서 차로 가는 시간으로 골프장을 찾아요</p>
      </div>
    </div>
    <button type="button" class="btn-accent wide golf-loc-gps" data-action="use-gps">${PIN}현재 위치 사용</button>
    ${ui.geoMsg ? `<p class="muted" role="status">${esc(ui.geoMsg)}</p>` : ''}
    <form class="loc-search mt" data-form="loc-search" role="search">
      <label class="sr-only" for="golf-loc-q">장소나 주소로 찾기</label>
      <input id="golf-loc-q" name="q" type="search" class="input" enterkeyhint="search" autocomplete="off" placeholder="장소·주소 검색 (예: 판교역, 해운대)" value="${esc(ui.locQuery || '')}">
      <button type="submit" class="btn-dark">검색</button>
    </form>
    ${ui.locMsg ? `<p class="muted" role="status">${esc(ui.locMsg)}</p>` : ''}
    ${ui.locResults?.length ? `<ul class="loc-results" aria-label="검색 결과">${ui.locResults.map((r, i) => `<li><button type="button" class="loc-result" data-action="pick-result" data-v="${i}">${PIN}<span><b>${esc(r.name)}</b><small>${esc(r.addr || '')}</small></span></button></li>`).join('')}</ul>` : ''}
    <h3 class="golf-sub">지역 선택</h3>
    <div class="chips chips-wrap golf-loc-cities" role="group" aria-label="지역">
      ${CITIES.map((c) => `<button type="button" class="chip ${o.name === c.name ? 'is-on' : ''}" data-action="golf-loc-city" data-v="${esc(c.name)}" aria-pressed="${o.name === c.name}">${esc(c.name)}</button>`).join('')}
    </div>`;
}

export function renderGolf(state, data) {
  const g = state.ui.golf;
  const head = `
    <div class="toggle wide golf-toggle" role="group" aria-label="국내·해외">
      <button type="button" class="toggle-btn ${g.mode === 'dom' ? 'is-on' : ''}" data-action="golf-mode" data-v="dom" aria-pressed="${g.mode === 'dom'}">국내</button>
      <button type="button" class="toggle-btn ${g.mode === 'abroad' ? 'is-on' : ''}" data-action="golf-mode" data-v="abroad" aria-pressed="${g.mode === 'abroad'}">해외</button>
    </div>`;
  if (data === undefined) return `${head}<div class="empty mt"><b>골프 자료를 불러오는 중…</b></div>`;
  if (!data) return `${head}<div class="empty mt"><b>골프 자료를 불러오지 못했어요.</b><span>인터넷 연결을 확인하고 다시 열어 주세요.</span></div>`;
  return head + (g.mode === 'abroad' ? abroad(state, data) : domestic(state, data));
}

function domestic(state, data) {
  const g = state.ui.golf;
  const days = golfDays(data, todayISO());
  if (!days.length) return '<div class="empty mt"><b>지금 볼 수 있는 날짜 자료가 없어요.</b><span>자료는 매일 새로 모아요.</span></div>';
  // 날짜는 마이 탭 "가는 날짜"처럼 달력에서 고른다. 처음에는 마이 탭에서 정한 가는 날짜를 쓴다.
  const day = g.day && g.day >= todayISO() ? g.day : state.profile.date;
  const inRange = days.includes(day);
  const origin = state.profile.origin;
  const rows = inRange ? golfDomestic(data, { origin, day, maxMin: g.maxMin, car: state.profile.car }) : [];
  const shown = rows.slice(0, g.max || 20);
  return `
    <div class="golf-when">
      <label class="field">
        <span class="field-label">라운딩 일정</span>
        <input type="date" class="input" id="golf-date" value="${esc(day)}" min="${todayISO()}" data-field="golf-date">
      </label>
      <div class="field">
        <span class="field-label">검색 지역</span>
        <button type="button" class="input golf-loc-btn" data-action="golf-loc" aria-label="검색 지역 바꾸기, 지금 ${esc(origin.name || '내 위치')}">${PIN}<span>${esc(origin.name || '내 위치')}</span></button>
      </div>
    </div>
    <h2 class="h2 mt">차로 몇 시간까지</h2>
    <div class="chips" role="group" aria-label="이동시간">
      ${GOLF_TIMES.map((m) => `<button type="button" class="chip ${m === g.maxMin ? 'is-on' : ''}" data-action="golf-time" data-v="${m}" aria-pressed="${m === g.maxMin}">${hm(m)}</button>`).join('')}
    </div>
    <h2 class="h2 mt">${esc(dayLabel(day))} · 총 <span data-golf-total>${rows.length}</span>곳</h2>
    ${rows.length ? `<ol class="list golf-list">${shown.map((r, i) => domCard(r, day, i + 1)).join('')}</ol>
      ${rows.length > shown.length ? `<button type="button" class="btn-secondary more-btn" data-action="golf-more">더 보기 · 다음 ${Math.min(20, rows.length - shown.length)}곳 (남은 ${rows.length - shown.length}곳)</button>` : ''}`
      : inRange ? `<div class="empty"><b>${hm(g.maxMin)} 안에 이 날 가격이 올라온 골프장이 없어요.</b><span>시간을 늘리거나 다른 날짜를 골라 보세요.</span></div>`
      : `<div class="empty"><b>이 날짜는 아직 가격 자료가 없어요.</b><span>가격은 앞으로 ${days.length}일(${dayLabel(days[0])} ~ ${dayLabel(days[days.length - 1])})치를 매일 모아요.</span></div>`}`;
}

/** 가격 출처 바로가기: 그 골프장·날짜의 예약 화면 */
export function offerUrl(c, src, day) {
  const ids = c.ids || {};
  const ts = ids.ts || /^ts-(\d+)$/.exec(c.id)?.[1];
  if (src === 'ts' && ts) return `https://www.teescanner.com/booking/detail?tab=teetime&golfclub_seq=${ts}&roundDay=${day}`;
  if (src === 'tu' && ids.tu) return `https://app.teeupnjoy.com/club/${ids.tu}?dateFirst=${day}`;
  if (src === 'gp') return 'https://www.golfpang.com/web/round/booking_list.do';
  if (src === 'gm') return 'https://www.golfmon.net/booking/list?tab=%EC%96%91%EB%8F%84';
  return { ts: 'https://www.teescanner.com/', tu: 'https://app.teeupnjoy.com/' }[src] || 'https://www.golfpang.com/';
}

/** 네이버 검색어: 골프장 이름만(예: "360도CC"). (P)·(M) 같은 표시는 떼고, CC·GC·골프 같은 말이 없으면 CC 를 붙인다 */
export const naverQuery = (name) => {
  const n = String(name || '').replace(/\((P|M|퍼|퍼9|대중제|회원제)\)/gi, '').replace(/\s*\([^)]*\)/g, '').replace(/\s(노캐디|셀프|임박|특가|마샬캐디)(?=\s|$).*$/, '').replace(/[-_](퍼9|퍼)$/, '').replace(/\s+/g, ' ').trim();
  return /(CC|GC|C\.C|G\.C|골프|컨트리|클럽|리조트|레이크|힐스|밸리|파크)/i.test(n) ? n : `${n}CC`;
};
const naverUrl = (name) => `https://m.search.naver.com/search.naver?query=${encodeURIComponent(naverQuery(name))}`;

/** 오른쪽 사진: 없거나 못 불러오면 깃발 그림 */
const thumb = (url) => `<span class="golf-thumb">${url ? `<img src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 21V3.5l10 4-10 4"/><path d="M4 21h10"/></svg></span>`;

const costLabel = (cost) => (cost.missing?.length ? `${cost.missing.join('·')} 미포함` : cost.estimated ? '예상 포함가' : '총비용');
const driveText = (drive) => `차로 ${drive.kind === 'kakao' ? '' : '약 '}${formatMin(drive.min)} · ${drive.km}km`;

/** 특가 꼬리표 글자: "이벤트"·"특가"·"시크릿 특가" 등 예약처 표시 그대로(길면 줄임) */
const dealText = (d) => (String(d).length > 8 ? '특가' : String(d));

/** 카드 총비용 옆 내역: 그린피 + 카트비 + 캐디피(또는 노캐디), 1인 기준 */
function costBreak(cost) {
  const est = (k) => (cost.estimated?.includes(k) ? '(예상)' : '');
  const parts = [`그린피 ${won(cost.green)}`];
  parts.push(cost.cartIncluded ? '카트비 포함' : cost.cart ? `카트비 ${won(cost.cart)}${est('카트비')}` : '카트비 모름');
  parts.push(cost.noCaddie ? '노캐디' : cost.caddie ? `캐디피 ${won(cost.caddie)}${est('캐디피')}` : '캐디피 모름');
  return parts.join('+');
}

/** 카드 아래 한 줄용 짧은 내역(넘치면 글자 크기를 줄여 한 줄), 예상값은 * 로 */
function costBreakShort(cost, fuel) {
  const n = (v) => `${Number(v || 0).toLocaleString('ko-KR')}원`;
  const est = (k) => (cost.estimated?.includes(k) ? '*' : '');
  const parts = [`그린피 ${n(cost.green)}`];
  parts.push(cost.cartIncluded ? '카트 포함' : cost.cart ? `카트비 ${n(cost.cart)}${est('카트비')}` : '카트비 ?');
  parts.push(cost.noCaddie ? '노캐디' : cost.caddie ? `캐디피 ${n(cost.caddie)}${est('캐디피')}` : '캐디피 ?');
  if (fuel) parts.push(`교통비 ${n(fuel.perPerson)}`);
  return parts.join('+');
}

function domCard({ c, cost, drive, fuel, sum }, day, rank) {
  return `
    <li class="golf-item">
      <button type="button" class="card golf-card" data-action="golf-open" data-id="${esc(c.id)}" aria-label="${rank}위 ${esc(c.name)} 상세 보기">
        <span class="pcard-rank golf-no ${rank === 1 ? 'is-top' : ''}" aria-hidden="true">${rank}</span>
        <span class="card-body">
          <span class="card-title">${esc(c.name)}${cost.deal ? ` <span class="golf-deal">${esc(dealText(cost.deal))}</span>` : ''}</span>
          <span class="card-meta">${esc(c.area.replace('>', '·'))}${c.holes ? ` · ${c.holes}홀` : ''}</span>
          <span class="card-meta golf-drive ${drive.kind}" data-fit>${esc(driveText(drive))}${fuel ? ` · 교통비 ${esc(won(fuel.perPerson))}` : ''} ${drive.kind === 'kakao' ? '' : '<em>추정</em>'}</span>
          <span class="golf-price" data-fit><b>${won(sum ?? cost.total)}</b> <small>1인 총비용</small>${cost.time ? ` <span class="golf-time">${esc(cost.time)} 티오프</span>` : ''}</span>
        </span>
        ${thumb(c.photo)}
        <span class="golf-break" data-fit="shrink">${esc(costBreakShort(cost, fuel))}${SRC[cost.src] ? `(${SRC[cost.src]})` : ''}</span>
      </button>
    </li>`;
}

/** 상세 사진: 추천 탭 여행지처럼 옆으로 넘겨 보는 사진(최대 5장) */
function photoSlides(c) {
  const photos = (c.photos?.length ? c.photos : c.photo ? [c.photo] : []).slice(0, 5);
  if (!photos.length) return '';
  const chev = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';
  return `
    <div class="sheet-photo golf-photo">
      <div class="slides" data-slides tabindex="0" role="group" aria-label="${esc(c.name)} 사진 ${photos.length}장${photos.length > 1 ? ', 옆으로 넘겨 보세요' : ''}">
        ${photos.map((src, i) => `<img src="${esc(src)}" alt="${esc(c.name)} 사진 ${i + 1}" referrerpolicy="no-referrer" ${i ? 'loading="lazy"' : ''} draggable="false">`).join('')}
      </div>
      <span class="slide-count" data-slide-count aria-hidden="true" ${photos.length > 1 ? '' : 'hidden'}>1 / ${photos.length}</span>
      <button type="button" class="slide-nav is-prev" data-action="slide" data-v="-1" aria-label="이전 사진" hidden>${chev}</button>
      <button type="button" class="slide-nav is-next" data-action="slide" data-v="1" aria-label="다음 사진" ${photos.length > 1 ? '' : 'hidden'}>${chev}</button>
    </div>`;
}

/** 카카오골프: 가격은 로그인해야 보여서 모으지 않고, 그 골프장·그 날짜 화면으로 바로 연결한다 */
function kakaoLink(c, day) {
  const kg = c.kg?.seq || c.ids?.kg;
  if (!kg) return '';
  const k = c.kg || {};
  const n = k.cnt?.[day];
  const range = k.low ? `${Math.round(k.low / 1000) / 10}만~${Math.round(k.high / 1000) / 10}만원(약 2주 그린피)` : '';
  const info = [range, n != null ? `이 날 ${n}타임` : ''].filter(Boolean).join(' · ');
  return `<li><a href="https://www.kakao.golf/golf/${encodeURIComponent(kg)}?date=${day.replace(/-/g, '')}" target="_blank" rel="noopener noreferrer"><b>카카오골프</b><span>${esc(info || '가격은 카카오골프에서 확인')}<small>정확한 시간별 가격은 카카오골프 로그인 후 확인</small></span><i aria-hidden="true">›</i></a></li>`;
}

/** 국내 골프장 상세 창 */
export function golfSheet(state, data, id) {
  const c = (data?.domestic || []).find((x) => x.id === id);
  if (!c) return '';
  const g = state.ui.golf;
  const day = g.day && g.day >= todayISO() ? g.day : state.profile.date;
  const cost = c.days?.[day];
  const drive = golfDrive(c, state.profile.origin);
  const fuel = transportCost(drive, state.profile.car, data.fuel);
  const offers = cost ? [...cost.offers].sort((a, b) => (a[3] ?? a[1]) - (b[3] ?? b[1])) : [];
  const q = encodeURIComponent(c.name);
  return `
    <div class="sheet-head">
      <div>
        <h2 class="sheet-title" id="sheet-title">${esc(c.name)}</h2>
        <p class="card-meta">${esc(c.area.replace('>', '·'))}${c.holes ? ` · ${c.holes}홀` : ''}${c.type ? ` · ${esc(c.type)}` : ''}</p>
      </div>
    </div>
    ${photoSlides(c)}
    <div class="stats">
      <div class="stat"><b>${cost ? won(cost.total + (fuel?.perPerson || 0)) : '-'}</b><span>1인 ${cost ? (fuel ? '총비용(교통비 포함)' : esc(costLabel(cost))) : '가격 없음'}</span></div>
      <div class="stat"><b>${esc(formatMin(drive.min))}</b><span>${drive.kind === 'kakao' ? '차로(카카오 길찾기)' : '차로(직선거리 추정)'}</span></div>
      <div class="stat"><b>${c.grade ? c.grade : '-'}</b><span>평점(티스캐너)</span></div>
    </div>
    ${cost ? `<p class="desc"><b>${esc(dayLabel(day))} 1인 비용${cost.time ? ` · ${esc(cost.time)} 티오프` : ''}</b>${cost.deal ? ` <span class="golf-deal">${esc(dealText(cost.deal))}</span>` : ''}<span class="golf-break-d" data-fit>${esc(costBreak(cost))}${fuel ? `+교통비 ${esc(won(fuel.perPerson))}` : ''}${SRC[cost.src] ? `(${SRC[cost.src]})` : ''}</span></p>
    ${fuel ? `<p class="muted golf-fuel">교통비 ${won(fuel.total)} = 주유비 ${won(fuel.fuel)}(왕복 ${fuel.roundKm}km ÷ 연비 ${state.profile.car.eff}km/${fuel.unit} × ${FUEL_LABEL[state.profile.car.fuel]} ${won(fuel.price)}/${fuel.unit}) + ${fuel.tollKnown ? `통행료 ${won(fuel.toll)}(왕복, 카카오 길찾기)` : `통행료 ${drive.kind === 'kakao' ? '정보 준비 중' : '모름(지도·현재 위치 출발은 거점 도시 길찾기만 통행료를 알려 줘요)'}`}${data.fuel?.date ? ` (가격 ${esc(data.fuel.date)} ${esc(data.fuel.src || '')})` : ''}</p>` : `<p class="muted golf-fuel">마이 탭 "내 차 연비"에 연료와 연비를 적으면 왕복 교통비(주유비+통행료)도 더해져요.</p>`}` : `<p class="desc">${esc(dayLabel(day))}에는 올라온 가격이 없어요.</p>`}
    ${offers.length ? `<h3 class="golf-sub">예약하러 가기 · 플랫폼별 가격</h3>
    <ul class="golf-links">
      ${offers.map(([src, price, count, total]) => `<li><a href="${esc(offerUrl(c, src, day))}" target="_blank" rel="noopener noreferrer"><b>${SRC[src] || esc(src)}</b><span>그린피 ${won(price)} · ${count}타임${total ? ` · 1인 ${won(total)}` : ''}</span><i aria-hidden="true">›</i></a></li>`).join('')}
      ${kakaoLink(c, day)}
    </ul>` : ''}
    <ul class="golf-info">
      ${c.addr ? `<li><b>주소</b> ${esc(c.addr)}</li>` : ''}
      ${c.tel ? `<li><b>전화</b> ${esc(c.tel)}</li>` : ''}
    </ul>
    <div class="sheet-actions">
      <a class="btn-secondary" href="${esc(naverUrl(c.name))}" target="_blank" rel="noopener noreferrer">네이버에서 찾기</a>
      <a class="btn-secondary" href="https://map.kakao.com/link/to/${q},${c.lat},${c.lng}" target="_blank" rel="noopener noreferrer">카카오맵 길찾기</a>
    </div>
    <p class="sample-note">가격은 ${esc(kst(data.updatedAt))}에 플랫폼(티스캐너·티업엔조이·골팡·골프몬)에 올라온 값을 모은 것이라 예약할 때 달라질 수 있어요. 1인 비용은 그린피에 카트비·캐디피(팀 요금 ÷ 4)를 더한 값이고, 모르는 항목은 같은 지역 골프장 중간값으로 채워 "예상"으로 표시해요.</p>`;
}

const HEART_SM = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-7.5-10.3A4.4 4.4 0 0 1 12 7.4a4.4 4.4 0 0 1 7.5 2.8c0 5.7-7.5 10.3-7.5 10.3z"/></svg>';
const HEART = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-7.5-10.3A4.4 4.4 0 0 1 12 7.4a4.4 4.4 0 0 1 7.5 2.8c0 5.7-7.5 10.3-7.5 10.3z"/></svg>';
const ICON_FLAG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 21V4l11 4.5L6 13"/></svg>';
const ICON_BAG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="7" width="16" height="13" rx="2"/><path d="M9 7V4h6v3"/></svg>';

// 해외 패키지 상품: 화면이 복잡해 잠시 숨김(2026-11-24 운영자 지시). 다시 보이려면 true 로 바꾸면 된다(코드·수집은 그대로 있음)
export const SHOW_PACKS = false;

function abroad(state, data) {
  const g = state.ui.golf;
  const kind = SHOW_PACKS && g.kind === 'pack' ? 'pack' : 'course';
  const t = abroadTrip(state);
  const md = (iso) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
  // 국내와 같은 모양: 왼쪽 라운딩 일정(달력) · 오른쪽 골프장/패키지 고르기
  return `
    <div class="golf-when">
      <label class="field">
        <span class="field-label">라운딩 일정</span>
        <input type="date" class="input" id="golf-ab-date" value="${esc(t.round)}" min="${esc(addDays(todayISO(), 1))}" data-field="golf-ab-date">
      </label>
      ${SHOW_PACKS ? `<div class="field">
        <span class="field-label">상품</span>
        <div class="golf-kind-seg" role="group" aria-label="해외 종류">
          <button type="button" class="${kind === 'course' ? 'is-on' : ''}" data-action="golf-kind" data-v="course" aria-pressed="${kind === 'course'}">${ICON_FLAG}<span>골프장</span></button>
          <button type="button" class="${kind === 'pack' ? 'is-on' : ''}" data-action="golf-kind" data-v="pack" aria-pressed="${kind === 'pack'}">${ICON_BAG}<span>패키지</span></button>
        </div>
      </div>` : `<div class="field">
        <span class="field-label">찜한 골프장</span>
        <button type="button" class="input golf-picks-field ${(g.picks || []).length ? 'has' : ''}" data-action="golf-picks" aria-label="찜한 골프장 ${(g.picks || []).length}곳, 합계 보기">${HEART_SM}<span>찜 ${(g.picks || []).length}곳 · 합계</span></button>
      </div>`}
    </div>
    <div class="chips golf-nights" role="group" aria-label="머무는 기간">
      ${[1, 2, 3].map((n) => `<button type="button" class="chip ${t.golfNights === n ? 'is-on' : ''}" data-action="golf-ab-nights" data-v="${n}" aria-pressed="${t.golfNights === n}">${n}박</button>`).join('')}
      ${SHOW_PACKS ? `<button type="button" class="chip golf-picks-btn ${(g.picks || []).length ? 'has' : ''}" data-action="golf-picks" aria-label="찜한 골프장 ${(g.picks || []).length}곳, 합계 보기">${HEART_SM}찜 ${(g.picks || []).length}</button>` : ''}
    </div>
    <p class="muted golf-trip">라운딩 ${t.rounds > 1 ? `${md(t.round)}~${md(t.ret)} ${t.rounds}번(${t.rounds * 18}홀)` : `${md(t.round)} 1번(18홀)`} · 항공권은 ${md(t.dep)} 출발, ${md(t.ret)} 저녁 귀국편(다음날 한국 도착) 기준</p>
    ${kind === 'pack' ? abroadPacks(state, data) : abroadCourses(state, data)}`;
}
/** 해외 일정: 가는 날짜(처음엔 마이 탭 가는 날짜)와 몇 박 며칠 → 돌아오는 날·체크아웃 날 */
const AB_STAYS = [[2, 3], [3, 4], [3, 5], [4, 6]];
const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export function abroadTrip(state) {
  // 라운딩 첫날 = 고른 날짜. 항공권은 전날 출발, 3일 라운딩 뒤 마지막 날 저녁 귀국편(다음날 한국 도착). 숙소는 전날 체크인 3박.
  const g = state.ui.golf;
  const min = addDays(todayISO(), 1);
  const pick = g.abDate || state.profile.date;
  const round = pick && pick >= min ? pick : min;
  // N박 = 라운딩 N+1번(1박 → 18홀 2번 = 36홀). 전날 출발, 마지막 라운딩 날 저녁 귀국편(다음날 한국 도착)
  // 박 수 버튼을 다시 눌러 끄면 0박 = 라운딩 1회(18홀)
  const nights = [0, 1, 2, 3].includes(Number(g.abNights)) && g.abNights !== undefined && g.abNights !== null ? Number(g.abNights) : 2;
  const rounds = nights + 1;
  const dep = addDays(round, -1), last = addDays(round, nights);
  return { round, dep, ret: last, out: last, nights: nights + 1, days: nights + 3, golfNights: nights, rounds };
}

/** 골프장 1인 비용 + 항공권(라운딩 일정 실시간 조회값 → 없으면 모아 둔 예상값) */
export function courseCost(c, trip) {
  const golf = (c.price || 0) * (trip.rounds || 1); // 라운딩 횟수만큼
  const f = fareOf(c.air?.iata, trip);
  const live = f?.state === 'ok' ? f.pick.price : null;
  const fare = live || c.air?.fare || 0;
  return { golf, rounds: trip.rounds || 1, fare, live: Boolean(live), loading: f?.state === 'loading', fareInfo: f?.state === 'ok' ? f : null, total: golf + fare };
}

/** 지금 화면에 보이는 해외 골프장 카드의 공항들(항공권 실시간 조회 대상) */
export function abroadFareNeeds(state, data) {
  const g = state.ui.golf;
  if (state.ui.tab !== 'golf' || g.mode !== 'abroad' || !data?.courses) return null;
  const trip = abroadTrip(state);
  if (g.kind === 'pack') return { trip, iatas: packRows(state, data, trip).rows.slice(0, g.max || 20).filter((t) => t.flightIncl === 'no').map((t) => t.flight?.iata || t.iata).filter(Boolean) };
  const { rows, view } = abroadRows(state, data, trip);
  if (view === 'golf') return { trip, iatas: [] }; // 1인 골프만 볼 때는 항공권을 조회하지 않는다
  const pickAir = (g.picks || []).map((id) => data.courses.find((c) => c.id === id)?.air?.iata);
  return { trip, iatas: [...rows.slice(0, g.max || 20).map((r) => r.c.air?.iata), ...pickAir].filter(Boolean) };
}

function abroadRows(state, data, trip) {
  const g = state.ui.golf;
  const tree = courseTree(data.courses);
  const conts = CONTINENTS.filter((c) => tree.has(c));
  const cont = conts.includes(g.cont) ? g.cont : '';
  const countries = cont ? [...tree.get(cont).keys()] : [];
  const country = countries.includes(g.country) ? g.country : '';
  const cities = country ? [...tree.get(cont).get(country)].sort((a, b) => b[1] - a[1]) : [];
  const city = cities.some(([n]) => n === g.city) ? g.city : '';
  const holes = ['18', '9', 'all'].includes(g.abHoles) ? g.abHoles : '18';
  // 가격 보기: 'total' = 1인 골프 비용 + 항공권(기본), 'golf' = 1인 골프 가격(1회)만
  const view = g.abView === 'golf' ? 'golf' : 'total';
  const costOf = view === 'golf' ? (c) => ({ golf: c.price || 0, rounds: 1, fare: 0, total: c.price || 0, golfOnly: true }) : (c) => courseCost(c, trip);
  const rows = courseList(data.courses, { cont, country, city, holes, costOf });
  return { rows, conts, cont, countries, country, cities, city, holes, view };
}
/** 해외 골프장(몽키트래블처럼): 대륙 → 나라 → 도시, 사진 카드, 1인당 가격 */
function abroadCourses(state, data) {
  const g = state.ui.golf;
  const trip = abroadTrip(state);
  const { rows, conts, cont, countries, country, cities, city, holes, view } = abroadRows(state, data, trip);
  const shown = rows.slice(0, g.max || 20);
  const chip = (act, v, label, on) => `<button type="button" class="chip ${on ? 'is-on' : ''}" data-action="${act}" data-v="${esc(v)}" aria-pressed="${on}">${esc(label)}</button>`;
  return `
    <h2 class="h2 mt">나라</h2>
    <div class="chips chips-wrap" role="group" aria-label="대륙">${chip('golf-cont', '', '전체', !cont)}${conts.map((c) => chip('golf-cont', c, c, c === cont)).join('')}</div>
    ${countries.length ? `<div class="chips chips-wrap" role="group" aria-label="나라">${chip('golf-country', '', `${cont} 전체`, !country)}${countries.map((c) => chip('golf-country', c, c, c === country)).join('')}</div>` : ''}
    ${cities.length > 1 ? `<div class="chips golf-cities" role="group" aria-label="도시">${chip('golf-city', '', `${country} 전체`, !city)}${cities.map(([n, k]) => chip('golf-city', n, `${n} ${k}`, n === city)).join('')}</div>` : ''}
    <div class="golf-head">
      <h2 class="h2">골프장 총 <span data-golf-total>${rows.length}</span>곳</h2>
      <div class="golf-filters">
      <button type="button" class="golf-air-toggle ${view === 'total' ? 'is-on' : ''}" data-action="golf-ab-air" aria-pressed="${view === 'total'}" aria-label="네이버 항공권 금액 ${view === 'total' ? '켜짐(누르면 1인 골프 가격만)' : '꺼짐(누르면 항공권 더하기)'}">✈️<span>항공권 포함</span></button>
      <label class="golf-filter"><span class="sr-only">홀 수</span>
        <select class="input sm" data-field="golf-ab-holes">
          <option value="18" ${holes === '18' ? 'selected' : ''}>18홀 이상</option>
          <option value="9" ${holes === '9' ? 'selected' : ''}>9홀</option>
          <option value="all" ${holes === 'all' ? 'selected' : ''}>전체</option>
        </select>
      </label>
      </div>
    </div>
    ${rows.length ? `<ol class="list golf-list">${shown.map((r, i) => courseCard(r.c, r.cost, i + 1, (g.picks || []).includes(r.c.id))).join('')}</ol>
      ${rows.length > shown.length ? `<button type="button" class="btn-secondary more-btn" data-action="golf-more">더 보기 · 다음 ${Math.min(20, rows.length - shown.length)}곳 (남은 ${rows.length - shown.length}곳)</button>` : ''}`
      : '<div class="empty"><b>이 조건의 골프장이 없어요.</b><span>홀 수 필터를 "전체"로 바꿔 보세요.</span></div>'}`;
}
const gradeText = (n) => (n ? `${Number.isInteger(n) ? n : n.toFixed(1)}성급` : '');
/** [나라-도시] 이름: 일본은 지역이 넓어 시·현(town) 이름을 쓴다 */
const cityOfCourse = (c) => (c.country === '일본' && c.town ? c.town.replace(/\(.*\)/, '') : c.city);
export const courseTitle = (c) => {
  // 이름 앞에 "[우돈 타니]"처럼 지역이 붙어 있으면 그 지역을 도시로 쓰고 이름에서는 뗀다
  const m = /^\[([^\]]+)\]\s*(.+)$/.exec(c.name);
  const city = m ? m[1] : cityOfCourse(c);
  const name = m ? m[2] : c.name;
  return `[${c.country}${city && city !== '기타' ? `-${city}` : ''}] ${name}`;
};
const placeText = (c) => [c.city, c.town].filter((x, i, a) => x && a.indexOf(x) === i).join(' · ');

/** 1인 골프만 보기 카드: 큰 숫자 = 1인 골프 가격(1회), 아래 줄 = 현지 통화와 출처 */
function courseCardGolf(c, rank, picked) {
  return `
    <li class="golf-item">
      <button type="button" class="card golf-card" data-action="golf-course" data-id="${esc(c.id)}" aria-label="${rank}위 ${esc(courseTitle(c))} 상세 보기">
        <span class="pcard-rank golf-no ${rank === 1 ? 'is-top' : ''}" aria-hidden="true">${rank}</span>
        <span class="card-body">
          <span class="card-title" data-fit="shrink">${esc(courseTitle(c))}</span>
          <span class="card-meta">${[gradeText(c.grade), c.holes ? `${c.holes}홀` : '', c.rating ? `★ ${c.rating} (${Number(c.reviews || 0).toLocaleString('ko-KR')})` : ''].filter(Boolean).map(esc).join(' · ')}</span>
          <span class="card-meta">${esc(c.air ? `${c.air.name}(${c.air.iata}) 공항${c.air.km ? `에서 약 ${c.air.km}km` : ''}` : placeText(c))}</span>
          <span class="golf-price" data-fit><b>${c.price ? won(c.price) : '-'}</b> <small>1인 골프(18홀 1회)</small></span>
        </span>
        ${thumb(c.photo)}
        <span class="golf-break" data-fit="shrink">${esc(c.price ? `몽키트래블 1인 가격 · 항공권 제외` : c.agency ? '예약 대행(그린피 별도 안내)' : '가격 정보 없음')}</span>
      </button>
      <button type="button" class="heart on-card golf-heart ${picked ? 'is-on' : ''}" data-action="golf-pick" data-id="${esc(c.id)}" aria-pressed="${picked}" aria-label="${picked ? '찜에서 빼기' : '찜하기(여러 골프장 합계 보기)'}">${HEART}</button>
    </li>`;
}

function courseCard(c, cost, rank, picked = false) {
  if (cost.golfOnly) return courseCardGolf(c, rank, picked);
  const fareTxt = cost.loading ? '항공권 조회 중…' : cost.fare ? `항공권 ${won(cost.fare)}(${cost.live ? '네이버 항공권' : '예상'})` : '항공권 확인 불가';
  const golfTxt = c.price ? `골프 ${cost.rounds > 1 ? `${won(c.price)}×${cost.rounds}회` : won(c.price)}(몽키트래블)` : c.agency ? '골프 예약 대행(그린피 별도)' : '골프 가격 없음';
  return `
    <li class="golf-item">
      <button type="button" class="card golf-card" data-action="golf-course" data-id="${esc(c.id)}" aria-label="${rank}위 ${esc(courseTitle(c))} 상세 보기">
        <span class="pcard-rank golf-no ${rank === 1 ? 'is-top' : ''}" aria-hidden="true">${rank}</span>
        <span class="card-body">
          <span class="card-title" data-fit="shrink">${esc(courseTitle(c))}</span>
          <span class="card-meta">${[gradeText(c.grade), c.holes ? `${c.holes}홀` : '', c.rating ? `★ ${c.rating} (${Number(c.reviews || 0).toLocaleString('ko-KR')})` : ''].filter(Boolean).map(esc).join(' · ')}</span>
          <span class="card-meta">${esc(c.air ? `${c.air.name}(${c.air.iata}) 공항${c.air.km ? `에서 약 ${c.air.km}km` : ''}` : placeText(c))}</span>
          <span class="golf-price" data-fit><b>${cost.total ? won(cost.total) : '-'}</b> <small>1인 골프+항공</small></span>
        </span>
        ${thumb(c.photo)}
        <span class="golf-break" data-fit="shrink">${esc(`${golfTxt}+${fareTxt}`)}</span>
      </button>
      <button type="button" class="heart on-card golf-heart ${picked ? 'is-on' : ''}" data-action="golf-pick" data-id="${esc(c.id)}" aria-pressed="${picked}" aria-label="${picked ? '찜에서 빼기' : '찜하기(여러 골프장 합계 보기)'}">${HEART}</button>
    </li>`;
}
/** 해외 골프장 상세 창 */
export function golfCourseSheet(state, data, id) {
  const c = (data?.courses || []).find((x) => x.id === id);
  if (!c) return '';
  const trip = abroadTrip(state);
  const cur = COUNTRY_CUR[c.country];
  const local = c.price && cur && cur !== 'KRW' ? localPrice(data.fx, c.price, cur) : null;
  const a = c.air;
  const md = (iso) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}` : '');
  const row = (k, v) => `<li><b>${k}</b><span>${v}</span></li>`;
  const flight = a ? (a.direct ? `인천→${esc(a.name)}(${esc(a.iata)}) 직항 ${hm(a.direct)}${a.airlines?.length ? `<small>${esc(a.airlines.join(' · '))}</small>` : ''}`
    : a.transfer ? `인천→${esc(a.name)}(${esc(a.iata)}) 경유 ${hm(a.transfer)}<small>${esc(a.via)} 경유 · 그날 직항 없음</small>` : `${esc(a.name)}(${esc(a.iata)}) · 항공 정보 확인 불가`) : '가까운 공항 확인 불가';
  return `
    <div class="sheet-head">
      <div>
        <h2 class="sheet-title" id="sheet-title">${esc(courseTitle(c))}</h2>
        <p class="card-meta">${[gradeText(c.grade), c.holes ? `${c.holes}홀` : '', placeText(c)].filter(Boolean).map(esc).join(' · ')}</p>
      </div>
    </div>
    ${photoSlides(c)}
    <div class="stats">
      <div class="stat"><b>${c.price ? won(c.price) : '-'}</b><span>1인당</span></div>
      <div class="stat"><b>${c.holes ? `${c.holes}홀` : '-'}</b><span>${c.par ? `파${c.par}` : '홀 수'}</span></div>
      <div class="stat"><b>${c.grade ? gradeText(c.grade) : '-'}</b><span>${c.rating ? `★ ${c.rating} (${Number(c.reviews || 0).toLocaleString('ko-KR')})` : '등급'}</span></div>
    </div>
    <ul class="golf-info">
      ${local ? row('현지 가격', `약 ${local} ${cur} = ${won(c.price)}`) : ''}
      ${c.agency ? row('예약', `몽키트래블 예약 대행 상품이에요${c.agencyFee ? `<small>대행 수수료 ${won(c.agencyFee)} · 그린피는 예약 후 따로 안내</small>` : ''}`) : ''}
      ${c.where ? row('위치', esc(c.where)) : ''}
      ${a ? row('공항', `${esc(a.name)}(${esc(a.iata)})${a.km ? `에서 직선 약 ${a.km}km` : ''}`) : ''}
      ${row('비행', flight)}
    </ul>
    ${a ? fareBox(c, a, trip, md) : ''}
    ${a?.fare ? `<div class="golf-fare">
      <p class="golf-fare-cmp-t">모아 둔 예상값(날짜 고정 조회)</p>
      <ul class="golf-fare-list">
        ${(a.fareSamples || []).map(([d1, d2, v]) => `<li><span>${md(d1)} 출발 · ${md(d2)} 귀국 조회</span><b>${won(v)}</b></li>`).join('')}
      </ul>
      ${(c.airCmp || []).length > 1 ? `<p class="golf-fare-cmp-t">주변 공항 비교</p><ul class="golf-fare-list">${c.airCmp.map(([iata, name, km, rec, dir]) => `<li class="${iata === a.iata ? 'is-pick' : ''}"><span>${esc(name)}(${esc(iata)}) · 골프장에서 ${km}km${dir ? ' · 직항' : ' · 경유'}</span><b>${won(rec)}${iata === a.iata ? ' 추천' : ''}</b></li>`).join('')}</ul>` : ''}
      <p class="muted">${a.fareN > 1 ? `${fareSrc(a.fareSrc)}에서 날짜를 바꿔 ${a.fareN}번 조회해 비교했어요(1인 왕복). 두 값이 크게 다르면 싼 쪽을, 비슷하면 평균을 추천가로 썼어요.` : `${fareSrc(a.fareSrc)} 1인 왕복 조회값이에요. 주변 공항끼리 비교해 가장 합리적인 공항을 추천했어요.`} 고른 날짜(${md(trip.dep)} 출발 · ${md(trip.ret)} 귀국)는 아래 버튼으로 확인해 보세요.</p>
    </div>` : ''}
    ${a ? `<div class="golf-fly">${flyLinks(a, trip).map(([n, u]) => `<a class="golf-src" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(n)}</a>`).join('')}</div>` : ''}
    ${c.stays?.length ? `<button type="button" class="shop-btn golf-stay-btn" data-action="golf-stays" data-id="${esc(c.id)}"><span class="shop-btn-icon" aria-hidden="true">🏨</span><span><b>근처 숙소</b><small>평점 높은 순 ${c.stays.length}곳</small></span></button>` : ''}
    <div class="sheet-actions golf-actions">
      <a class="btn-primary" href="${esc(`${c.url}&checkInDate=${trip.round}`)}" target="_blank" rel="noopener noreferrer">예약하러 가기(몽키트래블)</a>
    </div>
    <p class="sample-note">1인당 가격·등급·평점·사진은 ${esc(kst((data.sources || []).find((x) => x.id === 'mt')?.at || data.updatedAt))}에 몽키트래블에 올라온 값이에요(${esc(md((data.sources || []).find((x) => x.id === 'mt')?.checkIn || ''))} 라운드 기준). 포함 내역(그린피·캐디·카트)은 예약 화면에서 확인해 주세요. 항공권은 ${esc(fareSrc(a?.fareSrc))} 조회값이라 날짜에 따라 달라져요.</p>`;
}

/** 찜한 골프장 라운딩 횟수: 사용자가 정한 값, 없으면 일정의 라운딩 횟수를 골프장마다 고르게 나눈다 */
export function pickPlan(state, data) {
  const g = state.ui.golf;
  const trip = abroadTrip(state);
  const list = (g.picks || []).map((id) => data?.courses?.find((c) => c.id === id)).filter(Boolean);
  const R = trip.rounds;
  return { trip, R, rows: list.map((c, i) => {
    const auto = list.length >= R ? (i < R ? 1 : 0) : Math.floor(R / list.length) + (i < R % list.length ? 1 : 0);
    const n = Number.isInteger(g.pickN?.[c.id]) ? g.pickN[c.id] : auto;
    return { c, n };
  }) };
}

/** 찜 합계 창: 여러 골프장을 섞어 한 번에 다녀올 때 1인 예상 합계(골프 × 횟수 + 왕복 항공권 1번) */
export function golfPicksSheet(state, data) {
  const { trip, R, rows } = pickPlan(state, data);
  const md = (iso) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
  const head = `
    <div class="sheet-head">
      <div>
        <h2 class="sheet-title" id="sheet-title">찜한 골프장 합계</h2>
        <p class="card-meta">${trip.golfNights ? `${trip.golfNights}박 · 라운딩 ${md(trip.round)}~${md(trip.ret)} ${R}번` : `라운딩 ${md(trip.round)} 1번`} · ${md(trip.dep)} 출발</p>
      </div>
    </div>`;
  if (!rows.length) return `${head}<div class="empty"><b>찜한 골프장이 없어요.</b><span>골프장 카드 오른쪽 위 하트를 누르면 여기에 모여요. 여러 곳을 골라 한 번에 다녀올 때의 합계를 볼 수 있어요.</span></div>`;
  // 항공권: 라운딩이 가장 많은 골프장의 공항 기준
  const byAir = new Map();
  for (const { c, n } of rows) if (c.air?.iata) byAir.set(c.air.iata, (byAir.get(c.air.iata) || 0) + n + 0.001);
  const iata = [...byAir.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const airC = rows.find((r) => r.c.air?.iata === iata)?.c;
  const f = fareOf(iata, trip);
  const fare = f?.state === 'ok' ? f.pick.price : airC?.air?.fare || 0;
  const live = f?.state === 'ok';
  const golf = rows.reduce((s, { c, n }) => s + (c.price || 0) * n, 0);
  const used = rows.reduce((s, r) => s + r.n, 0);
  const airs = [...byAir.keys()];
  return `${head}
    <ul class="golf-picks">
      ${rows.map(({ c, n }) => `<li>
        <span class="golf-pick-ph">${c.photo ? `<img src="${esc(c.photo)}" alt="" referrerpolicy="no-referrer" loading="lazy">` : ''}</span>
        <span class="golf-pick-body"><b data-fit="shrink">${esc(courseTitle(c))}</b><small>${c.price ? `1회 ${won(c.price)}` : '가격 없음'} · ${esc(c.air ? `${c.air.name}(${c.air.iata})` : '')}</small>
          <span class="golf-pick-ctl">
            <button type="button" class="chip" data-action="golf-pick-n" data-id="${esc(c.id)}" data-v="-1" aria-label="횟수 줄이기">−</button>
            <b>${n}회</b>
            <button type="button" class="chip" data-action="golf-pick-n" data-id="${esc(c.id)}" data-v="1" aria-label="횟수 늘리기">+</button>
            <span>${won((c.price || 0) * n)}</span>
            <button type="button" class="link-btn" data-action="golf-pick" data-id="${esc(c.id)}">빼기</button>
          </span>
        </span>
      </li>`).join('')}
    </ul>
    ${used !== R ? `<p class="golf-pick-warn">라운딩 횟수 합(${used}번)이 일정(${trip.golfNights ? `${trip.golfNights}박 = ` : ''}${R}번)과 달라요. 횟수를 맞추거나 위에서 박 수를 바꿔 보세요.</p>` : ''}
    <div class="golf-fare">
      <p>골프 합계 <b>${won(golf)}</b> <small>(${used}번 라운딩)</small></p>
      <p>왕복 항공권 <b>${live ? '' : '약 '}${won(fare)}</b> <small>(${esc(airC?.air?.name || '')} ${esc(iata || '')}, ${live ? `네이버 항공권 ${md(trip.dep)}~${md(trip.ret)}` : f?.state === 'loading' ? '조회 중…' : '예상'})</small></p>
      <p class="golf-pick-total">1인 예상 합계 <b>${live ? '' : '약 '}${won(golf + fare)}</b></p>
      ${airs.length > 1 ? `<p class="muted">골프장 공항이 서로 달라요(${airs.map(esc).join(', ')}). 항공권은 라운딩이 가장 많은 ${esc(iata)} 기준이고, 다른 지역 이동비는 들어 있지 않아요.</p>` : ''}
      <p class="muted">숙박·현지 이동·카트·캐디 등은 포함하지 않은 예상값이에요.</p>
    </div>`;
}

/** 상세: 고른 라운딩 일정의 항공권(전날 출발 · 마지막 날 저녁 귀국편) */
function fareBox(c, a, trip, md) {
  const f = fareOf(a.iata, trip);
  const cost = courseCost(c, trip);
  const p = f?.state === 'ok' ? f.pick : null;
  const body = p
    ? `<p>추천 왕복 항공권 <b>${won(p.price)}</b> <small>(${esc(a.name)} ${esc(a.iata)}, 네이버 항공권)</small></p>
      <ul class="golf-fare-list">
        <li><span>가는 편 ${md(trip.dep)} ${esc(p.outDep)} → ${esc(p.outArr)} · ${esc(p.out)}</span><b></b></li>
        <li><span>오는 편 ${md(trip.ret)} ${esc(p.backDep)} → ${esc(p.backArr)} · ${esc(p.back)}</span><b></b></li>
      </ul>
      ${f.fitsAfter ? '' : '<p class="muted">마지막 날 저녁 귀국편이 없어 가장 싼 편으로 계산했어요.</p>'}
      ${f.min && f.min < p.price ? `<p class="muted">같은 날짜 전체 최저가는 ${won(f.min)}(귀국편이 라운딩 전에 출발)</p>` : ''}`
    : f?.state === 'loading' ? '<p>항공권 조회 중… (10초쯤 걸려요)</p>'
    : `<p>이 날짜 항공권을 아직 못 찾았어요.${a.fare ? ` 모아 둔 예상값 <b>약 ${won(a.fare)}</b>로 계산했어요.` : ''}</p>`;
  return `<h3 class="golf-sub">항공권 더하면 (${md(trip.dep)} 출발 · ${md(trip.ret)} 귀국)</h3>
    <div class="golf-fare">
      ${body}
      ${c.price && cost.fare ? `<p>골프 ${won(c.price)}×${cost.rounds}회(${cost.rounds * 18}홀) + 항공권 = <b>${cost.live ? '' : '약 '}${won(cost.total)}</b></p>` : ''}
    </div>`;
}

/** 항공권 값을 어디서 받았는지 */
const fareSrc = (s) => (s === 'naver' ? '네이버 항공권' : '구글 항공편');

/** 항공권 최저가 비교 바로가기(인천 출발, 고른 날짜) */
function flyLinks(a, t) {
  const d1 = t.dep.replace(/-/g, ''), d2 = t.ret.replace(/-/g, '');
  const i = a.iata.toLowerCase();
  return [
    ['네이버 항공권', `https://flight.naver.com/flights/international/ICN-${a.iata}-${d1}/${a.iata}-ICN-${d2}?adult=1&fareType=Y`],
    ['스카이스캐너', `https://www.skyscanner.co.kr/transport/flights/icn/${i}/${d1.slice(2)}/${d2.slice(2)}/`],
    ['구글 항공편', `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights from ICN to ${a.iata} on ${t.dep} through ${t.ret}`)}&hl=ko&gl=KR&curr=KRW`],
  ];
}

/** 근처 숙소 창(추천 탭 맛집처럼 한 단계 안쪽): 부킹닷컴 평점 높은 순 5곳 */
export function golfStaysSheet(state, data, id) {
  const c = (data?.courses || []).find((x) => x.id === id);
  if (!c) return '';
  const t = abroadTrip(state);
  const hs = (c.stays || []).map(([hid, km]) => ({ ...(data.hotels || {})[hid], km })).filter((h) => h.n);
  const md = (iso) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
  return `
    <div class="sheet-head">
      <div>
        <h2 class="sheet-title" id="sheet-title">${esc(courseTitle(c))} 근처 숙소</h2>
        <p class="card-meta">평점 높은 순 ${hs.length}곳 · 시내와 가까운 숙소 중 골프장에서 가까운 곳</p>
      </div>
    </div>
    ${hs.length ? `<ul class="golf-stays">${hs.map((h) => `<li><a href="${esc(`${h.url}?checkin=${t.dep}&checkout=${t.out}&group_adults=2&no_rooms=1`)}" target="_blank" rel="noopener noreferrer">
      <span class="golf-stay-body"><b>${esc(h.n)}</b><small>★ ${h.s}/10 (${Number(h.c).toLocaleString('ko-KR')})${h.st ? ` · ${h.st}성급` : ''} · 골프장에서 ${h.km}km</small><small>${esc(h.loc || '')}${h.p ? ` · 1박 약 ${won(h.p)}~` : ''}</small></span>
      ${h.ph ? `<img src="${esc(h.ph)}" alt="${esc(h.n)} 사진" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'), { className: 'golf-stay-ph' }))">` : '<span class="golf-stay-ph"></span>'}</a></li>`).join('')}</ul>
    <p class="sample-note">숙소를 누르면 부킹닷컴에서 ${md(t.dep)} 체크인 · ${md(t.out)} 체크아웃(${t.nights}박, 성인 2명)으로 열려요. 평점·1박 가격은 ${esc(md(data.hotelsCheckin || t.dep))} 1박 기준 조회값이라 고른 날짜와 다를 수 있어요.</p>`
      : '<div class="empty"><b>이 골프장 근처 숙소 정보가 아직 없어요.</b></div>'}`;
}

/** 패키지 출발 기간에 고른 날짜가 들어가는지(기간 정보가 없으면 보여 준다) */
export function departsOn(t, dep) {
  const ranges = (t.options || []).map((o) => {
    const a = /(\d{4})\.(\d{2})\.(\d{2})/.exec(o.from || ''), b = /(\d{4})\.(\d{2})\.(\d{2})/.exec(o.to || '');
    if (a && b) return [`${a[1]}-${a[2]}-${a[3]}`, `${b[1]}-${b[2]}-${b[3]}`];
    const m = /(\d{2})\.(\d{2})\s*~\s*(\d{2})\.(\d{2})/.exec(o.name || '');
    if (!m) return null;
    const y = Number(dep.slice(0, 4));
    let from = `${y}-${m[1]}-${m[2]}`, to = `${y}-${m[3]}-${m[4]}`;
    if (to < from) { if (dep.slice(5) >= `${m[1]}-${m[2]}`) to = `${y + 1}-${m[3]}-${m[4]}`; else from = `${y - 1}-${m[1]}-${m[2]}`; }
    return [from, to];
  }).filter(Boolean);
  return !ranges.length || ranges.some(([f, to]) => dep >= f && dep <= to);
}

/** 해외 패키지 상품(골프몬·티스캐너) */
/** 같은 사이트·같은 제목 상품(출발일만 다른 것)은 가장 싼 하나만 남기고 몇 개였는지 센다 */
function dedupePacks(rows) {
  const m = new Map();
  for (const t of rows) {
    const k = `${t.site || ''}|${String(t.title || '').replace(/\s+/g, ' ').trim()}`;
    const e = m.get(k);
    if (!e) m.set(k, { t, n: 1 });
    else { e.n++; if (t.price && (!e.t.price || t.price < e.t.price)) e.t = t; }
  }
  return [...m.values()].map(({ t, n }) => ({ ...t, same: n }));
}

/** 패키지 1인 합계: 항공 불포함이면 라운딩 일정 항공권(실시간 → 없으면 예상)을 더한다 */
function packCost(t, trip) {
  if (t.flightIncl !== 'no') return { fare: 0, total: t.price, live: false, loading: false };
  const f = fareOf(t.flight?.iata || t.iata, trip);
  const live = f?.state === 'ok' ? f.pick.price : null;
  const fare = live || t.flight?.fare?.min || 0;
  return { fare, live: Boolean(live), loading: f?.state === 'loading', total: t.price + fare };
}
function packRows(state, data, trip) {
  const g = state.ui.golf;
  const countries = golfCountries(data);
  const country = countries.some((c) => c.name === g.country) ? g.country : '';
  const cities = countries.find((c) => c.name === country)?.cities || [];
  const city = cities.some((c) => c.name === g.city) ? g.city : '';
  const rows = dedupePacks(golfAbroad(data, { country, city }).filter((x) => departsOn(x, trip.dep)))
    .map((t) => ({ ...t, cost: packCost(t, trip) }))
    .sort((a, b) => a.cost.total - b.cost.total);
  return { rows, countries, country, cities, city };
}

function abroadPacks(state, data) {
  const g = state.ui.golf;
  const countries = golfCountries(data);
  const country = countries.some((c) => c.name === g.country) ? g.country : '';
  const cities = countries.find((c) => c.name === country)?.cities || [];
  const city = cities.some((c) => c.name === g.city) ? g.city : '';
  const trip = abroadTrip(state);
  const { rows } = packRows(state, data, trip);
  const shown = rows.slice(0, g.max || 20);
  return `
    <h2 class="h2 mt">나라</h2>
    <div class="chips chips-wrap" role="group" aria-label="나라">
      <button type="button" class="chip ${!country ? 'is-on' : ''}" data-action="golf-country" data-v="">전체</button>
      ${countries.map((c) => `<button type="button" class="chip ${c.name === country ? 'is-on' : ''}" data-action="golf-country" data-v="${esc(c.name)}">${esc(c.name)} ${c.n}</button>`).join('')}
    </div>
    ${cities.length > 1 ? `<div class="chips golf-cities" role="group" aria-label="도시">
      <button type="button" class="chip ${!city ? 'is-on' : ''}" data-action="golf-city" data-v="">${esc(country)} 전체</button>
      ${cities.map((c) => `<button type="button" class="chip ${c.name === city ? 'is-on' : ''}" data-action="golf-city" data-v="${esc(c.name)}">${esc(c.name)} ${c.n}</button>`).join('')}
    </div>` : ''}
    <h2 class="h2 mt">패키지 상품 · 총 <span data-golf-total>${rows.length}</span>개</h2>
    ${rows.length ? `<ol class="list golf-list">${shown.map((t, i) => abroadCard(t, data, i + 1)).join('')}</ol>
      ${rows.length > shown.length ? `<button type="button" class="btn-secondary more-btn" data-action="golf-more">더 보기 · 다음 ${Math.min(20, rows.length - shown.length)}개 (남은 ${rows.length - shown.length}개)</button>` : ''}`
      : '<div class="empty"><b>이 지역 상품이 아직 없어요.</b></div>'}`;
}
function flightText(f) {
  if (!f) return '항공 정보 확인 불가';
  const when = '';
  if (f.direct) return `인천→${esc(f.iata)} 직항 ${hm(f.direct.min)}${f.direct.airlines?.length ? ` (${esc(f.direct.airlines.slice(0, 3).join('·'))})` : ''}${when}`;
  if (f.transfer) return `인천→${esc(f.iata)} 경유 ${hm(f.transfer.min)}${f.transfer.via ? ` (${esc(f.transfer.via)} 경유)` : ''} · 그날 직항 없음${when}`;
  return '항공 정보 확인 불가';
}

function abroadCard(t, data, rank) {
  return `
    <li class="golf-item">
      <button type="button" class="card golf-card" data-action="golf-tour" data-id="${esc(t.id)}" aria-label="${rank}위 ${esc(tourName(t))} 상세 보기">
        <span class="pcard-rank golf-no ${rank === 1 ? 'is-top' : ''}" aria-hidden="true">${rank}</span>
        <span class="card-body">
          <span class="card-title" data-fit="shrink">${esc(tourName(t))}</span>
          <span class="card-meta">${[stay(t), siteOf(t)].filter(Boolean).map(esc).join(' · ')}</span>
          <span class="golf-price" data-fit><b>${won(t.cost.total)}~</b> <small>1인${t.flightIncl === 'no' ? ' 상품+항공' : ''}</small></span>
        </span>
        ${thumb(t.photo)}
        <span class="golf-break" data-fit="shrink">${esc(t.flightIncl === 'no' ? `상품 ${won(t.price)}+${t.cost.loading ? '항공권 조회 중…' : t.cost.fare ? `항공권 ${won(t.cost.fare)}(${t.cost.live ? '네이버 항공권' : '예상'})` : '항공권 확인 불가'}` : inclText(t))}${t.same > 1 ? ` · 같은 상품 출발일 ${t.same}개 중 최저` : ''}</span>
      </button>
    </li>`;
}
const inclText = (t) => (t.flightIncl === 'no' ? (t.flight?.fare ? `항공 불포함 · 왕복 약 ${won(t.flight.fare.min)}~` : '항공 불포함') : t.flightIncl === 'yes' ? '항공 포함' : '항공 포함 여부 확인 필요');

/** 해외 상품 상세 창 */
export function golfTourSheet(data, id) {
  const t = (data?.abroad || []).find((x) => x.id === id);
  if (!t) return '';
  const cur = COUNTRY_CUR[t.country];
  const local = cur && cur !== 'KRW' ? localPrice(data.fx, t.price, cur) : null;
  const f = t.flight;
  const fare = t.flightIncl === 'no' ? f?.fare : null;
  const md = (iso) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
  const row = (k, v) => `<li><b>${k}</b><span>${v}</span></li>`;
  const flightRow = f?.direct ? `인천→${esc(f.iata)} 직항 ${hm(f.direct.min)}<small>${esc((f.direct.airlines || []).slice(0, 3).join(' · '))}</small>`
    : f?.transfer ? `인천→${esc(f.iata)} 경유 ${hm(f.transfer.min)}<small>${esc(f.transfer.via || '')} 경유 · 그날 직항 없음</small>` : '항공 정보 확인 불가';
  return `
    <div class="sheet-head">
      <div>
        <h2 class="sheet-title" id="sheet-title">${esc(tourName(t))}</h2>
        <p class="card-meta">${stay(t) ? `${esc(stay(t))} · ` : ''}${esc(siteOf(t))}</p>
      </div>
    </div>
    ${t.photo ? `<div class="sheet-photo golf-photo"><img src="${esc(t.photo)}" alt="" referrerpolicy="no-referrer" onerror="this.parentNode.remove()"></div>` : ''}
    <div class="stats">
      <div class="stat"><b>${won(t.price)}</b><span>상품가(최저)</span></div>
      <div class="stat"><b>${f?.direct ? hm(f.direct.min) : f?.transfer ? hm(f.transfer.min) : '-'}</b><span>${f?.direct ? '직항' : f?.transfer ? '경유' : '비행시간'}</span></div>
      <div class="stat"><b>${esc(stay(t) || '-')}</b><span>일정</span></div>
    </div>
    <ul class="golf-info">
      ${local ? row('현지 가격', `약 ${local} ${cur} = ${won(t.price)}`) : ''}
      ${row('항공', `${esc(inclText(t))}${t.airline ? `<small>${esc(t.airline)}</small>` : ''}`)}
      ${row('비행', flightRow)}
      ${row('상품명', esc(t.title))}
    </ul>
    ${fare ? `<h3 class="golf-sub">항공권 (따로 사야 해요)</h3>
    <div class="golf-fare">
      <p><b>왕복 약 ${won(fare.min)}~</b>${fare.direct && fare.direct !== fare.min ? ` · 직항 약 ${won(fare.direct)}~` : ''}</p>
      <p class="muted">${md(fare.dep)} 출발 · ${md(fare.ret)} 귀국, 1인 기준 ${esc(fareSrc(fare.src))} 조회</p>
      <p>상품가 + 항공권 = <b>약 ${won(t.price + fare.min)}~</b></p>
      <a class="btn-secondary" href="${esc(fare.url)}" target="_blank" rel="noopener noreferrer">항공권 찾아보기</a>
    </div>` : ''}
    ${t.clubs.length ? `<h3 class="golf-sub">골프장</h3><ul class="golf-info">${t.clubs.map((c) => row(esc(c.name), c.airport ? `공항에서 ${c.airport.km}km<small>차로 약 ${hm(c.airport.min)}</small>` : '공항 거리 확인 불가')).join('')}</ul>` : ''}
    ${t.options?.length ? `<h3 class="golf-sub">출발 기간별 가격</h3><ul class="golf-opts">${t.options.map((o) => `<li><span>${esc(o.name)}</span><b>${won(o.cost)}</b></li>`).join('')}</ul>` : ''}
    <div class="sheet-actions golf-actions">
      <a class="btn-primary" href="${esc(t.url)}" target="_blank" rel="noopener noreferrer">상품 보기(${esc(siteOf(t))})</a>
    </div>
    <p class="sample-note">가격·일정은 ${esc(kst(t.collectedAt || data.updatedAt))}에 ${esc(t.site || '티스캐너')}에 올라온 값이에요. 비행시간은 구글 항공편, 항공권은 ${esc(fareSrc(f?.fare?.src))} 조회값, 공항→골프장은 OpenStreetMap 도로 기준 예상값이라 실제와 다를 수 있어요.</p>`;
}

/**
 * 해외 카드 이름을 "[나라] 골프장+골프장" 으로 통일한다(광고 문구는 쓰지 않는다).
 * 골프장 이름은 상품의 골프장 목록, 없으면 상품명 속 "…CC/GC/골프클럽" 을 쓴다. 그것도 없으면 "[나라] 지역 N색 골프".
 */
const CLUB_RE = /([가-힣A-Za-z0-9'’&.]+(?:\s?(?:CC|GC|cc|gc|C\.C|G\.C|컨트리클럽|골프클럽|GOLF CLUB|Golf Club)))(?![가-힣A-Za-z])/g;
export function tourName(t) {
  const country = t.country || '해외';
  let names = (t.clubs || []).map((c) => c.name);
  if (!names.length) names = [...String(t.title).replace(/\[[^\]]*\]/g, ' ').matchAll(CLUB_RE)].map((m) => m[1]);
  names = names.map((n) => n.replace(/^#/, '').split(/\s+-\s*|-\s+/)[0].replace(/\s+/g, ' ').trim()).filter((n) => n.length >= 2);
  names = [...new Set(names)].filter((n, i, a) => !a.some((m, j) => j !== i && m !== n && m.startsWith(n) && m.length > n.length));
  const head = `[${country}${t.city ? `-${t.city}` : ''}]`;
  if (names.length) return `${head} ${names.slice(0, 3).join('+')}${names.length > 3 ? ` 외 ${names.length - 3}곳` : ''}`;
  const n = /(\d)\s*색/.exec(t.title);
  return `${head} ${n ? `${n[1]}색 ` : ''}골프`;
}

/** 일정: 제목·옵션에서 "3박5일"처럼 적힌 것만 읽는다(없으면 표시 안 함) */
export function stay(t) {
  const txt = `${t.title} ${(t.options || []).map((o) => o.name).join(' ')}`;
  const m = /(\d{1,2})\s*박\s*(\d{1,2})\s*일/.exec(txt);
  if (m) return `${m[1]}박 ${m[2]}일`;
  const d = /(\d{1,2})\s*일(?!\s*[~\-])/.exec(t.title);
  return d && Number(d[1]) <= 15 ? `${d[1]}일` : '';
}

/** 어느 사이트 상품인지: 수집한 사이트(티스캐너 등)와 실제 판매사가 다르면 같이 적는다 */
const siteOf = (t) => { const site = t.site || '티스캐너'; return t.seller && t.seller !== site ? `${site}·${t.seller}` : site; };
