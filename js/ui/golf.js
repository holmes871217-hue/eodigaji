// 골프 화면: 국내(차로 갈 수 있는 골프장, 1인 총비용 낮은 순) / 해외(나라·도시별 골프 상품, 가격 낮은 순)
import { esc } from './util.js';
import { courseTree, courseList, CONTINENTS, CONTINENT_OF, golfDomestic, golfDrive, golfDays, golfCountries, golfAbroad, won, localPrice, COUNTRY_CUR } from '../core/golf.js';
import { formatMin } from '../core/geo.js';
import { todayISO } from '../core/dates.js';

const GOLF_TIMES = [60, 90, 120, 150, 180];
const SRC = { ts: '티스캐너', gp: '골팡', tu: '티업엔조이', gm: '골프몬' };
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
  // 날짜는 마이 탭 "가는 날짜"처럼 달력에서 고른다. 처음에는 마이 탭에서 정한 가는 날짜를 쓴다.
  const day = g.day && g.day >= todayISO() ? g.day : state.profile.date;
  const inRange = days.includes(day);
  const origin = state.profile.origin;
  const rows = inRange ? golfDomestic(data, { origin, day, maxMin: g.maxMin }) : [];
  const shown = rows.slice(0, g.max || 20);
  return `
    <p class="golf-from">출발: <b>${esc(origin.name || '내 위치')}</b> <button type="button" class="link-btn" data-action="tab" data-v="my">바꾸기</button></p>
    <label class="field mt">
      <span class="field-label">치는 날짜</span>
      <input type="date" class="input" id="golf-date" value="${esc(day)}" min="${todayISO()}" data-field="golf-date">
    </label>
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

const naverUrl = (name) => `https://m.search.naver.com/search.naver?query=${encodeURIComponent(`${name.replace(/\((P|M|퍼|퍼9)\)/gi, '').trim()} 골프장 예약`)}`;

/** 오른쪽 사진: 없거나 못 불러오면 깃발 그림 */
const thumb = (url) => `<span class="golf-thumb">${url ? `<img src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 21V3.5l10 4-10 4"/><path d="M4 21h10"/></svg></span>`;

function costParts(cost) {
  const est = (k) => (cost.estimated?.includes(k) ? '(예상)' : '');
  const parts = [`그린피 ${won(cost.green)}${cost.cartIncluded ? '(카트 포함)' : ''}`];
  if (cost.cart) parts.push(`카트 ${won(cost.cart)}${est('카트비')}`);
  if (cost.caddie) parts.push(`캐디 ${won(cost.caddie)}${est('캐디피')}`);
  if (cost.noCaddie) parts.push('노캐디');
  return parts;
}
const costLabel = (cost) => (cost.missing?.length ? `${cost.missing.join('·')} 미포함` : cost.estimated ? '예상 포함가' : '총비용');
const driveText = (drive) => `차로 ${drive.kind === 'kakao' ? '' : '약 '}${formatMin(drive.min)} · ${drive.km}km`;

function domCard({ c, cost, drive }, day, rank) {
  return `
    <li>
      <button type="button" class="card golf-card" data-action="golf-open" data-id="${esc(c.id)}" aria-label="${esc(c.name)} 상세 보기">
        <span class="card-body">
          <span class="golf-top"><span class="golf-rank">${rank}위</span></span>
          <span class="card-title">${esc(c.name)}</span>
          <span class="card-meta">${esc(c.area.replace('>', '·'))}${c.holes ? ` · ${c.holes}홀` : ''}</span>
          <span class="card-meta golf-drive ${drive.kind}">${esc(driveText(drive))} ${drive.kind === 'kakao' ? '' : '<em>추정</em>'}</span>
          <span class="golf-price"><b>${won(cost.total)}</b> <small>1인 · ${esc(costLabel(cost))}</small></span>
        </span>
        ${thumb(c.photo)}
      </button>
    </li>`;
}

/** 국내 골프장 상세 창 */
export function golfSheet(state, data, id) {
  const c = (data?.domestic || []).find((x) => x.id === id);
  if (!c) return '';
  const g = state.ui.golf;
  const day = g.day && g.day >= todayISO() ? g.day : state.profile.date;
  const cost = c.days?.[day];
  const drive = golfDrive(c, state.profile.origin);
  const offers = cost ? [...cost.offers].sort((a, b) => (a[3] ?? a[1]) - (b[3] ?? b[1])) : [];
  const q = encodeURIComponent(c.name);
  return `
    <div class="sheet-head">
      <div>
        <h2 class="sheet-title" id="sheet-title">${esc(c.name)}</h2>
        <p class="card-meta">${esc(c.area.replace('>', '·'))}${c.holes ? ` · ${c.holes}홀` : ''}${c.type ? ` · ${esc(c.type)}` : ''}</p>
      </div>
    </div>
    ${c.photo ? `<div class="sheet-photo golf-photo"><img src="${esc(c.photo)}" alt="${esc(c.name)} 사진" referrerpolicy="no-referrer" onerror="this.parentNode.remove()"></div>` : ''}
    <div class="stats">
      <div class="stat"><b>${cost ? won(cost.total) : '-'}</b><span>1인 ${cost ? esc(costLabel(cost)) : '가격 없음'}</span></div>
      <div class="stat"><b>${esc(formatMin(drive.min))}</b><span>${drive.kind === 'kakao' ? '차로(카카오 길찾기)' : '차로(직선거리 추정)'}</span></div>
      <div class="stat"><b>${c.grade ? c.grade : '-'}</b><span>평점(티스캐너)</span></div>
    </div>
    ${cost ? `<p class="desc"><b>${esc(dayLabel(day))} 1인 비용</b> ${esc(costParts(cost).join(' + '))}</p>` : `<p class="desc">${esc(dayLabel(day))}에는 올라온 가격이 없어요.</p>`}
    ${offers.length ? `<h3 class="golf-sub">예약하러 가기 · 플랫폼별 가격</h3>
    <ul class="golf-links">
      ${offers.map(([src, price, count, total]) => `<li><a href="${esc(offerUrl(c, src, day))}" target="_blank" rel="noopener noreferrer"><b>${SRC[src] || esc(src)}</b><span>그린피 ${won(price)} · ${count}타임${total ? ` · 1인 ${won(total)}` : ''}</span><i aria-hidden="true">›</i></a></li>`).join('')}
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

function abroad(state, data) {
  const g = state.ui.golf;
  const kind = g.kind === 'pack' ? 'pack' : 'course';
  const seg = `
    <div class="chips golf-kind" role="group" aria-label="해외 종류">
      <button type="button" class="chip ${kind === 'course' ? 'is-on' : ''}" data-action="golf-kind" data-v="course" aria-pressed="${kind === 'course'}">골프장</button>
      <button type="button" class="chip ${kind === 'pack' ? 'is-on' : ''}" data-action="golf-kind" data-v="pack" aria-pressed="${kind === 'pack'}">패키지 상품</button>
    </div>`;
  const t = abroadTrip(state);
  const when = `
    <label class="field mt">
      <span class="field-label">가는 날짜</span>
      <input type="date" class="input" id="golf-ab-date" value="${esc(t.dep)}" min="${todayISO()}" data-field="golf-ab-date">
    </label>`;
  return when + seg + (kind === 'pack' ? abroadPacks(state, data) : abroadCourses(state, data));
}

/** 해외 일정: 가는 날짜(처음엔 마이 탭 가는 날짜)와 몇 박 며칠 → 돌아오는 날·체크아웃 날 */
const AB_STAYS = [[2, 3], [3, 4], [3, 5], [4, 6]];
const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export function abroadTrip(state) {
  const g = state.ui.golf;
  const dep = g.abDate && g.abDate >= todayISO() ? g.abDate : state.profile.date;
  const [nights, days] = AB_STAYS.find(([n, d]) => `${n}-${d}` === g.abStay) || [3, 5];
  return { dep, nights, days, ret: addDays(dep, days - 1), out: addDays(dep, nights) };
}

/** 해외 골프장(몽키트래블처럼): 대륙 → 나라 → 도시, 사진 카드, 1인당 가격 */
function abroadCourses(state, data) {
  const g = state.ui.golf;
  const tree = courseTree(data.courses);
  const conts = CONTINENTS.filter((c) => tree.has(c));
  const cont = conts.includes(g.cont) ? g.cont : '';
  const countries = cont ? [...tree.get(cont).keys()] : [];
  const country = countries.includes(g.country) ? g.country : '';
  const cities = country ? [...tree.get(cont).get(country)].sort((a, b) => b[1] - a[1]) : [];
  const city = cities.some(([n]) => n === g.city) ? g.city : '';
  const rows = courseList(data.courses, { cont, country, city });
  const shown = rows.slice(0, g.max || 20);
  const chip = (act, v, label, on) => `<button type="button" class="chip ${on ? 'is-on' : ''}" data-action="${act}" data-v="${esc(v)}" aria-pressed="${on}">${esc(label)}</button>`;
  return `
    <h2 class="h2 mt">나라</h2>
    <div class="chips chips-wrap" role="group" aria-label="대륙">${chip('golf-cont', '', '전체', !cont)}${conts.map((c) => chip('golf-cont', c, c, c === cont)).join('')}</div>
    ${countries.length ? `<div class="chips chips-wrap" role="group" aria-label="나라">${chip('golf-country', '', `${cont} 전체`, !country)}${countries.map((c) => chip('golf-country', c, c, c === country)).join('')}</div>` : ''}
    ${cities.length > 1 ? `<div class="chips golf-cities" role="group" aria-label="도시">${chip('golf-city', '', `${country} 전체`, !city)}${cities.map(([n, k]) => chip('golf-city', n, `${n} ${k}`, n === city)).join('')}</div>` : ''}
    <h2 class="h2 mt">골프장 · 총 <span data-golf-total>${rows.length}</span>곳</h2>
    ${rows.length ? `<ol class="list golf-list">${shown.map((c) => courseCard(c)).join('')}</ol>
      ${rows.length > shown.length ? `<button type="button" class="btn-secondary more-btn" data-action="golf-more">더 보기 · 다음 ${Math.min(20, rows.length - shown.length)}곳 (남은 ${rows.length - shown.length}곳)</button>` : ''}`
      : '<div class="empty"><b>이 지역 골프장이 아직 없어요.</b></div>'}`;
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

function courseCard(c) {
  const withAir = c.price && c.air?.fare ? c.price + c.air.fare : 0;
  return `
    <li>
      <button type="button" class="card golf-card mt-card" data-action="golf-course" data-id="${esc(c.id)}" aria-label="${esc(c.name)} 상세 보기">
        ${thumb(c.photo).replace('golf-thumb', 'golf-thumb mt-thumb')}
        <span class="card-body">
          <span class="card-title">${esc(courseTitle(c))}</span>
          <span class="card-meta">${[gradeText(c.grade), c.holes ? `${c.holes}홀` : ''].filter(Boolean).map(esc).join(' · ')}</span>
          <span class="card-meta">${esc(placeText(c))}</span>
          ${c.rating ? `<span class="mt-rate"><b>★ ${c.rating}</b> <small>(${Number(c.reviews || 0).toLocaleString('ko-KR')})</small></span>` : ''}
          <span class="mt-price">${c.price ? `<small>1인당</small><b>${won(c.price)}</b>` : `<small>${c.agency ? '예약 대행(그린피 별도 안내)' : '가격 정보 없음'}</small>`}</span>
          ${withAir ? `<span class="mt-air">항공 포함 약 ${won(withAir)}</span>` : c.air?.fare ? `<span class="mt-air">왕복 항공권 약 ${won(c.air.fare)}~</span>` : ''}
        </span>
      </button>
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
    ${c.photo ? `<div class="sheet-photo golf-photo"><img src="${esc(c.photo)}" alt="${esc(c.name)} 사진" referrerpolicy="no-referrer" onerror="this.parentNode.remove()"></div>` : ''}
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
    ${a?.fare ? `<h3 class="golf-sub">항공권 더하면</h3>
    <div class="golf-fare">
      <p>추천 왕복 항공권 <b>약 ${won(a.fare)}</b> <small>(${esc(a.name)} ${esc(a.iata)})</small></p>
      ${c.price ? `<p>골프 1인당 + 항공권 = <b>약 ${won(c.price + a.fare)}</b></p>` : ''}
      <ul class="golf-fare-list">
        ${(a.fareSamples || []).map(([d1, d2, v]) => `<li><span>${md(d1)} 출발 · ${md(d2)} 귀국 조회</span><b>${won(v)}</b></li>`).join('')}
      </ul>
      ${(c.airCmp || []).length > 1 ? `<p class="golf-fare-cmp-t">주변 공항 비교</p><ul class="golf-fare-list">${c.airCmp.map(([iata, name, km, rec, dir]) => `<li class="${iata === a.iata ? 'is-pick' : ''}"><span>${esc(name)}(${esc(iata)}) · 골프장에서 ${km}km${dir ? ' · 직항' : ' · 경유'}</span><b>${won(rec)}${iata === a.iata ? ' 추천' : ''}</b></li>`).join('')}</ul>` : ''}
      <p class="muted">${a.fareN > 1 ? `구글 항공편에서 날짜를 바꿔 ${a.fareN}번 조회해 비교했어요(1인 왕복). 두 값이 크게 다르면 비싼 날은 그날 직항이 없던 경우라 싼 쪽을, 비슷하면 평균을 추천가로 썼어요.` : '구글 항공편 1인 왕복 조회값이에요. 주변 공항끼리 비교해 가장 합리적인 공항을 추천했어요.'} 고른 날짜(${md(trip.dep)} 출발 · ${md(trip.ret)} 귀국)는 아래 버튼으로 확인해 보세요.</p>
    </div>` : ''}
    ${a ? `<div class="golf-fly">${flyLinks(a, trip).map(([n, u]) => `<a class="golf-src" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(n)}</a>`).join('')}</div>` : ''}
    ${c.stays?.length ? `<button type="button" class="shop-btn golf-stay-btn" data-action="golf-stays" data-id="${esc(c.id)}"><span class="shop-btn-icon" aria-hidden="true">🏨</span><span><b>근처 숙소</b><small>평점 높은 순 ${c.stays.length}곳</small></span></button>` : ''}
    <div class="sheet-actions golf-actions">
      <a class="btn-primary" href="${esc(`${c.url}&checkInDate=${trip.dep}`)}" target="_blank" rel="noopener noreferrer">예약하러 가기(몽키트래블)</a>
    </div>
    <p class="sample-note">1인당 가격·등급·평점·사진은 ${esc(kst((data.sources || []).find((x) => x.id === 'mt')?.at || data.updatedAt))}에 몽키트래블에 올라온 값이에요(${esc(md((data.sources || []).find((x) => x.id === 'mt')?.checkIn || ''))} 라운드 기준). 포함 내역(그린피·캐디·카트)은 예약 화면에서 확인해 주세요. 항공권은 구글 항공편 조회값이라 날짜에 따라 달라져요.</p>`;
}

/** 항공권 최저가 비교 바로가기(인천 출발, 고른 날짜) */
function flyLinks(a, t) {
  const d1 = t.dep.replace(/-/g, ''), d2 = t.ret.replace(/-/g, '');
  const i = a.iata.toLowerCase();
  return [
    ['구글 항공편', `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights from ICN to ${a.iata} on ${t.dep} through ${t.ret}`)}&hl=ko&gl=KR&curr=KRW`],
    ['스카이스캐너', `https://www.skyscanner.co.kr/transport/flights/icn/${i}/${d1.slice(2)}/${d2.slice(2)}/`],
    ['네이버 항공권', `https://flight.naver.com/flights/international/ICN-${a.iata}-${d1}/${a.iata}-ICN-${d2}?adult=1&fareType=Y`],
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
      ${h.ph ? `<img src="${esc(h.ph)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : '<span class="golf-stay-ph"></span>'}
      <span class="golf-stay-body"><b>${esc(h.n)}</b><small>★ ${h.s}/10 (${Number(h.c).toLocaleString('ko-KR')})${h.st ? ` · ${h.st}성급` : ''} · 골프장에서 ${h.km}km</small><small>${esc(h.loc || '')}${h.p ? ` · 1박 약 ${won(h.p)}~` : ''}</small></span></a></li>`).join('')}</ul>
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
function abroadPacks(state, data) {

  const g = state.ui.golf;
  const countries = golfCountries(data);
  const country = countries.some((c) => c.name === g.country) ? g.country : '';
  const cities = countries.find((c) => c.name === country)?.cities || [];
  const city = cities.some((c) => c.name === g.city) ? g.city : '';
  const trip = abroadTrip(state);
  const rows = golfAbroad(data, { country, city }).filter((x) => departsOn(x, trip.dep));
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
    <li>
      <button type="button" class="card golf-card" data-action="golf-tour" data-id="${esc(t.id)}" aria-label="${esc(tourName(t))} 상세 보기">
        <span class="card-body">
          <span class="golf-top"><span class="golf-rank">${rank}위</span>${stay(t) ? `<span class="golf-stay">${esc(stay(t))}</span>` : ''}</span>
          <span class="card-title">${esc(tourName(t))}</span>
          <span class="card-meta">${esc(siteOf(t))}</span>
          <span class="golf-price"><b>${won(t.price)}~</b> <small>${esc(inclText(t))}</small></span>
        </span>
        ${thumb(t.photo)}
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
      <p class="muted">${md(fare.dep)} 출발 · ${md(fare.ret)} 귀국, 1인 기준 구글 항공편 조회</p>
      <p>상품가 + 항공권 = <b>약 ${won(t.price + fare.min)}~</b></p>
      <a class="btn-secondary" href="${esc(fare.url)}" target="_blank" rel="noopener noreferrer">항공권 찾아보기</a>
    </div>` : ''}
    ${t.clubs.length ? `<h3 class="golf-sub">골프장</h3><ul class="golf-info">${t.clubs.map((c) => row(esc(c.name), c.airport ? `공항에서 ${c.airport.km}km<small>차로 약 ${hm(c.airport.min)}</small>` : '공항 거리 확인 불가')).join('')}</ul>` : ''}
    ${t.options?.length ? `<h3 class="golf-sub">출발 기간별 가격</h3><ul class="golf-opts">${t.options.map((o) => `<li><span>${esc(o.name)}</span><b>${won(o.cost)}</b></li>`).join('')}</ul>` : ''}
    <div class="sheet-actions golf-actions">
      <a class="btn-primary" href="${esc(t.url)}" target="_blank" rel="noopener noreferrer">상품 보기(${esc(siteOf(t))})</a>
    </div>
    <p class="sample-note">가격·일정은 ${esc(kst(t.collectedAt || data.updatedAt))}에 ${esc(t.site || '티스캐너')}에 올라온 값이에요. 비행시간·항공권은 구글 항공편 조회값, 공항→골프장은 OpenStreetMap 도로 기준 예상값이라 실제와 다를 수 있어요.</p>`;
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
