// Tripadvisor Content API — 평점·리뷰 수 후보.
// 이번 검토에서는 접근 조건·한국 데이터 제공 여부·약관·비용을 검색하지 못했다(검증 필요).
export default {
  id: 'tripadvisor',
  label: 'Tripadvisor Content API',
  status: 'unapproved',
  requires: ['TRIPADVISOR_API_KEY'],
  dailyBudget: 20,
  blockers: ['접근 권한·한국 데이터 제공 여부·상업적 이용 조건·호출 한도·비용을 아직 확인하지 못함'],
  async fetchSignals() { return { ok: false, error: '조건을 확인하지 못해 호출하지 않아요' }; },
  mock: (spot) => ({ ok: true, data: { rating: 3 + ((spot.name.length * 5) % 20) / 10 }, mock: true }),
};
