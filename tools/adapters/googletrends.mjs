// Google Trends API(알파) — 지역·검색어별 관심도 신호 후보.
// 확인한 사실(2026-11-17, Google Search Central 블로그): 2025-07 공식 알파 발표, 처음에는 제한된 개발자에게 순차 개방.
export default {
  id: 'googletrends',
  label: 'Google Trends API (알파)',
  status: 'unapproved',
  requires: ['GOOGLE_TRENDS_API_KEY'],
  dailyBudget: 50,
  blockers: ['알파 접근 권한 신청·승인 여부를 확인하지 못함', '요청 형식·한도·상업적 이용 조건 문서를 아직 검증하지 못함'],
  async fetchSignals() { return { ok: false, error: '접근 권한이 확인되지 않아 호출하지 않아요' }; },
  mock: (spot) => ({ ok: true, data: { interest: (spot.name.length * 11) % 100 }, mock: true }),
};
