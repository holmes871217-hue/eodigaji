// 마이페이지: 추천의 기준이 되는 모든 설정
import { CITIES } from '../core/geo.js';
import { NIGHT_OPTIONS } from '../core/store.js';
import { todayISO } from '../core/dates.js';
import { kidStage, KID_STAGE_LABEL, bandOf, memberLabel } from '../core/segments.js';
import { esc, icon } from './util.js';
import { TASTES, hiddenCount, prefsOf } from '../core/taste.js';

function memberCard(m, index, total, taste) {
  const stage = kidStage(m.age);
  const group = stage ? `아이 · ${KID_STAGE_LABEL[stage]}` : bandOf(m.age).label;
  const name = memberLabel(m, index);
  return `
    <div class="member">
      <div class="member-head">
        <label class="field grow">
          <span class="field-label">${index === 0 ? '나' : `동행 ${index}`} 이름(별명)</span>
          <input type="text" class="input" maxlength="10" value="${esc(m.label || '')}" placeholder="${index === 0 ? '나' : '예: 딸, 아들, 아내'}" data-field="label" data-id="${esc(m.id)}">
        </label>
        ${index > 0 && total > 1
          ? `<button type="button" class="btn-ghost danger" data-action="remove-member" data-id="${esc(m.id)}" aria-label="${esc(name)} 삭제">삭제</button>`
          : ''}
      </div>

      <div class="member-row">
        <label class="field age">
          <span class="field-label">나이</span>
          <span class="input-suffix">
            <input type="number" class="input" inputmode="numeric" min="0" max="110" value="${m.age}" data-field="age" data-id="${esc(m.id)}">
            <span>세</span>
          </span>
        </label>
        <div class="field">
          <span class="field-label">성별</span>
          <div class="toggle wide" role="group" aria-label="${esc(name)} 성별">
            <button type="button" class="toggle-btn ${m.gender === 'm' ? 'is-on' : ''}" data-action="gender" data-id="${esc(m.id)}" data-v="m" aria-pressed="${m.gender === 'm'}">남</button>
            <button type="button" class="toggle-btn ${m.gender === 'f' ? 'is-on' : ''}" data-action="gender" data-id="${esc(m.id)}" data-v="f" aria-pressed="${m.gender === 'f'}">여</button>
          </div>
        </div>
      </div>

      <div class="field">
        <span class="field-label">가중치 <em>이 사람 취향을 얼마나 반영할지</em></span>
        <div class="weights" role="group" aria-label="${esc(name)} 가중치">
          ${[1, 2, 3, 4, 5]
            .map((w) => `<button type="button" class="weight ${m.weight === w ? 'is-on' : ''}" data-action="weight" data-id="${esc(m.id)}" data-v="${w}" aria-pressed="${m.weight === w}">${w}</button>`)
            .join('')}
        </div>
      </div>
      <div class="field">
        <span class="field-label">${esc(name)}의 취향 <em>(선택)</em></span>
        <div class="chips" role="group" aria-label="${esc(name)} 취향">
          ${TASTES.map((t) => { const on = prefsOf(taste || {}, m.id).includes(t.v); return `<button type="button" class="chip ${on ? 'is-on' : ''}" data-action="taste-pref" data-id="${esc(m.id)}" data-v="${t.v}" aria-pressed="${on}">${t.icon} ${t.label}</button>`; }).join('')}
        </div>
      </div>
      <p class="member-group">${esc(group)} 기준으로 계산돼요.</p>
    </div>`;
}

export function renderMy(state) {
  const car = state.profile.car || { fuel: '', eff: null };
  const p = state.profile;

  return `
    <div class="headline">
      <h1>마이페이지</h1>
      <p>여기서 정한 내용에 맞춰 추천과 축제가 자동으로 바뀌어요.</p>
    </div>

    <h2 class="h2">언제, 얼마나 다녀오세요?</h2>
    <label class="field">
      <span class="field-label">가는 날짜</span>
      <input type="date" class="input" value="${esc(p.date)}" min="${todayISO()}" data-field="date">
    </label>
    <div class="field">
      <span class="field-label">기간</span>
      <div class="toggle wide" role="group" aria-label="기간">
        ${NIGHT_OPTIONS.map(
          (o) => `<button type="button" class="toggle-btn ${p.nights === o.v ? 'is-on' : ''}" data-action="nights" data-v="${o.v}" aria-pressed="${p.nights === o.v}">${o.label}</button>`
        ).join('')}
      </div>
    </div>
    <p class="muted">기간을 바꾸면 이동시간이 알맞게 맞춰져요(당일 2시간 · 1박 3시간 · 2박 이상 전국).</p>

    <h2 class="h2 mt">주요 검색 위치</h2>
    <p class="muted">이곳을 중심으로 주변을 찾아요. 집이 아니어도 돼요. 약속이 있는 곳 근처를 골라 두면, 그 주변에서 더 시간을 보낼 곳을 찾을 수 있어요.</p>

    <div class="loc-now" aria-live="polite">
      ${icon('pin', 20)}
      <div>
        <small>지금 검색 위치</small>
        <b>${esc(p.origin.name)}</b>
      </div>
    </div>

    <form class="loc-search" data-form="loc-search" role="search">
      <label class="sr-only" for="loc-q">장소나 주소로 찾기</label>
      <input id="loc-q" name="q" type="search" class="input" enterkeyhint="search" autocomplete="off"
        placeholder="장소·주소 검색 (예: 해방촌, 대구역)" value="${esc(state.ui.locQuery || '')}">
      <button type="submit" class="btn-dark">검색</button>
    </form>
    ${state.ui.locMsg ? `<p class="muted" role="status">${esc(state.ui.locMsg)}</p>` : ''}
    ${state.ui.locResults?.length ? `
    <ul class="loc-results" aria-label="검색 결과">
      ${state.ui.locResults.map((r, i) => `
      <li><button type="button" class="loc-result" data-action="pick-result" data-v="${i}">
        ${icon('pin', 18)}<span><b>${esc(r.name)}</b><small>${esc(r.addr || '')}</small></span>
      </button></li>`).join('')}
    </ul>` : ''}

    <button type="button" class="btn-accent wide" data-action="use-gps">${icon('target', 18)}현재 위치 사용</button>
    ${state.ui.geoMsg ? `<p class="muted" role="status">${esc(state.ui.geoMsg)}</p>` : ''}

    <div class="picker">
      <div class="picker-head">
        <span class="field-label">또는 지도에서 고르기</span>
        <label class="jump">
          <span class="sr-only">지도를 옮길 지역</span>
          <select class="input sm" data-field="jump">
            <option value="" selected>지역 선택 (검색 위치로 지정)</option>
            ${CITIES.map((c) => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('')}
          </select>
        </label>
      </div>
      <div class="picker-map-wrap">
        <div id="pick-map" class="map picker-map" role="application" aria-label="검색 위치를 고르는 지도"></div>
      </div>
      <p class="picker-label">지도에서 원하는 곳을 한 번 누르면 검색 위치가 그곳으로 옮겨져요. 지금 검색 위치: <b id="pick-label">${esc(p.origin.name)}</b></p>
    </div>

    <h2 class="h2 mt">함께 가는 사람</h2>
    <p class="muted">가중치가 큰 사람과 같은 성별·연령대가 많이 찾는 곳이 위로 올라와요. 사람마다 취향(선택)을 따로 고르면, 고른 취향에 맞는 곳이 위로 올라와요(가중치가 큰 사람의 취향을 더 반영해요). 고르지 않아도 돼요. 찜·다녀옴·별점·관심 없음 기록도 추천에 반영돼요.</p>
    ${p.members.map((m, i) => memberCard(m, i, p.members.length, state.ui.taste)).join('')}
    ${state.ui.taste && hiddenCount(state.ui.taste) ? `<p class="muted">관심 없음으로 숨긴 곳 ${hiddenCount(state.ui.taste)}곳 <button type="button" class="link-btn" data-action="taste-unhide-all">모두 다시 보기</button></p>` : ''}
    <button type="button" class="btn-add" data-action="add-member">+ 동행 추가</button>

    <h2 class="h2 mt">내 차 연비</h2>
    <p class="muted" data-fit="shrink">골픽 국내 주유비 계산용 · 왕복 거리 기준, 차 1대 1인 부담 · 비우면 계산 안 함</p>
    <div class="car-row">
      <div class="toggle car-fuel" role="group" aria-label="연료">
        ${[['gasoline', '휘발유'], ['diesel', '경유'], ['ev', '전기']].map(([v, label]) => `<button type="button" class="toggle-btn ${car.fuel === v ? 'is-on' : ''}" data-action="car-fuel" data-v="${v}" aria-pressed="${car.fuel === v}">${label}</button>`).join('')}
      </div>
      <label class="car-eff">
        <span class="sr-only">연비</span>
        <input type="number" class="input" inputmode="decimal" min="1" max="99" step="0.1" placeholder="연비" value="${car.eff ?? ''}" data-field="car-eff">
        <span class="car-unit">${car.fuel === 'ev' ? 'km/kWh' : 'km/L'}</span>
      </label>
    </div>

    ${state.ui.installed ? '' : `
    <h2 class="h2 mt">홈 화면에 설치하기</h2>
    <div class="install">
      <img src="icons/icon-192.png" alt="" width="56" height="56">
      <div>
        <b>앱처럼 아이콘으로 열기</b>
        <p>${state.ui.canInstall
          ? '아래 버튼을 누르면 홈 화면에 놀픽 아이콘이 생겨요.'
          : '크롬 오른쪽 위 메뉴(점 3개)에서 "홈 화면에 추가"를 누르면 아이콘이 생겨요.'}</p>
      </div>
    </div>
    ${state.ui.canInstall ? '<button type="button" class="btn-dark wide" data-action="install">홈 화면에 설치</button>' : ''}`}

    <p class="footnote">설정은 이 폰에만 저장돼요. 회원가입이 없고, 위치는 거리 계산에만 쓰여요.</p>
  `;
}
