// 유튜브 기반 맛집 검증: 순수 함수 모음(네트워크 없음 — check-food-verify.mjs 가 그대로 시험한다).
// 설계: docs/유튜브-맛집-검증-설계.md (개정 절이 우선)

// ── 제작지원·협찬·광고 영상 제외 ─────────────────────────────
// 하나라도 해당하면 그 영상은 통째로 버린다(후보·독립 추천 수 어디에도 쓰지 않는다).
// "광고"·"협찬" 낱말만으로는 판정하지 않는다: 실제 데이터에서 또간집 정규 회차 31편이 "[또간집 선서] 맛집 광고·협찬·비즈니스 안 받겠습니다",
// "광고 맛집 전부 제외", "게스트 출연 문의 / 협찬 / 비즈니스(연락처)" 같은 안내 문구 때문에 잘못 걸렸다.
// 광고·협찬·제작지원을 "받았다/포함한다"는 긍정 표현만 인정한다.
const SPONSOR_WORDS = new RegExp([
  '제작\\s*지원', '유료\\s*광고', '광고\\s*(?:포함|영상|콘텐츠|임을|입니다|비)', '#\\s*광고', '\\[\\s*광고\\s*\\]', '\\(\\s*광고\\s*\\)',
  '(?:으?로부터|에게서)\\s*(?:협찬|광고|지원|제공)', '협찬\\s*(?:을|를)?\\s*(?:받|제공|포함|영상)', '협찬\\s*[:：]', '협찬(?:사|품|\\s*제품)',
  '제공\\s*받', '지원\\s*받', '원고료', '소정의', '체험단', '서포터즈', '브랜디드',
  '\\bAD\\b', '#\\s*ad\\b', 'sponsor', 'paid\\s*promotion', 'paid\\s*partnership',
].join('|'), 'i');
// 광고를 받지 않는다는 선언·연락처 안내는 협찬 표시가 아니므로 줄 단위로 먼저 지운다.
const NEGATED = /(?:광고|협찬|제작\s*지원|유료\s*광고)\s*(?:없|아닙|아님|아니)|(?:제작\s*지원|협찬|광고)[^\n]{0,12}(?:받지\s*않|안\s*받)/g;
const STRONG = /제작\s*지원|유료\s*광고|원고료|소정의|체험단|제공\s*받|지원\s*받/; // 이 표현이 있는 줄은 안내 문구로 지우지 않는다
const DISCLAIMER_LINE = /(?:안\s*받|받지\s*않|받지\s*아니|받질\s*않|일체\s*없|없습니다|않습니다|않겠습니다|전부\s*제외|모두\s*제외|제외\s*(?:하고|했|합)|문의|연락처|@[a-z0-9.-]+\.[a-z]{2,})/i;
export const SPONSOR_RULE_V = 3; // 판정 규칙을 바꿀 때 올린다(저장된 제작지원 판정을 한 번 다시 확인하게 함)

/** video: videos.list 한 건 { snippet:{title,description}, paidProductPlacementDetails?:{hasPaidProductPlacement} } */
export function isSponsored(video) {
  if (video?.paidProductPlacementDetails?.hasPaidProductPlacement === true) return { yes: true, why: 'flag' };
  const lines = `${video?.snippet?.title || ''}\n${video?.snippet?.description || ''}`.split(/\r?\n/).filter((l) => !(DISCLAIMER_LINE.test(l) && !STRONG.test(l)));
  const text = lines.join('\n').replace(NEGATED, ' ');
  const m = text.match(SPONSOR_WORDS);
  return m ? { yes: true, why: `word:${m[0].trim().toLowerCase()}`, ctx: text.slice(Math.max(0, m.index - 40), m.index + 60).replace(/\s+/g, ' ').trim() } : { yes: false }; // ctx: 어떤 문장 때문에 걸렸는지 점검용(60자 안팎)
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
  if (nameEq && (phoneEq || idEq || roadEq || dongEq || sigunEq)) level = 'linked'; // sigunEq: 영상이 소개한 지역(시·군·구)과 업체 주소가 같음. 같은 이름 지점이 그 지역에 둘 이상이면 pickPlace 가 모호로 돌린다
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
export function judge(refs, approved, { minChannels = 1, override, weights, now = Date.now(), open, risk } = {}) {
  if (override === 'reject') return { status: 'rejected', reasons: ['ADMIN_REJECT'], channels: 0, score: 0 };
  const okRefs = refs.filter((r) => approved.has(r.channelId));
  if (!okRefs.length) return { status: 'rejected', reasons: ['A1_UNAPPROVED_CHANNEL'], channels: 0, score: 0 };
  const channels = new Set(okRefs.map((r) => r.channelId)).size; // 같은 채널의 반복 소개는 1로 센다
  const cs = contentScore(okRefs, weights, now);
  const base = { channels, score: cs.score, top: cs.top, episodes: cs.episodes };
  if (override === 'approve') return { status: 'eligible', reasons: ['ADMIN_APPROVE'], ...base };
  if (okRefs.every((r) => r.role === 'mentioned')) return { status: 'rejected', reasons: ['A2_MENTION_ONLY'], ...base }; // 단순 언급만으로는 통과 불가
  if (channels < minChannels) return { status: 'rejected', reasons: ['A4_INSUFFICIENT_INDEPENDENT'], ...base };
  if (open === false) return { status: 'rejected', reasons: ['STATUS_CLOSED'], ...base };
  if (risk?.level === 'high') return { status: 'rejected', reasons: ['RISK_HIGH'], ...base }; // 위험 신호가 2개 이상: 허위 확정이 아니라 추천 보류
  return { status: 'eligible', reasons: [], ...base };
}

// ── 방문자 평가(조건 B) — 앱이 추천 순간에 구글 실시간 값으로 판정한다. 임계값은 [추측]이므로 설정값으로 둔다 ──
export const RATING_RULE = { minAdjusted: 4.2, minReviews: 100, prior: 4.0, priorWeight: 20 };
export function passesRating(rating, reviews, rule = RATING_RULE) {
  if (typeof rating !== 'number' || !Number.isFinite(reviews) || reviews <= 0) return false; // 평가 정보가 부족하면 통과 불가
  const adj = (rating * reviews + rule.prior * rule.priorWeight) / (reviews + rule.priorWeight);
  return reviews >= rule.minReviews && adj >= rule.minAdjusted;
}


// ══ 전문 시리즈 채널(예: 풍자의 또간집) ══════════════════════════════════════
// 영상 설명에서 소개된 식당 전체를 뽑고, 각 식당이 영상에서 어떤 역할이었는지 구분해 저장한다.
//   winner(최종 1위) > final(최종 선정) > visited(실제 방문·소개) > mentioned(단순 언급)
// 역할은 설명 글자에 근거가 있을 때만 올린다: 1위·우승 표시가 없으면 winner 로 추정하지 않는다.
export const ROLE_RANK = { mentioned: 1, visited: 2, final: 3, winner: 4 };
const CH = /^\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\s*[-–—·|)\]]?\s*(.+)$/; // 00:00 / 1:02:03 타임스탬프 줄(챕터)
const GENERIC = /^(?:오프닝|인트로|프롤로그|엔딩|아웃트로|에필로그|예고|하이라이트|광고|타임라인|다음\s*편|opening|intro|prologue|ending|outro|epilogue|preview|trailer)/i;
const WINNER_CUE = /(최종\s*1위|1위|우승|또간집\s*(?:선정|1위)|🏆|👑|winner)/i;
const FINAL_CUE = /(최종\s*(?:선정|후보|결정|결승)|결승|최종|final)/i;
const MENTION_HEAD = /(언급|참고|그\s*외|기타|추가로)/;
const ORDINAL = /^(?:\d+\s*(?:번|차)\s*(?:째)?\s*(?:식당|집|맛집)?|\d+(?:st|nd|rd|th)|[첫두세네다섯여섯일곱여덟아홉열]\s*(?:번째|째)\s*(?:식당|집|맛집)?)\s*[-–—:·|]?\s*/i;

/** 챕터 제목 한 줄 → 식당명 후보. 일반 구간(오프닝 등)은 null */
function chapterName(title) {
  const t = title.replace(/[🏆👑🥇⭐️★☆]/gu, ' ').replace(ORDINAL, '').trim();
  if (GENERIC.test(t)) return null;
  const clean = (x) => x.replace(/\([^)]*\)/g, '').replace(new RegExp(WINNER_CUE.source, 'gi'), ' ').replace(new RegExp(FINAL_CUE.source, 'gi'), ' ').replace(/(?:선정|결정|후보)/g, ' ').replace(/\s+/g, ' ').replace(/^[\s,.\-]+|[\s,.\-]+$/g, '').trim();
  const parts = t.split(/\s+[-–—:|]\s+/).map((x) => x.trim()).filter(Boolean);
  const pick = parts.map((x) => ({ raw: x, name: clean(x) })).find((x) => x.name && !/(식당|번째)$/.test(x.name) && plausibleName(x.name));
  if (!pick) return null;
  return { name: pick.name, hint: (pick.raw.match(/\(([^)]*)\)/) || [])[1] || '' };
}

/**
 * @param {string} description 영상 설명
 * @returns {{items:Array<{name,role,cue,addr,phone,hint}>, listOnly:boolean}}
 */
/** 제품 판매·제휴 안내 구간("🚀또간집 X (제품) 여기서만 최저가" 등)부터는 식당 정보가 아니므로 잘라 낸다. */
export function stripPromo(description) {
  const lines = String(description || '').split(/\r?\n/);
  const i = lines.findIndex((l) => /^\s*🚀|여기서만\s*최저가|수제샵|공식\s*최저가|판매\s*기간|\b1\s*\+\s*1\b|쿠폰|할인\s*코드/.test(l));
  return (i >= 0 ? lines.slice(0, i) : lines).join('\n');
}
export function extractSeries(description, regionCtx = '') {
  description = stripPromo(description);
  const lines = String(description || '').split(/\r?\n/);
  const found = new Map(); // normName → item
  const put = (it) => {
    const k = normName(it.name); if (!k) return;
    const prev = found.get(k);
    if (!prev || ROLE_RANK[it.role] > ROLE_RANK[prev.role]) found.set(k, { ...prev, ...it, addr: it.addr || prev?.addr || '', phone: it.phone || prev?.phone || '' });
  };
  let section = 'visited';
  for (const raw of lines) {
    const line = raw.trim(); if (!line) continue;
    const ch = line.match(CH);
    if (ch) { // 타임스탬프 챕터 = 영상 안에서 소개하는 구간
      section = 'visited';
      const c = chapterName(ch[4]); if (!c) continue;
      const cue = WINNER_CUE.test(ch[4]) ? 'winner' : FINAL_CUE.test(ch[4]) ? 'final' : '';
      put({ name: c.name, role: cue || section, cue: cue ? ch[4].match(cue === 'winner' ? WINNER_CUE : FINAL_CUE)[0] : '', addr: c.hint, phone: '', hint: c.hint });
      continue;
    }
    if (MENTION_HEAD.test(line) && line.replace(MARK, '').length < 30 && !PHONE.test(line)) { section = 'mentioned'; continue; }
    // 정보란 형식(📍 상호 : 주소 / ☎ 전화)은 기존 추출기를 쓴다
  }
  const info = extractRestaurants(description, regionCtx);
  for (const it of info.items) {
    const cueLine = String(description).split(/\r?\n/).find((l) => l.includes(it.name)) || '';
    const cue = WINNER_CUE.test(cueLine) ? 'winner' : FINAL_CUE.test(cueLine) ? 'final' : '';
    put({ name: it.name, role: cue || 'visited', cue: cue ? cueLine.match(cue === 'winner' ? WINNER_CUE : FINAL_CUE)[0] : '', addr: it.addr, phone: it.phone, hint: '' });
  }
  const items = [...found.values()].map((x) => ({ name: x.name, role: x.role, cue: x.cue || '', addr: x.addr || '', phone: x.phone || '', hint: x.hint || '' }));
  return { items, listOnly: items.length > 30 }; // 시리즈는 한 편에 여러 곳을 소개하므로 나열형 기준을 크게 둔다
}

// ── 최종 선정 점수: 가중치는 관리자가 tools/food-verify/weights.json 에서 조정한다 ──
export const DEFAULT_WEIGHTS = { winner: 5, final: 3, visited: 1, mentioned: 0.3, repeatPerEpisode: 1.5, repeatCap: 3, recent24m: 0.5, ratingTiebreak: 0.5 };
/** 전문 콘텐츠 이력 점수. 방문자 평점은 여기 들어가지 않는다(평점만 높은 식당이 위로 오지 않게). 같은 영상은 한 번만 센다. */
export function contentScore(mentions, weights = DEFAULT_WEIGHTS, now = Date.now()) {
  const w = { ...DEFAULT_WEIGHTS, ...weights };
  const best = new Map(); // videoId → 가장 높은 역할
  for (const m of mentions) { const r = m.role || 'visited'; if (!best.has(m.videoId) || ROLE_RANK[r] > ROLE_RANK[best.get(m.videoId).role]) best.set(m.videoId, { role: r, publishedAt: m.publishedAt }); }
  const list = [...best.values()];
  const top = list.reduce((a, x) => (ROLE_RANK[x.role] > ROLE_RANK[a] ? x.role : a), 'mentioned');
  const real = list.filter((x) => ROLE_RANK[x.role] >= ROLE_RANK.visited).length; // 실제 소개된 회차 수
  const repeat = Math.min(Math.max(real - 1, 0), w.repeatCap) * w.repeatPerEpisode;
  const recent = list.some((x) => x.publishedAt && now - Date.parse(x.publishedAt) <= 730 * 86400000) ? w.recent24m : 0;
  const base = w[top] ?? 0;
  return { score: +(base + repeat + recent).toFixed(2), top, episodes: real, parts: { base, repeat, recent } };
}

// ── 리뷰 위험 신호(가짜 리뷰라고 확정하지 않는다. 확인 가능한 신호만 분류하고 모자라면 unknown) ──
const EVENT_WORDS = /(이벤트|리뷰\s*(?:작성|쓰면|참여|남기)|서비스\s*(?:로\s*)?(?:제공|받)|무료\s*(?:제공|증정)|체험단|협찬|제공\s*받)/;
const bigrams = (t) => { const s = String(t).replace(/\s+/g, ''); const g = new Set(); for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2)); return g; };
const jaccard = (a, b) => { if (!a.size || !b.size) return 0; let n = 0; for (const x of a) if (b.has(x)) n++; return n / (a.size + b.size - n); };
/** info: { rating, count, reviews?: [{ publishTime(ISO), text }] }  → { level:'none'|'watch'|'high'|'unknown', signals:[코드] } */
export function reviewRisk(info) {
  const signals = [];
  const { rating, count } = info || {};
  if (typeof rating !== 'number' || !Number.isFinite(count)) return { level: 'unknown', signals: ['NO_RATING_DATA'] };
  if (rating >= 4.9 && count < 200) signals.push('PERFECT_LOW_COUNT');
  const rv = (info.reviews || []).filter((r) => r && r.text);
  const times = rv.map((r) => Date.parse(r.publishTime)).filter(Number.isFinite).sort((a, b) => a - b);
  if (times.length >= 4 && times[3] - times[0] <= 3 * 86400000) signals.push('TIME_BURST'); // 가져온 리뷰 중 4개가 3일 안에 몰림
  const bg = rv.filter((r) => r.text.length >= 20).map((r) => bigrams(r.text));
  let dup = false; for (let i = 0; i < bg.length && !dup; i++) for (let j = i + 1; j < bg.length; j++) if (jaccard(bg[i], bg[j]) >= 0.8) { dup = true; break; }
  if (dup) signals.push('DUPLICATE_TEXT');
  if (rv.filter((r) => EVENT_WORDS.test(r.text)).length >= 2) signals.push('EVENT_WORDS');
  const limited = rv.length < 3; // 공식 API 가 주는 리뷰는 최대 5개뿐이라 전체 분포는 알 수 없다
  const level = signals.length >= 2 ? 'high' : signals.length === 1 ? 'watch' : limited ? 'unknown' : 'none';
  return { level, signals, sample: rv.length };
}
