// 유튜브 기반 맛집 검증 실행기. 설계: docs/유튜브-맛집-검증-설계.md (개정 절이 우선)
//
// 흐름: "{지역} 맛집" 검색(search.list) → 영상 상세(videos.list: 정보란·제작지원 표시) → 제작지원 영상 버림
//       → 승인 채널 영상의 정보란에서 맛집 추출 → 카카오 장소로 식별 → 판정(judge) → app/data/food-eligible.json
//
// 켜지는 조건(둘 다 있어야 호출한다): config.json 의 collect:true  +  환경변수 YOUTUBE_API_KEY
// 앱에 반영하는 스위치는 따로다: config.json 의 appEnabled:true 가 아니면 food-eligible.json 은 status:"off"(앱이 기존 동작 유지).
// 어떤 경우에도 종료 코드 0 — 실패해도 매일 수집·게시를 멈추지 않는다.
// 저장 규칙(YouTube 개발자 정책): 영상 제목·설명 전문은 저장하지 않고, 영상 ID·채널 ID·게시일과 추출한 식당 정보만 두며,
//   영상 정보는 30일 안에 다시 받아 갱신하고 못 받으면(삭제·비공개·제작지원 표시) 지운다.
//
// 사용: node tools/food-verify/run.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isSponsored, extractRestaurants, pickPlace, judge, DEFAULT_WEIGHTS, normName, roadOf } from './lib.mjs';
import { collectSeries, processSeries } from './series.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const DIR = `${ROOT}tools/food-verify/`;
const DAY = 86400000;
export const REFRESH_AFTER_DAYS = 25; // 30일 규칙보다 일찍 갱신한다

const read = (p, d) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return d; } };
const write = (p, v) => { mkdirSync(p.replace(/\/[^/]*$/, ''), { recursive: true }); writeFileSync(p, JSON.stringify(v, null, 1)); };

export const DEFAULT_CONFIG = { collect: false, regionSearch: true, appEnabled: false, minChannels: 1, recentMonths: 12, searchesPerRun: 90, kakaoPerRun: 2500, seriesMaxPages: 12, fetchReviews: false };

async function getJson(url, headers, http) {
  const r = await http(url, { headers });
  if (!r.ok) { const e = new Error(`HTTP ${r.status}`); e.status = r.status; throw e; }
  return r.json();
}

/** 지역 목록: region-trends.json 의 "시도 시군구". 없으면 빈 목록. */
export function regionList(root = ROOT) {
  const j = read(`${root}app/data/region-trends.json`, null);
  return (j?.regions || []).map((r) => r.key).filter(Boolean);
}
const shortRegion = (key) => String(key).split(' ').slice(-1)[0].replace(/(특별시|광역시)$/, ''); // "경기 수원시" → "수원시"

export async function run({ env = process.env, http = fetch, now = Date.now(), dir = DIR, root = ROOT, log = console.log } = {}) {
  dir = dir.replace(/\/?$/, '/'); root = root.replace(/\/?$/, '/');
  const cfg = { ...DEFAULT_CONFIG, ...read(`${dir}config.json`, {}) };
  const data = `${dir}data/`;
  const channels = read(`${data}channels.json`, { approved: [] });
  const approved = new Set(channels.approved.map((c) => c.id).filter(Boolean));
  const store = read(`${data}candidates.json`, { videos: {} });
  const state = read(`${data}state.json`, { cursor: 0 });
  const overrides = read(`${data}overrides.json`, {}); // { "<카카오ID>": "approve" | "reject" }
  const sugg = read(`${data}suggestions.json`, { channels: {} });
  const out = { searched: 0, fetched: 0, dropped: { sponsored: 0, gone: 0, listOnly: 0, unapprovedChannel: 0 }, stored: 0 };
  const live = cfg.collect && env.YOUTUBE_API_KEY;

  if (!live) log(`맛집 검증 수집: 건너뜀(${!cfg.collect ? 'config.collect=false' : 'YOUTUBE_API_KEY 없음'})`);
  else {
    const key = env.YOUTUBE_API_KEY;
    const kakaoKey = env.KAKAO_REST_KEY;
    let kakaoLeft = cfg.kakaoPerRun;
    const yt = (path, q) => getJson(`https://www.googleapis.com/youtube/v3/${path}?${new URLSearchParams({ ...q, key })}`, {}, http);

    const kakaoSearch = async (query, code = 'FD6') => {
      if (kakaoLeft <= 0) return [];
      kakaoLeft--;
      const j = await getJson(`https://dapi.kakao.com/v2/local/search/keyword.json?${new URLSearchParams({ query, category_group_code: code, size: '15' })}`, { Authorization: `KakaoAK ${kakaoKey}` }, http).catch(() => ({ documents: [] }));
      return j.documents || [];
    };
    const identify = async (item, region) => {
      if (!kakaoKey || kakaoLeft <= 0) return { level: 'none', place: null, why: 'NO_KAKAO_BUDGET' };
      // 1차: "지역 상호", 2차: 주소에 도로명이 있으면 "도로명 상호"(이름이 흔한 가게도 그 자리에서 찾는다). 두 결과를 합쳐 판정한다.
      const docs = await kakaoSearch([shortRegion(region), item.name].join(' '));
      let pick = pickPlace(item, docs);
      const road = roadOf(item.addr || '');
      if (pick.level !== 'linked' && road) {
        const more = await kakaoSearch(`${road} ${item.name}`);
        const seen = new Set(docs.map((d) => d.id));
        pick = pickPlace(item, [...docs, ...more.filter((d) => !seen.has(d.id))]);
      }
      if (pick.level === 'none') { // 음식점으로 안 나오면 카페로도 찾는다(방송에 나온 카페·빵집)
        const cafe = await kakaoSearch([shortRegion(region), item.name].join(' '), 'CE7');
        const p2 = pickPlace(item, cafe);
        if (p2.level !== 'none') pick = p2;
      }
      return pick;
    };

    // 영상 상세(videos.list)를 받아 한 영상을 처리한다. 지우거나 저장한 결과를 반환.
    const handle = async (v, region) => {
      if (isSponsored(v).yes) { delete store.videos[v.id]; out.dropped.sponsored++; return; } // 제작지원·광고: 참고하지 않는다(이미 저장돼 있어도 지운다)
      const chId = v.snippet?.channelId;
      if (!approved.has(chId)) {
        out.dropped.unapprovedChannel++;
        const s = (sugg.channels[chId] ||= { title: v.snippet?.channelTitle || '', hits: 0 });
        s.hits++; s.seenAt = new Date(now).toISOString().slice(0, 10);
        delete store.videos[v.id];
        return;
      }
      const ex = extractRestaurants(v.snippet?.description || '', shortRegion(region));
      if (ex.listOnly) { delete store.videos[v.id]; out.dropped.listOnly++; return; }
      const items = [];
      for (const it of ex.items) {
        const prev = store.videos[v.id]?.items?.find((p) => p.name === it.name);
        const id = prev?.place ? { level: prev.place.level, place: prev.place.key ? { id: prev.place.key, place_name: prev.place.name, y: prev.place.lat, x: prev.place.lng } : null } : await identify(it, region);
        items.push({ ...it, place: { level: id.level, key: id.place ? String(id.place.id) : '', name: id.place?.place_name || '', lat: id.place ? Number(id.place.y) : 0, lng: id.place ? Number(id.place.x) : 0, why: id.why || '' } });
      }
      store.videos[v.id] = { channelId: chId, publishedAt: v.snippet?.publishedAt || '', fetchedAt: now, region, items }; // 제목·설명 전문은 저장하지 않는다
      out.stored++;
    };

    try {
     if (cfg.regionSearch) {
      // 1) 오래된 영상은 30일이 되기 전에 다시 받아 갱신(없어졌으면 삭제)
      const stale = Object.entries(store.videos).filter(([, v]) => now - v.fetchedAt > REFRESH_AFTER_DAYS * DAY).map(([id]) => id);
      for (let i = 0; i < stale.length; i += 50) {
        const ids = stale.slice(i, i + 50);
        const j = await yt('videos', { part: 'snippet,paidProductPlacementDetails', id: ids.join(',') });
        const got = new Map((j.items || []).map((v) => [v.id, v]));
        for (const id of ids) {
          if (!got.has(id)) { delete store.videos[id]; out.dropped.gone++; continue; }
          await handle(got.get(id), store.videos[id].region);
        }
        out.fetched += ids.length;
      }

      // 2) 새 지역 검색: 하루 searchesPerRun(기본 90, search.list 하루 100회 한도 안)번, 지역을 돌아가며
      const regions = regionList(root);
      if (!regions.length) log('  지역 목록(region-trends.json)이 없어 검색하지 않음');
      const since = new Date(now - cfg.recentMonths * 30 * DAY).toISOString();
      const todo = [];
      for (let n = 0; n < Math.min(cfg.searchesPerRun, regions.length); n++) todo.push(regions[(state.cursor + n) % regions.length]);
      for (const region of todo) {
        let j;
        try { j = await yt('search', { part: 'id', type: 'video', q: `${shortRegion(region)} 맛집`, regionCode: 'KR', relevanceLanguage: 'ko', publishedAfter: since, maxResults: '50' }); } catch (e) { if (e.status === 403 || e.status === 429) { log(`  search 한도/권한 오류(${e.status}) — 오늘은 여기까지`); break; } throw e; }
        out.searched++;
        const ids = (j.items || []).map((x) => x.id?.videoId).filter((id) => id && !store.videos[id]);
        if (!ids.length) continue;
        const d = await yt('videos', { part: 'snippet,paidProductPlacementDetails', id: ids.join(',') });
        out.fetched += ids.length;
        for (const v of d.items || []) await handle(v, region);
      }
      state.cursor = regions.length ? (state.cursor + out.searched) % regions.length : 0;
     }
    } catch (e) {
      log(`  맛집 검증 수집 오류(${e.message}) — 이번에는 여기까지만 저장`);
    }
    // 4) 전문 시리즈 채널(예: 스튜디오 수제의 '풍자의 또간집'): 새 영상 수집 → 식당 추출 → 업체 매칭
    try {
      const sv = read(`${data}series-videos.json`, { videos: {} });
      const ext = read(`${data}extractions.json`, {});
      const restaurants = read(`${data}restaurants.json`, {});
      let chChanged = false;
      for (const ch of channels.approved.filter((c) => c.series && c.enabled !== false)) {
        const res = await collectSeries({ ch, yt, store: sv, now, maxPages: cfg.seriesMaxPages, log });
        if (res.resolved && (ch.id !== res.resolved.id || ch.uploads !== res.resolved.uploads)) { ch.id = res.resolved.id; ch.uploads = res.resolved.uploads; ch.title = res.resolved.title; chChanged = true; approved.add(ch.id); }
        log(`  시리즈 "${ch.name}": 새 영상 ${res.newVideos} · 갱신 ${res.refreshed} · 삭제 ${res.removed} · 제작지원 제외 ${res.sponsored} · 제목 필터 밖 ${res.skippedTitle}${res.resolved ? '' : ' · 채널 확정 못 함'}`);
      }
      for (const [vid, x] of Object.entries(ext)) { // 구글 좌표는 30일 안에 다시 확인해야 하므로 오래되면 그 영상을 다시 매칭한다
        if (x.items.some((it) => it.match?.key?.startsWith('g:') && now - (restaurants[it.match.key]?.coordsAt || 0) > REFRESH_AFTER_DAYS * DAY)) delete ext[vid];
      }
      const manualFile = read(`${data}manual-episodes.json`, { episodes: [] });
      const manual = Object.fromEntries((manualFile.episodes || []).filter((e) => e.videoId).map((e) => [e.videoId, e]));
      // 영상이 수집되지 않은 옛 회차(ep:N)는 수기 입력만으로 처리할 수 있게 가짜 영상으로 등록한다(YouTube 갱신·삭제 대상이 아님).
      const chSeries = channels.approved.find((c) => c.series && c.enabled !== false && c.id);
      if (chSeries) for (const e of manualFile.episodes || []) {
        if (!e.videoId || sv.videos[e.videoId] || !String(e.videoId).startsWith('ep:') || !(e.restaurants || []).length) continue;
        sv.videos[e.videoId] = { id: e.videoId, pseudo: true, channelKey: chSeries.key, channelId: chSeries.id, title: `EP.${e.ep}`, description: '', publishedAt: e.publishedAt || '', fetchedAt: now, descHash: 'manual' };
      }
      for (const v of Object.values(sv.videos)) if (v.pseudo) v.fetchedAt = now; // 가짜 영상은 항상 최신으로 둔다
      const g = env.GOOGLE_PLACES_SERVER_KEY ? { key: env.GOOGLE_PLACES_SERVER_KEY, http, fetchReviews: cfg.fetchReviews } : null;
      const ps = await processSeries({ store: sv, ext, restaurants, regionKeys: regionList(root), now, identifyKakao: kakaoKey ? (it, ctx) => identify(it, ctx) : null, google: g, manual, log });
      log(`  시리즈 식당 추출: 영상 ${ps.processed}편 처리 · 식당 ${ps.items}곳(자동 연결 ${ps.linked} · 검수 ${ps.ambiguous + ps.none}) · 식당 못 뽑은 영상 ${ps.noItems}${g ? ' · 구글 업체 매칭 사용' : ' · 구글 서버 키 없음(카카오로만 매칭)'}`);
      write(`${data}series-videos.json`, sv); write(`${data}extractions.json`, ext); write(`${data}restaurants.json`, restaurants);
      if (chChanged) write(`${data}channels.json`, channels);
    } catch (e) { log(`  시리즈 수집 오류(${e.message}) — 이번에는 여기까지만 저장`); }
    write(`${data}candidates.json`, store);
    write(`${data}state.json`, state);
    write(`${data}suggestions.json`, sugg);
  }

  // 3) 판정 → 앱용 목록. (수집을 건너뛴 날에도 기존 저장분으로 다시 만든다)
  const restaurants = read(`${data}restaurants.json`, {});
  const ext = read(`${data}extractions.json`, {});
  const sv = read(`${data}series-videos.json`, { videos: {} });
  const weights = { ...DEFAULT_WEIGHTS, ...read(`${dir}weights.json`, {}) };
  const byPlace = new Map(); // 업체 키(카카오 장소 ID 또는 g:구글ID) → { name, lat, lng, refs[] }
  const review = [];
  const addRef = (key, base, ref) => { const e = byPlace.get(key) || { ...base, refs: [] }; e.refs.push(ref); byPlace.set(key, e); };
  for (const [videoId, v] of Object.entries(store.videos)) { // 지역 검색 영상
    if (now - v.fetchedAt > 30 * DAY) continue; // 30일 넘게 갱신 못 한 영상 정보는 쓰지 않는다
    for (const it of v.items) {
      if (it.place.level === 'linked' && it.place.key) addRef(it.place.key, { name: it.place.name, lat: it.place.lat, lng: it.place.lng }, { videoId, channelId: v.channelId, publishedAt: v.publishedAt, role: 'visited' });
      else if (it.place.level === 'ambiguous') review.push({ videoId, channelId: v.channelId, name: it.name, addr: it.addr, why: it.place.why || 'AMBIGUOUS' });
    }
  }
  for (const [videoId, x] of Object.entries(ext)) { // 시리즈 영상(또간집 등)
    const v = sv.videos[videoId];
    if (!v || v.sponsored || now - v.fetchedAt > 30 * DAY) continue;
    for (const it of x.items) {
      const m = it.match || {}, r = restaurants[m.key];
      if (m.level === 'linked' && r && !(r.googlePlaceId && now - (r.coordsAt || 0) > 30 * DAY)) addRef(m.key, { name: r.name || it.name, lat: r.lat, lng: r.lng, g: r.googlePlaceId || '', open: r.open, risk: r.risk }, { videoId, channelId: v.channelId, publishedAt: v.publishedAt, role: it.role });
      else review.push({ kind: 'series', videoId, channelId: v.channelId, name: it.name, role: it.role, why: m.why || (m.level === 'ambiguous' ? 'AMBIGUOUS' : 'NO_MATCH') });
    }
  }
  const items = [], verdicts = {};
  for (const [k, e] of byPlace) {
    const j = judge(e.refs, approved, { minChannels: cfg.minChannels, override: overrides[k], weights, now, open: e.open, risk: e.risk });
    verdicts[k] = { name: e.name, ...j, videos: [...new Set(e.refs.map((r) => r.videoId))] };
    if (j.status === 'eligible') items.push({ k, n: e.name, lat: +e.lat.toFixed(5), lng: +e.lng.toFixed(5), p: j.score, ...(e.g ? { g: e.g } : {}) });
  }
  // 같은 식당이 다른 경로(구글·카카오)로 두 번 들어오면 하나로 합친다(150m 안·같은 이름) — 중복 추천 방지
  items.sort((a, b) => b.p - a.p);
  const uniq = [];
  for (const it of items) {
    if (uniq.some((u) => normName(u.n) === normName(it.n) && Math.hypot((u.lat - it.lat) * 111, (u.lng - it.lng) * 88) <= 0.15)) continue;
    uniq.push(it);
  }
  items.length = 0; items.push(...uniq);
  write(`${data}verdicts.json`, verdicts);
  write(`${data}review-queue.json`, review);
  const status = cfg.appEnabled && items.length ? 'on' : 'off';
  write(`${root}app/data/food-eligible.json`, { status, updatedAt: new Date(now).toISOString(), count: items.length, items });
  log(`맛집 검증: 검색 ${out.searched}회 · 영상 ${out.fetched}개 확인 · 제작지원 제외 ${out.dropped.sponsored} · 미승인 채널 ${out.dropped.unapprovedChannel} · 나열형 제외 ${out.dropped.listOnly} · 통과 식당 ${items.length}곳 · 검수 대기 ${review.length}건 · 앱 반영 ${status}`);
  return { out, items, review, status };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  run().catch((e) => { console.log(`맛집 검증 오류(무시): ${e.message}`); }).then(() => process.exit(0));
}
