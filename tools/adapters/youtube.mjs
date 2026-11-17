// YouTube Data API v3 — 장소 이름으로 최근 영상 수를 세어 "요즘 영상으로 화제인지" 신호로 쓰려는 후보.
// 확인한 사실(2026-11-17, 공식 문서): 기본 할당량은 search.list 하루 100회, 그 밖의 호출은 하루 10,000유닛. 무료. API 키 필요.
export default {
  id: 'youtube',
  label: 'YouTube Data API',
  status: 'unapproved',
  requires: ['YOUTUBE_API_KEY'],
  dailyBudget: 90, // search.list 하루 100회 한도의 90%만 쓴다
  blockers: ['사용자의 API 키 발급·승인이 없음', '장소 이름 검색 결과의 정확도(동음이의·광고)를 아직 검증하지 못함', '한국 지역 필터(regionCode=KR)·언어 설정 검증 필요'],
  /** @returns {Promise<{ok:boolean, data?:object, error?:string}>} spot: { name, region } */
  async fetchSignals(spot, env = process.env) {
    const q = `${spot.name} ${String(spot.region || '').split(' ').slice(-1)[0]}`.trim();
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const url = `https://www.googleapis.com/youtube/v3/search?part=id&type=video&maxResults=1&regionCode=KR&relevanceLanguage=ko&publishedAfter=${encodeURIComponent(since)}&q=${encodeURIComponent(q)}&key=${env.YOUTUBE_API_KEY}`;
    const r = await fetch(url);
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    const j = await r.json();
    return { ok: true, data: { videos30d: j.pageInfo?.totalResults ?? null } };
  },
  mock: (spot) => ({ ok: true, data: { videos30d: (spot.name.length * 7) % 40 }, mock: true }),
};
