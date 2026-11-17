// Foursquare Places API — 장소 인기·팁 신호 후보.
// 확인한 사실(2026-11-17, 요금 안내 페이지 검색): 무료 한도 표기가 문서마다 다름(월 500회 vs 1만 회), 초과 시 1,000회당 약 $15. 저장·캐시 조건은 계정 유형별 약관 확인이 필요.
export default {
  id: 'foursquare',
  label: 'Foursquare Places API',
  status: 'unapproved',
  requires: ['FOURSQUARE_API_KEY'],
  dailyBudget: 15,
  blockers: ['비용이 발생할 수 있어 사용자 승인이 필요함', '한국 장소 데이터 품질을 아직 검증하지 못함', '결과 저장(캐시) 약관을 계정 유형별로 확인해야 함'],
  async fetchSignals() { return { ok: false, error: '비용·약관 승인이 없어 호출하지 않아요' }; },
  mock: (spot) => ({ ok: true, data: { popularity: (spot.name.length * 13) % 100 / 100 }, mock: true }),
};
