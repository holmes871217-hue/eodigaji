// 전문 시리즈 채널(예: 스튜디오 수제의 '풍자의 또간집') 수집·추출·업체 매칭.
// 공식 YouTube Data API 만 쓴다: channels.list(핸들→채널ID) · playlistItems.list(업로드 목록) · videos.list(상세).
// 자막·영상 파일·비공식 크롤링은 쓰지 않는다. 설명에서 식당을 못 뽑으면 지어내지 않고 검수 큐로 보낸다.
//
// 저장(tools/food-verify/data/):
//   series-videos.json  영상 정보(제목·설명·조회수 등). YouTube 정책에 따라 25일마다 갱신, 없어지면 삭제
//   extractions.json    영상별 식당 추출 결과(역할 포함)와 업체 매칭 결과
//   restaurants.json    실제 업체 정보(식별자·좌표·확인일). 구글 업체의 이름·주소는 약관상 저장하지 않는다
import { createHash } from 'node:crypto';
import { extractSeries, isSponsored, pickPlace, normName, SPONSOR_RULE_V, ROLE_RANK } from './lib.mjs';

const DAY = 86400000;
export const REFRESH_AFTER_DAYS = 25;
const hash = (s) => createHash('sha1').update(String(s)).digest('hex').slice(0, 16);

async function getJson(url, init, http) {
  const r = await http(url, init);
  if (!r.ok) { const e = new Error(`HTTP ${r.status}`); e.status = r.status; throw e; }
  return r.json();
}

/** 핸들(@STUDIO_SUZE)로 채널을 찾아 이름이 기대와 맞을 때만 채널 ID 를 확정한다. 맞지 않으면 null(추측하지 않는다). */
export async function resolveChannel(ch, yt, log = () => {}) {
  if (ch.id && ch.uploads) return { id: ch.id, uploads: ch.uploads, title: ch.title || '' };
  const q = ch.id ? { part: 'snippet,contentDetails', id: ch.id } : { part: 'snippet,contentDetails', forHandle: String(ch.handle || '').replace(/^@/, '') };
  const j = await yt('channels', q);
  const it = (j.items || [])[0];
  if (!it) { log(`  채널을 찾지 못함: ${ch.handle || ch.id}`); return null; }
  const title = it.snippet?.title || '';
  const norm = (x) => String(x).replace(/\s+/g, '').toLowerCase();
  if (ch.expectTitle && !norm(title).includes(norm(ch.expectTitle))) { log(`  채널 이름이 기대와 달라 확정하지 않음: "${title}" ≠ "${ch.expectTitle}"`); return null; }
  return { id: it.id, uploads: it.contentDetails?.relatedPlaylists?.uploads || '', title };
}

/** 시리즈 영상 수집. 새 영상만 받고(이미 받은 영상을 만나면 멈춤), 25일 지난 영상은 갱신한다. */
export async function collectSeries({ ch, yt, store, now, maxPages = 12, log = () => {} }) {
  const out = { newVideos: 0, refreshed: 0, removed: 0, sponsored: 0, skippedTitle: 0 };
  const info = await resolveChannel(ch, yt, log);
  if (!info || !info.uploads) return { ...out, resolved: null };
  const re = new RegExp(ch.titleFilter || '.', 'i');
  const known = store.videos;
  const wanted = [];
  let page = '';
  for (let n = 0; n < maxPages; n++) {
    const j = await yt('playlistItems', { part: 'snippet', playlistId: info.uploads, maxResults: '50', ...(page ? { pageToken: page } : {}) });
    let hitKnown = false;
    for (const it of j.items || []) {
      const id = it.snippet?.resourceId?.videoId;
      if (!id) continue;
      if (known[id]) { hitKnown = true; continue; }
      if (!re.test(it.snippet?.title || '')) { out.skippedTitle++; continue; } // 코너 영상만(또간집 제목 필터)
      wanted.push(id);
    }
    page = j.nextPageToken || '';
    if (hitKnown || !page) break; // 이미 받은 영상을 만났으면 그 뒤는 옛 영상이므로 멈춘다
  }
  const stale = Object.entries(known).filter(([, v]) => v.channelKey === ch.key && (now - v.fetchedAt > REFRESH_AFTER_DAYS * DAY || (v.sponsored && v.ruleV !== SPONSOR_RULE_V))).map(([id]) => id); // 판정 규칙이 바뀌었으면 제작지원 판정을 다시 확인한다
  const ids = [...new Set([...wanted, ...stale])];
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const j = await yt('videos', { part: 'snippet,statistics,paidProductPlacementDetails', id: batch.join(',') });
    const got = new Map((j.items || []).map((v) => [v.id, v]));
    for (const id of batch) {
      const v = got.get(id);
      const isNew = !known[id];
      if (!v) { if (!isNew) { delete known[id]; out.removed++; } continue; } // 삭제·비공개 영상은 지운다
      const sp = isSponsored(v);
      if (sp.yes) { known[id] = { id, channelKey: ch.key, channelId: v.snippet?.channelId || info.id, sponsored: true, ruleV: SPONSOR_RULE_V, why: sp.why, ctx: sp.ctx || (v.paidProductPlacementDetails?.hasPaidProductPlacement ? '(유료 광고 표시 플래그)' : ''), title: v.snippet?.title || '', publishedAt: v.snippet?.publishedAt || '', fetchedAt: now }; out.sponsored++; continue; } // 제작지원은 설명도 저장하지 않는다
      const rec = {
        id, channelKey: ch.key, url: `https://www.youtube.com/watch?v=${id}`, title: v.snippet?.title || '', channelId: v.snippet?.channelId || info.id, channelTitle: v.snippet?.channelTitle || info.title,
        publishedAt: v.snippet?.publishedAt || '', description: v.snippet?.description || '',
        viewCount: Number(v.statistics?.viewCount ?? NaN), likeCount: v.statistics?.likeCount != null ? Number(v.statistics.likeCount) : null, // 좋아요는 제공될 때만
        fetchedAt: now,
      };
      rec.descHash = hash(rec.title + '\n' + rec.description);
      known[id] = rec;
      if (isNew) out.newVideos++; else out.refreshed++;
    }
  }
  return { ...out, resolved: info };
}

// ── 업체 매칭 ─────────────────────────────────────────────
/** 설명 속 주소 힌트가 시·군·구를 담고 있지 않으면(예: "김해 장유") 영상이 소개한 지역을 덧붙여 비교한다. */
export const withRegion = (item, ctx) => (/[가-힣]+[시군구](?:\s|$)/.test(item.addr || '') ? item.addr : `${item.addr || ''} ${ctx || ''}`.trim());
const KO_REGION = /([가-힣]{1,5}(?:특별시|광역시|특별자치시|특별자치도|시|군|구))/;
/** 영상 제목·설명 줄에서 소개 지역(시·군·구)을 찾는다. 후보 지역 목록(region-trends 키)과 맞을 때만 인정. */
export function regionContext(video, regionKeys = []) {
  const text = `${video.title || ''}\n${(video.description || '').split('\n').slice(0, 12).join('\n')}`;
  const names = regionKeys.map((k) => String(k).split(' ').slice(-1)[0]); // "경기 김해시" → "김해시"
  for (const n of names) if (n && text.includes(n)) return n;
  for (const n of names) { const short = n.replace(/(특별시|광역시|시|군|구)$/, ''); if (short.length >= 2 && new RegExp(`${short}(?:편|시|군|\\s|$)`).test(text)) return n; }
  return '';
}

/** 구글 Places(서버용 키가 있을 때) 텍스트 검색으로 업체를 찾는다. 상호·주소는 저장하지 않고 장소 ID·좌표(30일)만 쓴다. */
export async function googleMatch(item, ctxRegion, { key, http, fetchReviews = false }) {
  const mask = ['places.id', 'places.displayName', 'places.formattedAddress', 'places.location', 'places.businessStatus', 'places.rating', 'places.userRatingCount', ...(fetchReviews ? ['places.reviews'] : [])].join(',');
  const j = await getJson('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': mask },
    body: JSON.stringify({ textQuery: `${ctxRegion} ${item.name}`.trim(), pageSize: 5, languageCode: 'ko', regionCode: 'KR', includedType: 'restaurant', strictTypeFiltering: false }),
  }, http);
  const rows = (j.places || []).map((r) => ({
    id: r.id, name: r.displayName?.text || '', addr: r.formattedAddress || '', lat: r.location?.latitude, lng: r.location?.longitude,
    status: r.businessStatus || '', rating: typeof r.rating === 'number' ? r.rating : null, count: r.userRatingCount || 0,
    reviews: (r.reviews || []).map((x) => ({ publishTime: x.publishTime, text: x.text?.text || x.originalText?.text || '' })),
  }));
  // pickPlace 는 카카오 모양을 받으므로 같은 모양으로 맞춰 쓴다
  const asKakao = rows.map((r) => ({ id: r.id, place_name: r.name, phone: '', address_name: r.addr, road_address_name: r.addr, x: r.lng, y: r.lat, _g: r }));
  const pick = pickPlace({ ...item, addr: withRegion(item, ctxRegion) }, asKakao);
  return { level: pick.level, why: pick.why || '', g: pick.place?._g || null };
}

/** 영상별 추출·매칭. 설명이 바뀐 영상만 다시 처리한다(변경 없으면 건너뜀). */
export async function processSeries({ store, ext, restaurants, regionKeys, now, identifyKakao, google, manual = {}, log = () => {} }) {
  const out = { processed: 0, items: 0, linked: 0, ambiguous: 0, none: 0, noItems: 0 };
  for (const v of Object.values(store.videos)) {
    if (v.sponsored) { delete ext[v.id]; continue; }
    const man = manual[v.id]; // 관리자가 영상을 보고 적은 식당(설명에 식당명이 없는 시리즈용)
    const sig = hash(v.descHash + JSON.stringify(man || null));
    if (ext[v.id]?.descHash === sig) continue; // 변경 없음 → 반복 처리하지 않는다
    const ctx = man?.regionKey || regionContext(v, regionKeys) || '';
    const ex = man?.restaurants?.length ? { items: man.restaurants.filter((r) => r.name).map((r) => ({ name: String(r.name).trim(), role: ROLE_RANK[r.role] ? r.role : 'visited', cue: 'manual', addr: r.addr || '', phone: r.phone || '', hint: '', src: r.src || '' })) } : extractSeries(v.description, ctx);
    out.processed++;
    const items = [];
    for (const it of ex.items) {
      let m = { level: 'none', key: '', why: '' };
      try {
        if (google) {
          const g = await googleMatch(it, ctx, google);
          if (g.level !== 'none' && g.g) {
            const key = `g:${g.g.id}`;
            if (g.level === 'linked') restaurants[key] = { key, name: it.name, googlePlaceId: g.g.id, lat: +g.g.lat.toFixed(5), lng: +g.g.lng.toFixed(5), coordsAt: now, matchedAt: now, level: 'linked', open: g.g.status === 'OPERATIONAL' ? true : g.g.status ? false : null, risk: google.fetchReviews ? riskOf(g.g) : undefined };
            m = { level: g.level, key: g.level === 'linked' ? key : '', why: g.why };
          } else m = { level: g.level, key: '', why: g.why };
        }
        if (m.level !== 'linked' && identifyKakao) { // 구글을 못 쓰거나 못 찾으면 카카오로 시도
          const k = await identifyKakao({ ...it, addr: withRegion(it, ctx) }, ctx);
          if (k.level === 'linked' && k.place) {
            const key = String(k.place.id);
            restaurants[key] = { ...(restaurants[key] || {}), key, name: k.place.place_name, kakaoId: String(k.place.id), lat: +Number(k.place.y).toFixed(5), lng: +Number(k.place.x).toFixed(5), matchedAt: now, level: 'linked', open: restaurants[key]?.open ?? null };
            m = { level: 'linked', key, why: '' };
          } else if (m.level === 'none') m = { level: k.level, key: '', why: k.why || '' };
        }
      } catch (e) { m = { level: 'none', key: '', why: `ERR:${e.message}` }; }
      out.items++; out[m.level === 'linked' ? 'linked' : m.level === 'ambiguous' ? 'ambiguous' : 'none']++;
      items.push({ name: it.name, role: it.role, cue: it.cue, addr: it.addr, match: m });
    }
    if (!items.length) out.noItems++;
    ext[v.id] = { descHash: sig, extractedAt: now, region: ctx, source: man?.restaurants?.length ? 'manual' : 'description', items };
  }
  return out;
}
import { reviewRisk } from './lib.mjs';
function riskOf(g) { const r = reviewRisk({ rating: g.rating, count: g.count, reviews: g.reviews }); return { level: r.level, signals: r.signals, at: Date.now() }; } // 리뷰 본문은 저장하지 않는다
export { normName };
