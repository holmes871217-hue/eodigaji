// 신규 외부 데이터 공급원(Adapter) 목록 — 8단계. 각 공급원은 독립 파일이고, 실패해도 기존 수집·서비스에 영향이 없다.
//
// 상태(status):
//   unapproved  접근 권한·약관·한도·비용 확인이 끝나지 않음 → 호출하지 않는다. 앱에도 "운영 중"으로 표시하지 않는다.
//   approved    위 항목을 확인하고 사용자가 승인함 + 필요한 키가 환경변수에 있음 → run-adapters 가 호출해 app/data/signals/<id>.json 에 저장한다.
// 지금은 어느 것도 approved 가 아니다. approved 로 바꾸려면 해당 파일의 status 와 blockers 를 사용자 승인 후에만 고친다.
import youtube from './youtube.mjs';
import googleTrends from './googletrends.mjs';
import foursquare from './foursquare.mjs';
import tripadvisor from './tripadvisor.mjs';

export const ADAPTERS = [youtube, googleTrends, foursquare, tripadvisor];

// 제외한 공급원: TikTok — Research API 는 미국·유럽·캐나다·브라질의 학술·비영리 한정, Business API 는 광고 관리용이라 공개 콘텐츠를 읽을 수 없다(2026-11-17 확인).
export const EXCLUDED = [{ id: 'tiktok', reason: '상업 앱이 쓸 수 있는 공개 데이터 API 가 없음(Research API 는 학술·비영리 한정, Business API 는 광고 관리용)' }];

export const isLive = (a, env = process.env) => a.status === 'approved' && (a.requires || []).every((k) => env[k]);
