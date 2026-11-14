// 마이페이지: 추천의 기준이 되는 모든 설정
import { CITIES } from '../core/geo.js';
import { NIGHT_OPTIONS } from '../core/store.js';
import { todayISO } from '../core/dates.js';
import { kidStage, KID_STAGE_LABEL, bandOf, memberLabel } from '../core/segments.js';
import { esc, icon, modeToggle } from './util.js';

function memberCard(m, index, total) {
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
      <p class="member-group">${esc(group)} 기준으로 계산돼요.</p>
    </div>`;
}

export function renderMy(state) {
  const p = state.profile;

  return `
    <div class="headline">
      <h1>마이페이지</h1>
      <p>여기서 정한 내용에 맞춰 추천과 축제가 자동으로 바뀌어요.</p>
    </div>

    <h2 class="h2">주요 검색 위치</h2>
    <p class="muted">이곳을 중심으로 주변을 찾아요. 집이 아니어도 돼요. 약속이 있는 곳 근처를 골라 두면, 그 주변에서 더 시간을 보낼 곳을 찾을 수 있어요.</p>

    <div class="loc-now" aria-live="polite">
      ${icon('pin', 20)}
      <div>
        <small>지금 검색 위치</small>
        <b>${esc(p.origin.name)}</b>
      </div>
    </div>

    <button type="button" class="btn-accent wide" data-action="use-gps">${icon('target', 18)}현재 위치 사용</button>
    ${state.ui.geoMsg ? `<p class="muted" role="status">${esc(state.ui.geoMsg)}</p>` : ''}

    <div class="picker">
      <div class="picker-head">
        <span class="field-label">또는 지도에서 고르기</span>
        <label class="jump">
          <span class="sr-only">지도를 옮길 지역</span>
          <select class="input sm" data-field="jump">
            <option value="" selected>지역으로 이동</option>
            ${CITIES.map((c) => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('')}
          </select>
        </label>
      </div>
      <div class="picker-map-wrap">
        <div id="pick-map" class="map picker-map" role="application" aria-label="검색 위치를 고르는 지도"></div>
        <span class="picker-pin" aria-hidden="true">${icon('pin', 40)}</span>
      </div>
      <p class="picker-label">지도를 움직여 핀을 원하는 곳에 맞추세요. 핀 위치: <b id="pick-label">${esc(p.origin.name)}</b></p>
      <button type="button" class="btn-dark wide" data-action="commit-pick">이 위치로 정하기</button>
    </div>

    <h2 class="h2 mt">함께 가는 사람</h2>
    <p class="muted">가중치가 큰 사람과 같은 성별·연령대가 많이 찾는 곳이 위로 올라와요.</p>
    ${p.members.map((m, i) => memberCard(m, i, p.members.length)).join('')}
    <button type="button" class="btn-add" data-action="add-member">+ 동행 추가</button>

    <h2 class="h2 mt">어떤 곳이 좋으세요?</h2>
    ${modeToggle(p.mode)}
    <p class="mode-desc">${p.mode === 'hot'
      ? '요즘 검색이 늘고 있는 곳을 먼저 추천해요.'
      : '많은 사람이 찾던 곳이지만 요즘 검색이 뜸해진 곳을 먼저 추천해요.'}</p>

    <h2 class="h2 mt">언제, 얼마나 다녀오세요?</h2>
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

    ${state.ui.installed ? '' : `
    <h2 class="h2 mt">홈 화면에 설치하기</h2>
    <div class="install">
      <img src="icons/icon-192.png" alt="" width="56" height="56">
      <div>
        <b>앱처럼 아이콘으로 열기</b>
        <p>${state.ui.canInstall
          ? '아래 버튼을 누르면 홈 화면에 어디가지 아이콘이 생겨요.'
          : '크롬 오른쪽 위 메뉴(점 3개)에서 "홈 화면에 추가"를 누르면 아이콘이 생겨요.'}</p>
      </div>
    </div>
    ${state.ui.canInstall ? '<button type="button" class="btn-dark wide" data-action="install">홈 화면에 설치</button>' : ''}`}

    <p class="footnote">설정은 이 폰에만 저장돼요. 회원가입이 없고, 위치는 거리 계산에만 쓰여요.</p>
  `;
}
