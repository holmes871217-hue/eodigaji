// 전국 지역 트렌드 창(B 항목): 지도에 지역별 점수를 색 원으로 보여 주고, 위쪽 지역을 목록으로 보여 준다.
// 필요한 정보만: 점수 · 최근 검색 변화 · 자료가 적을 때만 "자료 적음". 점수는 지역끼리 비교한 값(백분위)이다.
import { esc } from './util.js';
import { getRegions } from '../data/regions.js';

const changeText = (r) => {
  if (r.search == null) return '검색 변화 자료 없음';
  const pct = Math.round((r.search - 1) * 100);
  return `검색 ${pct >= 0 ? '+' : ''}${pct}%`;
};
const blogText = (r) => (r.blog == null ? '블로그 변화는 기록을 쌓는 중' : `블로그 ${Math.round((r.blog - 1) * 100) >= 0 ? '+' : ''}${Math.round((r.blog - 1) * 100)}%`);

export function trendSheet() {
  const rows = getRegions();
  if (!rows.length) {
    return `<div class="sheet-head"><div><h2 class="sheet-title" id="sheet-title">전국 지역 트렌드</h2></div></div>
      <div class="empty"><b>아직 지역 트렌드 자료가 없어요.</b><span>매일 새벽 자동으로 계산해요. 내일 다시 열어 보세요.</span></div>`;
  }
  const top = rows.filter((r) => r.conf !== 'l').slice(0, 12);
  return `
    <div class="sheet-head"><div>
      <h2 class="sheet-title" id="sheet-title">전국 지역 트렌드</h2>
      <p class="card-meta">지역끼리 비교한 핫플 점수예요. 붉을수록 요즘 뜨는 지역이에요.</p>
    </div></div>
    <div id="trend-map" class="map trend-map" role="application" aria-label="지역별 핫플 점수 지도"></div>
    <ol class="trend-list">
      ${top.map((r, i) => `
      <li>
        <span class="trend-rank">${i + 1}</span>
        <span class="trend-body">
          <b>${esc(r.key)}</b>
          <span class="card-meta">${esc(changeText(r))} · ${esc(blogText(r))}</span>
          <span class="card-meta">${esc(r.top.join(' · '))}</span>
        </span>
        <span class="trend-score" aria-label="점수 ${r.score}점">${r.score}</span>
      </li>`).join('')}
    </ol>
    <p class="sample-note">검색 변화는 네이버 검색량(최근 4주 ÷ 지난 1년), 블로그 변화는 최근 글 작성자 수 기록으로 따로 계산해요. 장소가 적은 지역(${rows.filter((r) => r.conf === 'l').length}곳)은 자료가 적어 순위에서 뺐고 지도에 흐리게 표시해요.</p>`;
}
