// 특가 화면
import { DEALS, DEAL_SHORTCUTS } from '../data/deals.js';
import { esc } from './util.js';

export function renderDeals() {
  return `
    <div class="headline">
      <h1>가족 나들이 특가</h1>
      <p>숙박·입장권·공연 특가를 모아 볼 수 있어요.</p>
    </div>
    <h2 class="h2 mt">특가 바로가기</h2>
    <div class="shortcuts">
      ${DEAL_SHORTCUTS.map(
        (s) => `
        <a class="shortcut" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">
          <b>${esc(s.title)}</b>
          <span>${esc(s.sub)}</span>
        </a>`
      ).join('')}
    </div>

    <h2 class="h2 mt">이번 주 눈에 띄는 특가</h2>
    <p class="muted">아래는 화면 확인용 예시예요. 실제 특가가 아니니 눌러도 서비스 첫 화면으로만 이동해요.</p>
    <ol class="list">
      ${DEALS.map(
        (d) => `
        <li>
          <a class="card deal" href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">
            <span class="card-body">
              <span class="card-title">${esc(d.title)}<span class="badge badge-type">${esc(d.tag)}</span></span>
              <span class="card-meta">${esc(d.provider)} · 예시</span>
              <span class="why">${esc(d.desc)}</span>
            </span>
            <span class="off">${esc(d.off)}</span>
          </a>
        </li>`
      ).join('')}
    </ol>
  `;
}
