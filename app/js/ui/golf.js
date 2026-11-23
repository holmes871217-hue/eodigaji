// 골프 화면: 국내(차로 갈 수 있는 골프장, 1인 총비용 낮은 순) / 해외(나라·도시별 골프 상품, 가격 낮은 순)
import { esc } from './util.js';
import { golfDomestic, golfDays, golfCountries, golfAbroad, won, localPrice, COUNTRY_CUR } from '../core/golf.js';
import { formatMin } from '../core/geo.js';
import { todayISO } from '../core/dates.js';

const GOLF_TIMES = [60, 90, 120, 150, 180];
const SRC = { ts: '티스캐너', gp: '골팡', tu: '티업엔조이' };
const WD = ['일', '월', '화', '수', '목', '금', '토'];

const dayLabel = (iso) => { const d = new Date(`${iso}T00:00:00`); return `${d.getMonth() + 1}/${d.getDate()} (${WD[d.getDay()]})`; };
const kst = (iso) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const depLabel = (dep) => (dep ? `${Number(dep.slice(4, 6))}/${Number(dep.slice(6, 8))} ${dep.slice(8, 10)}:${dep.slice(10, 12)} 출발 예상` : '');
const hm = (min) => (min >= 60 ? `${Math.floor(min / 60)}시간${min % 60 ? ` ${min % 60}분` : ''}` : `${min}분`);

export function renderGolf(state, data) {
  const g = state.ui.golf;
  const head = `
    <div class="headline">
      <h1>골픽</h1>
    </div>
    <div class="toggle wide" role="group" aria-label="국내·해외">
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
  const day = days.includes(g.day) ? g.day : days[0];
  const origin = state.profile.origin;
  const rows = golfDomestic(data, { origin, day, maxMin: g.maxMin });
  const shown = rows.slice(0, g.max || 20);
  const kakao = data.drive?.source === 'kakao-future' && rows.some((r) => r.drive.kind === 'kakao');
  const srcs = (data.sources || []).filter((s) => s.id === 'ts' || s.id === 'gp');
  return `
    <p class="golf-from">출발: <b>${esc(origin.name || '내 위치')}</b> <button type="button" class="link-btn" data-action="tab" data-v="my">바꾸기</button></p>
    <h2 class="h2 mt">날짜</h2>
    <div class="chips" role="group" aria-label="날짜">
      ${days.map((d) => `<button type="button" class="chip ${d === day ? 'is-on' : ''}" data-action="golf-day" data-v="${d}" aria-pressed="${d === day}">${dayLabel(d)}</button>`).join('')}
    </div>
    <h2 class="h2 mt">차로 몇 시간까지</h2>
    <div class="chips" role="group" aria-label="이동시간">
      ${GOLF_TIMES.map((m) => `<button type="button" class="chip ${m === g.maxMin ? 'is-on' : ''}" data-action="golf-time" data-v="${m}" aria-pressed="${m === g.maxMin}">${hm(m)}</button>`).join('')}
    </div>
    <p class="muted golf-note">${kakao ? `이동시간: 카카오 길찾기 ${esc(depLabel(rows.find((r) => r.drive.kind === 'kakao')?.drive.dep))} 기준.` : '이동시간: 직선거리로 계산한 추정값이에요(실제 도로 기준 아님).'}</p>
    <h2 class="h2 mt">${esc(dayLabel(day))} · 총 <span data-golf-total>${rows.length}</span>곳</h2>
    <p class="muted">1인 총비용 낮은 순 · 수집 ${esc(kst(data.updatedAt))} · 출처 ${srcs.map((s) => `${esc(s.name)}${s.ok ? '' : '(실패)'}`).join('·')}</p>
    ${rows.length ? `<ol class="list golf-list">${shown.map((r, i) => domCard(r, day, i + 1)).join('')}</ol>
      ${rows.length > shown.length ? `<button type="button" class="btn-secondary more-btn" data-action="golf-more">더 보기 · 다음 ${Math.min(20, rows.length - shown.length)}곳 (남은 ${rows.length - shown.length}곳)</button>` : ''}`
      : `<div class="empty"><b>${hm(g.maxMin)} 안에 이 날 가격이 올라온 골프장이 없어요.</b><span>시간을 늘리거나 다른 날짜를 골라 보세요.</span></div>`}
    <p class="muted golf-foot">가격은 플랫폼에 올라온 값을 모은 것이라 예약 시점에 달라질 수 있어요. 카트비·캐디피는 팀(4인) 요금을 4로 나눠 더했어요.</p>`;
}

/** 가격 출처 바로가기: 그 골프장·날짜의 예약 화면 */
export function offerUrl(c, src, day) {
  const ids = c.ids || {};
  const ts = ids.ts || /^ts-(\d+)$/.exec(c.id)?.[1];
  if (src === 'ts' && ts) return `https://www.teescanner.com/booking/detail?tab=teetime&golfclub_seq=${ts}&roundDay=${day}`;
  if (src === 'tu' && ids.tu) return `https://app.teeupnjoy.com/club/${ids.tu}?dateFirst=${day}`;
  if (src === 'gp') return 'https://www.golfpang.com/web/round/booking_list.do';
  return { ts: 'https://www.teescanner.com/', tu: 'https://app.teeupnjoy.com/' }[src] || 'https://www.golfpang.com/';
}

const naverUrl = (name) => `https://m.search.naver.com/search.naver?query=${encodeURIComponent(`${name.replace(/\((P|M|퍼|퍼9)\)/gi, '').trim()} 골프장 예약`)}`;

/** 오른쪽 사진: 없거나 못 불러오면 깃발 그림 */
const thumb = (url) => `<span class="golf-thumb">${url ? `<img src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 21V3.5l10 4-10 4"/><path d="M4 21h10"/></svg></span>`;

function domCard({ c, cost, drive }, day, rank) {
  const offers = [...cost.offers].sort((a, b) => a[1] - b[1]);
  const parts = [`그린피 ${won(cost.green)}`];
  if (cost.cart) parts.push(`카트 ${won(cost.cart)}`);
  if (cost.caddie) parts.push(`캐디 ${won(cost.caddie)}`);
  if (cost.noCaddie) parts.push('노캐디');
  const best = offers[0];
  return `
    <li class="card golf-card">
      <a class="golf-main" href="${esc(offerUrl(c, best[0], day))}" target="_blank" rel="noopener noreferrer" aria-label="${esc(c.name)} ${SRC[best[0]] || ''} 예약 화면 열기">
        <span class="card-body">
          <span class="golf-rank">${rank}위</span>
          <span class="card-title">${esc(c.name)}</span>
          <span class="card-meta">${esc(c.area.replace('>', '·'))}${c.holes ? ` · ${c.holes}홀` : ''}${c.grade ? ` · 평점 ${c.grade}` : ''}</span>
          <span class="card-meta golf-drive ${drive.kind}">차로 ${drive.kind === 'kakao' ? '' : '약 '}${esc(formatMin(drive.min))} · ${drive.km}km <em>${drive.kind === 'kakao' ? '카카오 길찾기' : '직선거리 추정'}</em></span>
          <span class="golf-price"><b>${won(cost.total)}</b> <small>1인 ${cost.complete ? '총비용' : `· ${esc(cost.missing.join('·'))} 미포함`}</small></span>
          <span class="card-meta">${esc(parts.join(' + '))}</span>
        </span>
        ${thumb(c.photo)}
      </a>
      <span class="golf-offers">${offers.map(([src, price, count]) => `<a class="golf-src" href="${esc(offerUrl(c, src, day))}" target="_blank" rel="noopener noreferrer">${SRC[src] || esc(src)} ${won(price)} · ${count}타임</a>`).join('')}<a class="golf-src naver" href="${esc(naverUrl(c.name))}" target="_blank" rel="noopener noreferrer">네이버에서 찾기</a></span>
    </li>`;
}

function abroad(state, data) {
  const g = state.ui.golf;
  const countries = golfCountries(data);
  const country = countries.some((c) => c.name === g.country) ? g.country : '';
  const cities = countries.find((c) => c.name === country)?.cities || [];
  const city = cities.some((c) => c.name === g.city) ? g.city : '';
  const rows = golfAbroad(data, { country, city });
  const shown = rows.slice(0, g.max || 20);
  return `
    <h2 class="h2 mt">나라</h2>
    <div class="chips" role="group" aria-label="나라">
      <button type="button" class="chip ${!country ? 'is-on' : ''}" data-action="golf-country" data-v="">전체</button>
      ${countries.map((c) => `<button type="button" class="chip ${c.name === country ? 'is-on' : ''}" data-action="golf-country" data-v="${esc(c.name)}">${esc(c.name)} ${c.n}</button>`).join('')}
    </div>
    ${cities.length > 1 ? `<div class="chips" role="group" aria-label="도시">
      <button type="button" class="chip ${!city ? 'is-on' : ''}" data-action="golf-city" data-v="">${esc(country)} 전체</button>
      ${cities.map((c) => `<button type="button" class="chip ${c.name === city ? 'is-on' : ''}" data-action="golf-city" data-v="${esc(c.name)}">${esc(c.name)} ${c.n}</button>`).join('')}
    </div>` : ''}
    <h2 class="h2 mt">골프 상품 · 총 <span data-golf-total>${rows.length}</span>개</h2>
    <p class="muted">가격 낮은 순 · 수집 ${esc(kst(data.updatedAt))} · 출처 티스캐너 해외골프${data.fx ? ` · 환율 ${esc(data.fx.source)} ${esc(String(data.fx.at || '').replace(/ \+0000$/, ' UTC'))}` : ''}</p>
    ${rows.length ? `<ol class="list golf-list">${shown.map((t, i) => abroadCard(t, data, i + 1)).join('')}</ol>
      ${rows.length > shown.length ? `<button type="button" class="btn-secondary more-btn" data-action="golf-more">더 보기 · 다음 ${Math.min(20, rows.length - shown.length)}개 (남은 ${rows.length - shown.length}개)</button>` : ''}`
      : '<div class="empty"><b>이 지역 상품이 아직 없어요.</b></div>'}
    <p class="muted golf-foot">항공 시간은 인천 출발 기준 구글 항공편 조회값${data.flightsAt ? `(${esc(kst(data.flightsAt))} 조회)` : ''}이에요. 공항→골프장은 OpenStreetMap 도로 기준 예상값이에요.</p>`;
}

function flightText(f) {
  if (!f) return '항공 정보 확인 불가';
  const when = f.date ? ` · ${Number(f.date.slice(5, 7))}/${Number(f.date.slice(8, 10))}편 기준` : '';
  if (f.direct) return `인천→${esc(f.iata)} 직항 ${hm(f.direct.min)}${f.direct.airlines?.length ? ` (${esc(f.direct.airlines.slice(0, 3).join('·'))})` : ''}${when}`;
  if (f.transfer) return `인천→${esc(f.iata)} 경유 ${hm(f.transfer.min)}${f.transfer.via ? ` (${esc(f.transfer.via)} 경유)` : ''} · 그날 직항 없음${when}`;
  return '항공 정보 확인 불가';
}

function abroadCard(t, data, rank) {
  const cur = COUNTRY_CUR[t.country];
  const local = cur && cur !== 'KRW' ? localPrice(data.fx, t.price, cur) : null;
  const incl = t.flightIncl === 'no' ? '항공 불포함' : t.flightIncl === 'yes' ? '항공 포함' : '항공 포함 여부는 상품 페이지 확인';
  return `
    <li class="card golf-card">
      <a class="golf-main" href="${esc(t.url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(t.title)} 상품 화면 열기">
        <span class="card-body">
          <span class="golf-rank">${rank}위</span>
          <span class="card-title">${esc(t.title)}</span>
          <span class="card-meta">${esc(t.country)}${t.city ? ` · ${esc(t.city)}` : ''} · 판매 ${esc(t.seller)}</span>
          <span class="golf-price"><b>${won(t.price)}~</b> <small>상품가 · ${esc(incl)}</small></span>
          ${local ? `<span class="card-meta">≈ ${local} ${cur} (환율 환산)</span>` : ''}
          <span class="card-meta">✈ ${flightText(t.flight)}</span>
          ${t.clubs.length ? `<span class="golf-clubs">${t.clubs.map((c) => `<span>⛳ ${esc(c.name)}${c.airport ? ` · 공항에서 ${c.airport.km}km, 차로 약 ${hm(c.airport.min)}` : ' · 공항 거리 확인 불가'}</span>`).join('')}</span>` : ''}
          ${t.options?.length ? `<span class="card-meta">${t.options.slice(0, 3).map((o) => `${esc(o.name.slice(0, 40))} ${won(o.cost)}`).join(' / ')}</span>` : ''}
        </span>
        ${thumb(t.photo)}
      </a>
    </li>`;
}
