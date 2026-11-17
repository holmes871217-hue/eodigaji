// 유튜브 기반 맛집 검증: 순수 함수 모음(네트워크 없음 — check-food-verify.mjs 가 그대로 시험한다).
// 설계: docs/유튜브-맛집-검증-설계.md (개정 절이 우선)

// ── 제작지원·협찬·광고 영상 제외 ─────────────────────────────
// 하나라도 해당하면 그 영상은 통째로 버린다(후보·독립 추천 수 어디에도 쓰지 않는다).
const SPONSOR_WORDS = /제작\s*지원|협찬|유료\s*광고|광고\s*포함|광고|제공\s*받|지원\s*받|원고료|소정의|체험단|서포터즈|브랜디드|\bAD\b|#\s*ad\b|sponsor|paid\s*promotion|paid\s*partnership/i;
// "광고 없음·광고 아님" 같은 부정 표현은 협찬 표시가 아니므로 먼저 지운 뒤 검사한다.
const NEGATED = /(광고|협찬|제작\s*지원|유료\s*광고)\s*(없|아닙|아님|아니)/g;

/** video: videos.list 한 건 { snippet:{title,description}, paidProductPlacementDetails?:{hasPaidProductPlacement} } */
export function isSponsored(video) {
  if (video?.paidProductPlacementDetails?.hasPaidProductPlacement === true) return { yes: true, why: 'flag' };
  const text = `${video?.snippet?.title || ''}\n${video?.snippet?.description || ''}`.replace(NEGATED, ' ');
  const m = text.match(SPONSOR_WORDS);
  return m ? { yes: true, why: `word:${m[0].trim().toLowerCase()}` } : { yes: false };
}

// ── 정보란(설명)에서 맛집 정보 추출 ───────────────────────────
// 지어내지 않는다: 이름이 분명하고 (주소·전화·카카오 장소 링크·영상이 검색된 지역) 중 하나 이상 근거가 있을 때만 후보로 만든다.
const MARK = /^[\s]*(?:[📍📌🏠🍽🍴🥘🍜🍚🥩☎📞🔸🔹▶▷■□●○◆◇★☆•·\-–—*]+|\d{1,2}[.)]|\[\s*\d{1,2}\s*\])\s*/u;
const LABEL = /^(?:상호명?|가게명|업체명|매장명|식당명?|맛집|장소|위치|메뉴|주소|가는\s*길|전화번호?|전화|문의|연락처|tel|영업시간|휴무|예약|주차)\s*[:：]\s*/i;
const PHONE = /(?:0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}|1\d{3}[-.\s]?\d{4})/;
const REGION = '서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주';
const ADDR = new RegExp(`(?:${REGION})[가-힣]*(?:특별시|광역시|특별자치시|특별자치도|도)?\\s*[가-힣]+[시군구](?:\\s*[가-힣]+[구])?\\s*[가-힣0-9]*(?:로|길|동|읍|면|리)\\s*\\d*(?:[-\\d]*)`);
const KAKAO_PLACE = /place\.map\.kakao\.com\/(\d{5,})/;

/** 한 줄에서 이름 후보를 뽑는다(마커·라벨·주소·전화를 걷어 낸 앞부분). */
function nameFromLine(line) {
  let s = line.replace(MARK, '').replace(LABEL, '').trim();
  s = s.replace(/https?:\/\/\S+/g, ' ');
  s = s.split(/\s*(?:[:：|/·]|\s-\s|\s–\s|\(|\[)\s*/)[0].trim();
  s = s.replace(PHONE, '').replace(ADDR, '').trim();
  s = s.replace(/^[\s"'“”‘’<>]+|[\s"'“”‘’<>.,]+$/g, '');
  return s;
}
const plausibleName = (n) => n.length >= 2 && n.length <= 25 && /[가-힣A-Za-z]/.test(n) && !/^(?:https?|www)/i.test(n) && !/(구독|좋아요|알림|문의|제휴|비즈니스|인스타|instagram|영상|채널|광고|링크|더보기|타임|time|이메일|email|메뉴판|가격|영업시간|휴무|예약|주차|전화|주소|위치|음악|bgm|촬영|편집)/i.test(n);

/**
 * @param {string} description 영상 설명 전문
 * @param {string} searchRegion 그 영상이 검색된 지역(예: "수원"). 주소가 없을 때 근거로만 쓴다.
 * @returns {{items:Array<{name,addr,phone,kakaoId}>, listOnly:boolean}}
 */
export function extractRestaurants(description, searchRegion = '') {
  const lines = String(description || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const items = [];
  let cur = null;
  const push = () => { if (cur && cur.name) items.push(cur); cur = null; };
  for (const line of lines) {
    const kakao = line.match(KAKAO_PLACE)?.[1] || '';
    const phone = line.match(PHONE)?.[0] || '';
    const addr = line.match(ADDR)?.[0] || '';
    const marked = MARK.test(line) && !/^[\s]*(?:\d{1,2}[.)]|\[)\s*$/.test(line);
    const labeledName = /^(?:상호명?|가게명|업체명|매장명|식당명?|맛집)\s*[:：]/.test(line.replace(MARK, ''));
    const labeledOther = /^(?:주소|위치|가는\s*길|전화번호?|전화|문의|연락처|tel)\s*[:：]/i.test(line.replace(MARK, ''));
    if (labeledOther && cur) { // 앞 줄 가게의 주소·전화 보충
      cur.addr ||= addr; cur.phone ||= phone; cur.kakaoId ||= kakao; continue;
    }
    if (kakao && cur && !cur.kakaoId) { cur.kakaoId = kakao; continue; }
    if (marked || labeledName) {
      const name = nameFromLine(line);
      if (plausibleName(name)) { push(); cur = { name, addr, phone, kakaoId: kakao }; continue; }
    }
    if (cur) { // 마커 없는 이어지는 줄에 주소·전화가 있으면 보충
      if (addr && !cur.addr) cur.addr = addr;
      if (phone && !cur.phone) cur.phone = phone;
    }
  }
  push();
  // 근거 없는 후보는 버린다(주소·전화·카카오 링크가 하나도 없고, 지역도 모르는 경우)
  const ok = items.filter((r) => r.addr || r.phone || r.kakaoId || searchRegion);
  // 같은 영상 안의 중복 제거
  const seen = new Set();
  const uniq = ok.filter((r) => { const k = normName(r.name) + '|' + r.phone; if (seen.has(k)) return false; seen.add(k); return true; });
  return { items: uniq, listOnly: uniq.length > LIST_ONLY_MAX };
}
export const LIST_ONLY_MAX = 12; // [추측] 한 영상에 12곳을 넘게 나열하면 "단순 나열"로 보고 쓰지 않는다

// ── 이름·장소 일치 ────────────────────────────────────────────
export function normName(s) {
  return String(s || '').toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, '')
    .replace(/(본점|직영점|[가-힣]{1,4}점)$/u, '')
    .replace(/[\s·.,&'"’“”\-_/]/g, '');
}
const digits = (s) => String(s || '').replace(/\D/g, '');
const dongOf = (addr) => (String(addr).match(/[가-힣0-9]+(?:동|읍|면|리)(?=\s|$|\d)/) || [])[0] || '';
const roadOf = (addr) => (String(addr).match(/[가-힣0-9]+(?:로|길)\s*\d+/) || [])[0]?.replace(/\s/g, '') || '';
const sigunOf = (addr) => (String(addr).match(/[가-힣]+[시군구]/) || [])[0] || '';

/**
 * 영상 속 후보 ↔ 카카오 장소(place) 일치도.
 * 자동 연결(linked): 이름이 같고, 전화·도로명·동·카카오 링크 중 하나가 맞을 때.
 * 그 밖에 이름이 비슷하거나 근거가 하나뿐이면 ambiguous(검수). 이름도 다르면 none.
 */
export function matchScore(cand, place) {
  const a = normName(cand.name), b = normName(place.place_name);
  const nameEq = a && a === b;
  const nameLike = !nameEq && a && b && (a.includes(b) || b.includes(a)) && Math.min(a.length, b.length) >= 3;
  const phoneEq = digits(cand.phone).length >= 8 && digits(cand.phone) === digits(place.phone);
  const idEq = cand.kakaoId && cand.kakaoId === String(place.id);
  const road = roadOf(cand.addr), pRoad = roadOf(place.road_address_name || '');
  const roadEq = road && pRoad && road === pRoad;
  const dong = dongOf(cand.addr);
  const dongEq = dong && (String(place.address_name || '').includes(dong) || String(place.road_address_name || '').includes(dong));
  const sigunEq = sigunOf(cand.addr) && String(place.address_name || '').includes(sigunOf(cand.addr));
  let level = 'none';
  if (nameEq && (phoneEq || idEq || roadEq || dongEq)) level = 'linked';
  else if (idEq && (nameEq || nameLike)) level = 'linked';
  else if (nameEq || nameLike || (idEq)) level = 'ambiguous';
  return { level, nameEq, nameLike, phoneEq, idEq, roadEq, dongEq, sigunEq };
}

/** 카카오 검색 결과 목록에서 가장 알맞은 한 곳을 고른다. 같은 이름 지점이 둘 이상 같은 근거로 맞으면 모호(ambiguous). */
export function pickPlace(cand, places) {
  const scored = places.map((p) => ({ p, m: matchScore(cand, p) })).filter((x) => x.m.level !== 'none');
  const linked = scored.filter((x) => x.m.level === 'linked');
  if (linked.length === 1) return { level: 'linked', place: linked[0].p };
  if (linked.length > 1) return { level: 'ambiguous', place: null, why: 'MULTI_BRANCH' };
  if (scored.length) return { level: 'ambiguous', place: scored[0].p, why: 'WEAK_MATCH' };
  return { level: 'none', place: null };
}

// ── 판정(점수 합산 없음: 모든 필수 조건을 통과해야 eligible) ──────────
/**
 * @param {Array} refs 한 식당(place_key)을 추천한 영상들: [{ videoId, channelId, publishedAt }]  (제작지원 영상은 이미 빠져 있음)
 * @param {Set<string>} approved 승인된 채널 ID
 * @param {{minChannels?:number, override?:'approve'|'reject'|undefined}} opts
 * @returns {{status:'eligible'|'rejected'|'pending', reasons:string[], channels:number}}
 */
export function judge(refs, approved, { minChannels = 1, override } = {}) {
  if (override === 'reject') return { status: 'rejected', reasons: ['ADMIN_REJECT'], channels: 0 };
  const okRefs = refs.filter((r) => approved.has(r.channelId));
  if (!okRefs.length) return { status: 'rejected', reasons: ['A1_UNAPPROVED_CHANNEL'], channels: 0 };
  const channels = new Set(okRefs.map((r) => r.channelId)).size; // 같은 채널의 반복 소개는 1로 센다
  if (override === 'approve') return { status: 'eligible', reasons: ['ADMIN_APPROVE'], channels };
  if (channels < minChannels) return { status: 'rejected', reasons: ['A4_INSUFFICIENT_INDEPENDENT'], channels };
  return { status: 'eligible', reasons: [], channels };
}

// ── 방문자 평가(조건 B) — 앱이 추천 순간에 구글 실시간 값으로 판정한다. 임계값은 [추측]이므로 설정값으로 둔다 ──
export const RATING_RULE = { minAdjusted: 4.2, minReviews: 100, prior: 4.0, priorWeight: 20 };
export function passesRating(rating, reviews, rule = RATING_RULE) {
  if (typeof rating !== 'number' || !Number.isFinite(reviews) || reviews <= 0) return false; // 평가 정보가 부족하면 통과 불가
  const adj = (rating * reviews + rule.prior * rule.priorWeight) / (reviews + rule.priorWeight);
  return reviews >= rule.minReviews && adj >= rule.minAdjusted;
}
