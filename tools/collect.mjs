// 실제 데이터 수집기. 실행: node tools/collect.mjs
// .env 의 키로 외부 데이터를 모아 app/data/*.json 으로 저장한다. 저장 파일에는 키가 들어가지 않는다.
//
//  - 축제·행사: 한국관광공사 국문 관광정보 서비스 "행사정보조회"
//  - 장소 사진·소개: 같은 서비스 "키워드 검색 조회"(장소 좌표 5km 안의 결과만)와 "공통정보 조회"의 개요.
//    잘 바뀌지 않아서 app/data/details.json 에 모아 두고 30일마다 다시 받는다.
//  - 장소 사진 여러 장: 같은 서비스 "이미지정보 조회"(detailImage2). 대표 사진을 맨 앞에 두고 최대 10장.
//    한 번 실행에 IMG_BUDGET 곳까지만 받고, 나머지는 다음 날 이어서 받는다.
//    사진만 받으려면: node tools/collect.mjs --photos (네이버·축제는 건드리지 않는다)
//  - 성별·연령대별 검색 인기, 1년 인기, 최근 추세: 네이버 검색어 트렌드(NAVER API HUB)
//  - 블로그 언급 수: 네이버 블로그 검색(NAVER API HUB). 7일마다 다시 받는다.
//  - 전국 소소한 곳(places-local.js)은 호출 수를 아끼려고 1년 인기·추세만 받고,
//    성별·연령대별 인기는 1년 인기에 분류별 기본 모양을 곱해 앱에서 계산한다.
//
// 네이버 검색어 트렌드는 한 번 요청 안에서만 비교되는 상대값(가장 높은 값 = 100)이라,
// 매 요청에 기준 검색어(ANCHOR)를 함께 넣어 요청끼리 비교할 수 있게 맞춘다.

import { MUST_HAVE } from './must-have.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PLACES } from '../app/js/data/places.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// 키는 내 컴퓨터에서는 .env 파일에서, GitHub 자동 실행에서는 GitHub 비밀 저장소(Secrets)에서 받는다.
const env = { ...process.env };
try {
  for (const line of readFileSync(`${ROOT}.env`, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[2]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {
  // .env 가 없으면(자동 실행) 환경변수만 쓴다.
}
for (const k of ['DATA_GO_KR_KEY', 'NAVER_API_KEY_ID', 'NAVER_API_KEY']) {
  if (!env[k]) { console.log(`키가 없어요: ${k}`); process.exit(1); }
}

const ANCHOR = '남이섬';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ymd = (d) => d.toISOString().slice(0, 10);
const compact = (d) => ymd(d).replace(/-/g, '');
const today = new Date();
const yesterday = new Date(today.getTime() - 86400000);
let calls = { tour: 0, naver: 0 };

// 검색어로 쓰기 애매한 이름은 직접 지정한다.
const KEYWORD = {
  'children-museum': '국립중앙박물관 어린이박물관',
  'lotte-world': '롯데월드',
  legoland: '레고랜드',
  seongsu: '성수동 카페거리',
  'gwacheon-science': '국립과천과학관',
  wolmido: '월미도',
  anmok: '안목해변',
  sokcho: '속초해수욕장',
  sheep: '대관령 양떼목장',
  oworld: '대전 오월드',
  danyang: '만천하스카이워크',
  kkotji: '꽃지해수욕장',
  gongju: '공산성',
  jeonju: '전주 한옥마을',
  suncheon: '순천만국가정원',
  yeosu: '여수 아쿠아플라넷',
  hwangnidan: '황리단길',
  haeundae: '해운대',
  'songdo-cable': '송도해상케이블카',
  jikjisa: '직지사',
  tongyeong: '통영 루지',
  hahoe: '하회마을',
  heyri: '헤이리 예술마을',
  imjingak: '임진각',
  dumulmeori: '두물머리',
  'songdo-park': '송도 센트럴파크',
  'ganghwa-luge': '강화 루지',
  'morning-calm': '아침고요수목원',
  'gwangmyeong-cave': '광명동굴',
  oceanworld: '오션월드',
  'science-museum': '국립중앙과학관',
  'folk-village': '한국민속촌',
  'haebangchon-street': '해방촌',
  'huam-alley': '후암동',
  bluesquare: '블루스퀘어',
  'antique-street': '이태원 앤티크가구거리',
  'hangeul-museum': '국립한글박물관',
  'tongin-market': '통인시장',
  ikseon: '익선동',
  daehakro: '대학로 연극',
  yeonnam: '경의선숲길',
  'understand-ave': '언더스탠드에비뉴',
  mullae: '문래창작촌',
  haenggung: '행리단길',
  baedari: '배다리 헌책방골목',
};
const CORE = PLACES.filter((p) => !p.local);
const keywordOf = (p) => KEYWORD[p.id] || p.kw || p.name.replace(/\s*\(.*?\)\s*/g, '').split('·')[0].trim();

// 앱의 연령대 코드(1~11)를 네이버 연령 묶음으로 대응시킨다. 12세 이하는 앱이 아이 단계로 따로 계산한다.
const AGE_GROUPS = [
  { name: '2030', ages: ['3', '4'], codes: ['1', '2', '3', '4'] },
  { name: '30s', ages: ['5', '6'], codes: ['5', '6'] },
  { name: '40s', ages: ['7', '8'], codes: ['7', '8'] },
  { name: '50+', ages: ['9', '10', '11'], codes: ['9', '10', '11'] },
];

async function getJson(url, init, label) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, init);
    const text = await res.text();
    if (res.status === 429 && attempt < 3) { await sleep(1500 * attempt); continue; }
    if (!res.ok) throw new Error(`${label}: HTTP ${res.status} ${text.slice(0, 120)}`);
    try { return JSON.parse(text); } catch { throw new Error(`${label}: ${text.replace(/\s+/g, ' ').slice(0, 120)}`); }
  }
  throw new Error(`${label}: 재시도 실패`);
}

// ── 한국관광공사 ────────────────────────────────────────────
async function tour(op, params) {
  calls.tour++;
  const q = new URLSearchParams({ serviceKey: env.DATA_GO_KR_KEY, MobileOS: 'ETC', MobileApp: 'eodigaji', _type: 'json', ...params });
  const j = await getJson(`https://apis.data.go.kr/B551011/KorService2/${op}?${q}`, undefined, op);
  const head = j?.response?.header;
  if (head && head.resultCode !== '0000') throw new Error(`${op}: ${head.resultCode} ${head.resultMsg}`);
  const items = j?.response?.body?.items?.item;
  return { items: Array.isArray(items) ? items : items ? [items] : [], total: Number(j?.response?.body?.totalCount || 0) };
}

const https = (u) => (u || '').replace(/^http:\/\//, 'https://');

// 사진만 받는 실행인지, 그리고 한 번 실행에 사진 목록을 몇 곳까지 받을지
const PHOTOS_ONLY = process.argv.includes('--photos');
let imgBudget = PHOTOS_ONLY ? 900 : 300;

/** 관광공사에 등록된 사진 목록. 대표 사진을 맨 앞에 두고 겹치는 것을 빼서 최대 10장. */
async function tourPhotos(cid, first) {
  imgBudget--;
  const { items } = await tour('detailImage2', { contentId: cid, imageYN: 'Y', numOfRows: '10', pageNo: '1' });
  const list = [first, ...items.map((it) => https(it.originimgurl))].filter(Boolean);
  return [...new Set(list)].slice(0, 10);
}

/** 관광공사 글에서 태그·기호를 걷어 낸다. */
function plain(text) {
  return (text || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

// 한 번 실행에 주차 안내를 몇 곳까지 받을지
let introBudget = PHOTOS_ONLY ? 900 : 300;

/**
 * 주차 안내("소개정보 조회" detailIntro2). row 는 cid 가 있는 장소 한 줄이고, 결과를 그 줄에 적는다.
 * 종류 번호(관광지 12, 문화시설 14, 레포츠 28 …)마다 칸 이름이 달라서 이름이 parking 으로 시작하는 칸을 모은다.
 */
async function tourParking(row) {
  if (!row.ctype) {
    const d = await tour('detailCommon2', { contentId: row.cid });
    row.ctype = d.items[0]?.contenttypeid || '';
  }
  if (!row.ctype) return;
  introBudget--;
  const { items } = await tour('detailIntro2', { contentId: row.cid, contentTypeId: row.ctype });
  const it = items[0] || {};
  const pick = (test) => Object.entries(it).filter(([k, v]) => test(k) && v).map(([, v]) => plain(v)).filter(Boolean).join(' / ');
  const parking = pick((k) => k.startsWith('parking') && !k.startsWith('parkingfee'));
  const fee = pick((k) => k.startsWith('parkingfee'));
  if (parking) row.parking = parking.slice(0, 200);
  if (fee) row.parkingFee = fee.slice(0, 200);
}
const iso = (s) => (s && s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null);
const kmBetween = (a, b) => {
  const R = 6371, r = (x) => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

async function collectEvents() {
  const from = new Date(today.getTime() - 120 * 86400000);
  const out = [];
  for (let page = 1; page <= 20; page++) {
    const { items, total } = await tour('searchFestival2', { eventStartDate: compact(from), numOfRows: '100', pageNo: String(page), arrange: 'A' });
    for (const it of items) {
      const start = iso(it.eventstartdate);
      const end = iso(it.eventenddate) || start;
      const lat = Number(it.mapy), lng = Number(it.mapx);
      if (!start || !lat || !lng || end < ymd(today)) continue;
      const region = (it.addr1 || '').split(' ').slice(0, 2).join(' ');
      out.push({
        id: `kto-${it.contentid}`,
        title: it.title,
        type: 'festival',
        region,
        lat, lng, start, end,
        kid: null,
        desc: it.addr1 ? `${it.addr1}${it.addr2 ? ` ${it.addr2}` : ''}` : '',
        photo: https(it.firstimage) || null,
      });
    }
    if (page * 100 >= total) break;
  }
  return out;
}

/** 관광공사 개요를 2~3문장(약 200자)으로 줄인다. */
function summarize(text) {
  const clean = (text || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return '';
  const sentences = clean.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) || [clean];
  let out = '';
  for (const s of sentences) {
    if (out && (out.length + s.length > 230 || out.length >= 110)) break;
    out += (out ? ' ' : '') + s.trim();
  }
  return out.length > 240 ? `${out.slice(0, 237)}…` : out;
}

async function collectDetails() {
  const path = `${ROOT}app/data/details.json`;
  let cache = {};
  try { cache = JSON.parse(readFileSync(path, 'utf8')).places || {}; } catch { /* 처음 */ }
  const fresh = Date.now() - 30 * 86400000;
  let fetched = 0;
  for (const p of PLACES) {
    const c = cache[p.id];
    if (c && c.keyword === keywordOf(p) && Date.parse(c.at) > fresh) continue;
    try {
      const { items } = await tour('searchKeyword2', { keyword: keywordOf(p), numOfRows: '5', pageNo: '1' });
      const near = items.filter((it) => kmBetween(p, { lat: Number(it.mapy), lng: Number(it.mapx) }) <= 5);
      const hit = near.find((it) => it.firstimage) || near[0];
      const row = { keyword: keywordOf(p), at: new Date().toISOString() };
      if (hit) {
        row.cid = hit.contentid;
        row.ctype = hit.contenttypeid;
        if (hit.firstimage) row.photo = https(hit.firstimage);
        const d = await tour('detailCommon2', { contentId: hit.contentid });
        row.overview = summarize(d.items[0]?.overview);
      }
      cache[p.id] = row;
      fetched++;
    } catch (e) {
      console.log(`  소개 실패 ${p.name}: ${e.message}`);
    }
    await sleep(80);
  }
  // 사진 여러 장: 관광공사에 등록된 곳(cid) 중 아직 안 받은 곳만
  let photoFetched = 0;
  for (const p of PLACES) {
    const row = cache[p.id];
    if (!row?.cid || row.photosAt || imgBudget <= 0) continue;
    try {
      row.photos = await tourPhotos(row.cid, row.photo);
      row.photosAt = new Date().toISOString();
      photoFetched++;
    } catch (e) {
      console.log(`  사진 목록 실패 ${p.name}: ${e.message}`);
      break; // 한도 초과 등은 다음 날 이어서
    }
    await sleep(60);
  }
  // 주차 안내: 관광공사에 등록된 곳 중 아직 안 받은 곳만
  let parkFetched = 0;
  for (const p of PLACES) {
    const row = cache[p.id];
    if (!row?.cid || row.introAt || introBudget <= 0) continue;
    try {
      await tourParking(row);
      row.introAt = new Date().toISOString();
      parkFetched++;
    } catch (e) {
      console.log(`  주차 안내 실패 ${p.name}: ${e.message}`);
      break; // 한도 초과 등은 다음 날 이어서
    }
    await sleep(60);
  }
  writeFileSync(path, JSON.stringify({ updatedAt: new Date().toISOString(), places: cache }));
  console.log(`  새로 받은 곳 ${fetched}곳, 사진 목록 ${photoFetched}곳, 주차 안내 ${parkFetched}곳`);
  return cache;
}

// ── 네이버 (NAVER API HUB) ────────────────────────────────────
const NAVER = 'https://naverapihub.apigw.ntruss.com';
const naverHeaders = { 'X-NCP-APIGW-API-KEY-ID': env.NAVER_API_KEY_ID, 'X-NCP-APIGW-API-KEY': env.NAVER_API_KEY };

async function trend(body) {
  calls.naver++;
  await sleep(120);
  return getJson(`${NAVER}/search-trend/v1/search`, {
    method: 'POST',
    headers: { ...naverHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, 'search-trend');
}

const chunks = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

/** 장소들을 기준 검색어 대비 배수로 계산: { id: { sum: 기간 합/기준 합, series: [...] } } */
async function relative(list, extra, startDate, timeUnit) {
  const result = {};
  for (const group of chunks(list, 4)) {
    const body = {
      startDate, endDate: ymd(yesterday), timeUnit,
      keywordGroups: [
        { groupName: '__anchor', keywords: [ANCHOR] },
        ...group.map((p) => ({ groupName: p.id, keywords: [keywordOf(p)] })),
      ],
      ...extra,
    };
    try {
      const j = await trend(body);
      const sumOf = (r) => (r?.data || []).reduce((s, d) => s + d.ratio, 0);
      const anchor = sumOf(j.results.find((r) => r.title === '__anchor')) || 1e-6;
      for (const r of j.results) {
        if (r.title === '__anchor') continue;
        result[r.title] = { sum: sumOf(r) / anchor, series: (r.data || []).map((d) => d.ratio) };
      }
    } catch (e) {
      console.log(`  트렌드 실패 (${group.map((p) => p.id).join(',')}): ${e.message}`);
    }
  }
  return result;
}

/** 기준 대비 배수를 0~100 점수로 (로그 눈금이라 작은 곳도 0점으로 뭉개지지 않는다) */
function toScores(rel) {
  const vals = Object.values(rel).map((v) => Math.max(v.sum, 1e-3));
  const max = Math.max(...vals, 1e-3);
  const lo = Math.log10(1e-3), hi = Math.log10(max);
  const out = {};
  for (const [id, v] of Object.entries(rel)) {
    out[id] = Math.round((100 * (Math.log10(Math.max(v.sum, 1e-3)) - lo)) / Math.max(hi - lo, 1e-6));
  }
  return out;
}

async function collectNaver(prevPlaces) {
  const yearStart = new Date(today);
  yearStart.setFullYear(yearStart.getFullYear() - 1);
  const threeMonths = new Date(today);
  threeMonths.setMonth(threeMonths.getMonth() - 3);

  console.log('· 1년 인기·최근 추세');
  const yearly = await relative(PLACES, {}, ymd(yearStart), 'week');
  const yearlyScore = toScores(yearly);
  const trendOf = {};
  // 주 단위 집계는 월요일부터라, 이번 주가 아직 덜 찼으면 마지막 주는 빼고 계산한다.
  const dow = yesterday.getDay(); // 0=일요일
  const partialWeek = dow !== 0;
  for (const [id, v] of Object.entries(yearly)) {
    const s = partialWeek ? v.series.slice(0, -1) : v.series;
    const avg = s.reduce((a, b) => a + b, 0) / (s.length || 1);
    const recent = s.slice(-4).reduce((a, b) => a + b, 0) / Math.max(1, Math.min(4, s.length));
    trendOf[id] = avg > 0 ? Math.round((recent / avg) * 100) / 100 : 1;
  }

  const interest = {};
  for (const g of ['m', 'f']) {
    for (const band of AGE_GROUPS) {
      console.log(`· 성별·연령 인기 ${g === 'm' ? '남성' : '여성'} ${band.name}`);
      const scores = toScores(await relative(CORE, { gender: g, ages: band.ages }, ymd(threeMonths), 'month'));
      for (const [id, sc] of Object.entries(scores)) {
        interest[id] ||= {};
        for (const code of band.codes) interest[id][`${g}${code}`] = sc;
      }
    }
  }

  console.log('· 블로그 언급 수 (7일 지난 것만)');
  const buzz = {}, buzzAt = {};
  const weekAgo = Date.now() - 7 * 86400000;
  for (const p of PLACES) {
    const prev = prevPlaces[p.id];
    if (prev && typeof prev.buzz === 'number' && prev.keyword === keywordOf(p) && Date.parse(prev.buzzAt) > weekAgo) {
      buzz[p.id] = prev.buzz; buzzAt[p.id] = prev.buzzAt;
      continue;
    }
    try {
      calls.naver++;
      const j = await getJson(`${NAVER}/search/v1/blog?query=${encodeURIComponent(keywordOf(p))}&display=1`, { headers: naverHeaders }, 'blog');
      buzz[p.id] = j.total; buzzAt[p.id] = new Date().toISOString();
    } catch (e) {
      console.log(`  블로그 실패 ${p.name}: ${e.message}`);
    }
    await sleep(120);
  }
  return { yearlyScore, trendOf, interest, buzz, buzzAt };
}

// ── KOPIS 공연 일정 (아동 공연) ─────────────────────────────────
// 공연 목록에는 좌표가 없어서 공연장 이름을 카카오 장소 검색으로 찾는다.
// 찾은 공연장 좌표는 app/data/venues.json 에 모아 두고 다음부터는 다시 찾지 않는다.
const SHORT_AREA = (a) => {
  if (!a) return '';
  const m = { 충청북도: '충북', 충청남도: '충남', 경상북도: '경북', 경상남도: '경남', 전라북도: '전북', 전라남도: '전남' };
  return m[a] || a.slice(0, 2);
};
const xmlField = (block, tag) => {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
};
const dotIso = (s) => (s ? s.replace(/\./g, '-') : null);

async function kakaoPlace(query, areaShort) {
  calls.kakao = (calls.kakao || 0) + 1;
  const j = await getJson(`https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&size=5`, {
    headers: { Authorization: `KakaoAK ${env.KAKAO_REST_KEY}` },
  }, 'kakao-local');
  const docs = j.documents || [];
  // 2026년 광주·전남이 통합돼 광주 주소가 "전남광주통합특별시"로 나온다.
  const pre = areaShort === '광주' ? '전남광주' : areaShort;
  const hit = docs.find((d) => !pre || (d.address_name || '').startsWith(pre)) || null;
  return hit ? { lat: Number(hit.y), lng: Number(hit.x), addr: hit.road_address_name || hit.address_name } : null;
}

async function collectStages() {
  if (!env.KOPIS_KEY || !env.KAKAO_REST_KEY) {
    console.log('  KOPIS_KEY 또는 KAKAO_REST_KEY 가 없어 공연은 건너뜀');
    return [];
  }
  const venuesPath = `${ROOT}app/data/venues.json`;
  let venues = {};
  try { venues = JSON.parse(readFileSync(venuesPath, 'utf8')).venues || {}; } catch { /* 처음 */ }

  const until = new Date(today.getTime() + 60 * 86400000);
  const rows = [];
  for (let page = 1; page <= 15; page++) {
    const q = new URLSearchParams({ service: env.KOPIS_KEY, stdate: compact(today), eddate: compact(until), cpage: String(page), rows: '100', kidstate: 'Y' });
    let xml = '', status = 0;
    for (let attempt = 1; attempt <= 3; attempt++) { // KOPIS 서버가 가끔 400을 돌려줘서 몇 번 다시 시도
      calls.kopis = (calls.kopis || 0) + 1;
      const res = await fetch(`https://kopis.or.kr/openApi/restful/pblprfr?${q}`);
      xml = await res.text(); status = res.status;
      if (res.ok && xml.includes('<dbs')) break;
      await sleep(3000 * attempt);
    }
    if (!xml.includes('<dbs')) throw new Error(`KOPIS HTTP ${status} ${xml.replace(/\s+/g, ' ').slice(0, 80)}`);
    const blocks = xml.match(/<db>[\s\S]*?<\/db>/g) || [];
    rows.push(...blocks);
    if (blocks.length < 100) break;
    await sleep(150);
  }

  const out = [];
  let newVenues = 0;
  for (const b of rows) {
    const venue = xmlField(b, 'fcltynm');
    const area = xmlField(b, 'area');
    const key = `${area}|${venue}`;
    if (!venues[key]) { // 못 찾았던 곳도 다시 시도 (주소 체계가 바뀌는 경우가 있음)
      try {
        const name = venue.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
        venues[key] = await kakaoPlace(name, SHORT_AREA(area));
        newVenues++;
      } catch (e) {
        console.log(`  공연장 찾기 실패 ${venue}: ${e.message}`);
        continue; // 실패한 곳은 저장하지 않고 다음에 다시 시도
      }
      await sleep(60);
    }
    const v = venues[key];
    if (!v) continue;
    const id = xmlField(b, 'mt20id');
    const start = dotIso(xmlField(b, 'prfpdfrom'));
    const end = dotIso(xmlField(b, 'prfpdto')) || start;
    if (!id || !start || end < ymd(today)) continue;
    const poster = xmlField(b, 'poster').replace(/^https?:\/\/(www\.)?kopis\.or\.kr/, 'https://kopis.or.kr');
    out.push({
      id: `kopis-${id}`,
      title: xmlField(b, 'prfnm'),
      type: 'stage',
      region: `${SHORT_AREA(area)} · ${venue}`,
      lat: v.lat, lng: v.lng, start, end,
      kid: true,
      desc: `${xmlField(b, 'genrenm')} · ${venue}${v.addr ? ` (${v.addr})` : ''}`,
      photo: poster || null,
      source: 'kopis',
      link: `https://kopis.or.kr/por/db/pblprfr/pblprfrView.do?menuId=MNU_00020&mt20Id=${id}`,
    });
  }
  writeFileSync(venuesPath, JSON.stringify({ updatedAt: new Date().toISOString(), venues }));
  console.log(`  공연 ${rows.length}건 중 위치 확인 ${out.length}건 (새로 찾은 공연장 ${newVenues}곳)`);
  return out;
}

// ── 카카오로 전국 동네 장소 채우기 ───────────────────────────────
// 도시마다 아이와 갈 만한 종류(박물관·수목원·해수욕장…)를 카카오 키워드 검색으로 찾는다.
// 카카오 결과에는 인기 순위가 없어서, 관광공사에도 등록된 곳이면 점수를 더 주고 사진·소개를 붙인다.
// 결과는 app/data/spots.json. 카카오 검색은 7일마다, 관광공사 확인은 한 번에 최대 400곳씩(하루 한도 때문).
const HUBS = [
  ['서울', 37.5665, 126.978], ['서울 강남', 37.4979, 127.0276], ['서울 강서', 37.5509, 126.8495], ['서울 노원', 37.6542, 127.0568],
  ['인천', 37.4563, 126.7052], ['수원', 37.2636, 127.0286], ['성남', 37.42, 127.1267], ['고양', 37.6584, 126.832],
  ['용인', 37.2411, 127.1776], ['파주', 37.76, 126.78], ['남양주', 37.636, 127.2165], ['안산', 37.3219, 126.8309],
  ['화성', 37.2, 127.07], ['평택', 36.9921, 127.1129], ['가평', 37.8315, 127.5105], ['춘천', 37.8813, 127.7298],
  ['원주', 37.3422, 127.9202], ['강릉', 37.7519, 128.8761], ['속초', 38.207, 128.5918], ['청주', 36.6424, 127.489],
  ['충주', 36.991, 127.926], ['천안', 36.8151, 127.1139], ['공주', 36.4465, 127.119], ['보령', 36.3333, 126.6127],
  ['세종', 36.48, 127.289], ['대전', 36.3504, 127.3845], ['전주', 35.8242, 127.148], ['군산', 35.9676, 126.7366],
  ['광주', 35.1595, 126.8526], ['목포', 34.8118, 126.3922], ['여수', 34.7604, 127.6622], ['순천', 34.9506, 127.4872],
  ['대구', 35.8714, 128.6014], ['경주', 35.8562, 129.2247], ['포항', 36.019, 129.3435], ['안동', 36.5684, 128.7294],
  ['김천', 36.1398, 128.1136], ['울산', 35.5384, 129.3114], ['부산', 35.1796, 129.0756], ['부산 해운대', 35.1631, 129.1636],
  ['창원', 35.228, 128.6811], ['김해', 35.2285, 128.8894], ['진주', 35.18, 128.1076], ['통영', 34.8544, 128.4331],
  ['거제', 34.8806, 128.6211], ['제주', 33.4996, 126.5312], ['서귀포', 33.2541, 126.56],
];
// [검색어, 앱 분류, 허용 조건(카카오 분류 그룹 또는 분류 이름에 들어갈 말)]
const SPOT_KW = [
  ['박물관', 'museum', /^(AT4|CT1)$/], ['과학관', 'museum', /^(AT4|CT1)$/], ['미술관', 'gallery', /^(AT4|CT1)$/],
  ['수목원', 'nature', /^AT4$/], ['자연휴양림', 'nature', /^AT4$/], ['생태공원', 'nature', /^AT4$|공원/],
  ['해수욕장', 'sea', /^AT4$/], ['동물원', 'zoo', /^AT4$|동물원/], ['아쿠아리움', 'zoo', /아쿠아리움|^AT4$/],
  ['테마파크', 'theme', /테마파크|놀이공원|^AT4$/], ['케이블카', 'activity', /^AT4$|케이블카/], ['레일바이크', 'activity', /^AT4$|레일바이크/],
  ['출렁다리', 'activity', /^AT4$/], ['키즈카페', 'kids', /^CE7$|키즈카페/], ['전통시장', 'market', /시장/], ['한옥마을', 'culture', /^AT4$/],
  // 시간 보내기 좋은 실내 복합 공간(코엑스·스타필드 같은 곳). 2026-11-15 누락 제보로 추가
  ['복합쇼핑몰', 'shop', /쇼핑몰|백화점/], ['실내놀이터', 'kids', /놀이|키즈/], ['방탈출', 'activity', /방탈출|테마카페|오락/],
];
const SPOT_BAD = /주차장|매표소|화장실|충전소|정류장|입구|정문|후문|사무소|사무실|관리소|안내소|대학교|분소|매점|편의점|기념품|수장고|연구소|예정\)|유통센터|농수산물/;


// 사진이 없는 곳에 한국관광공사 포토코리아(관광사진 정보, 공공누리 1유형) 사진을 붙인다.
// 이름으로 검색해 사진 제목·검색어·촬영지에 장소 이름이 들어간 것만 쓴다. 하루 200곳까지, 한도/오류가 나면 다음 날 이어서 한다.
async function collectPhotoKorea(spots) {
  const norm = (t) => String(t || '').replace(/[\s·()\-_/]/g, '').toLowerCase();
  let done = 0, found = 0, logged = false;
  for (const s of spots) {
    if (done >= 200) break;
    if (s.photo || s.pk || s.pkAt) continue;
    try {
      const name = s.name.replace(/\s*\(.*?\)\s*/g, ' ').trim();
      calls.tour++;
      const q = new URLSearchParams({ serviceKey: env.DATA_GO_KR_KEY, MobileOS: 'ETC', MobileApp: 'eodigaji', _type: 'json', arrange: 'A', numOfRows: '8', pageNo: '1', keyword: name });
      const j = await getJson(`https://apis.data.go.kr/B551011/PhotoGalleryService1/gallerySearchList1?${q}`, undefined, 'photokorea');
      const head = j?.response?.header;
      if (head && head.resultCode !== '0000') throw new Error(`${head.resultCode} ${head.resultMsg}`);
      const raw = j?.response?.body?.items?.item;
      const items = Array.isArray(raw) ? raw : raw ? [raw] : [];
      if (!logged) { logged = true; console.log(`  포토코리아 첫 응답 필드: ${Object.keys(items[0] || {}).join(',') || '(결과 없음)'}`); }
      const a = norm(name);
      const hit = items.find((it) => {
        const url = it.galWebImageUrl;
        const text = norm(`${it.galTitle} ${it.galSearchKeyword} ${it.galPhotographyLocation}`);
        return url && a && text.includes(a);
      });
      if (hit) {
        s.pk = { src: https(hit.galWebImageUrl), page: 'https://phoko.visitkorea.or.kr', label: `한국관광공사 포토코리아${hit.galPhotographer ? ` (${hit.galPhotographer})` : ''}` };
        found++;
      }
      s.pkAt = new Date().toISOString();
      done++;
    } catch (e) {
      console.log(`  포토코리아 실패(${s.name}): ${String(e.message).slice(0, 160)}`);
      break; // 승인 대기·한도 초과 등은 다음 날 이어서
    }
    await sleep(80);
  }
  console.log(`  포토코리아 확인 ${done}곳, 새로 찾음 ${found}곳 (붙은 곳 전체 ${spots.filter((s) => s.pk).length}곳)`);
}

// 사진이 없는 곳에 위키백과(한국어) 문서의 대표 사진을 붙인다. 좌표 근처(1km) 문서 가운데 제목이 장소 이름과 겹치는 것만 쓰고,
// 자유 이용 사진(위키미디어 공용)만 받는다. 위키 서버가 한꺼번에 많이 부르면 막으므로 한 번에 120곳까지, 막히면 다음 날 이어서 한다.
async function collectWikiPhotos(spots) {
  const norm = (t) => String(t || '').replace(/[\s·()\-_/]/g, '').toLowerCase();
  let done = 0, found = 0, blocked = false;
  for (const s of spots) {
    if (done >= 120 || blocked) break;
    if (s.photo || s.pk || s.wpAt) continue;
    try {
      const url = `https://ko.wikipedia.org/w/api.php?action=query&generator=geosearch&ggscoord=${s.lat}|${s.lng}&ggsradius=1000&ggslimit=10&prop=pageimages&piprop=thumbnail|name&pithumbsize=800&format=json&formatversion=2`;
      let res;
      for (let t = 0; t < 3; t++) { // 호출 제한(429)이면 알려 준 시간(Retry-After, 최대 30초)만큼 쉬고 다시 시도
        res = await fetch(url, { headers: { 'User-Agent': 'PlaceImageCollector/1.0 (non-commercial hobby app)' } });
        if (res.status !== 429) break;
        await sleep(Math.min(30, Number(res.headers.get('retry-after')) || 10) * 1000);
      }
      if (res.status === 429 || res.status === 403) { blocked = true; console.log(`  위키백과 호출 제한(${res.status}), 다음 날 이어서 함`); break; }
      const text = await res.text();
      let j;
      try { j = JSON.parse(text); } catch { blocked = true; console.log('  위키백과가 JSON이 아닌 답을 줘서 멈춤(호출 제한으로 추정)'); break; }
      const a = norm(s.name.replace(/\s*\(.*?\)\s*/g, ' '));
      const hit = (j.query?.pages || []).find((pg) => {
        const b = norm(pg.title);
        return pg.thumbnail?.source?.includes('/wikipedia/commons/') && a && b && (a.includes(b) || b.includes(a));
      });
      if (hit) {
        s.wp = { src: hit.thumbnail.source, page: `https://ko.wikipedia.org/wiki/${encodeURIComponent(hit.title.replace(/ /g, '_'))}`, label: `위키백과 "${hit.title}"` };
        found++;
      }
      s.wpAt = new Date().toISOString();
      done++;
    } catch (e) {
      console.log(`  위키백과 실패 ${s.name}: ${e.message}`);
      break;
    }
    await sleep(1500);
  }
  console.log(`  위키백과 사진 확인 ${done}곳, 새로 찾음 ${found}곳 (붙은 곳 전체 ${spots.filter((s) => s.wp).length}곳)`);
}

async function collectSpots() {
  if (!env.KAKAO_REST_KEY) { console.log('  KAKAO_REST_KEY 없음, 건너뜀'); return; }
  const path = `${ROOT}app/data/spots.json`;
  let prev = null;
  try { prev = JSON.parse(readFileSync(path, 'utf8')); } catch { /* 처음 */ }
  let spots = prev?.spots || [];

  if (!prev || Date.parse(prev.searchedAt) < Date.now() - 7 * 86400000) {
    const byId = new Map();
    for (const [hub, y, x] of HUBS) {
      for (const [kw, cat, ok] of SPOT_KW) {
        try {
          calls.kakao = (calls.kakao || 0) + 1;
          const j = await getJson(`https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(kw)}&x=${x}&y=${y}&radius=20000&sort=accuracy&size=15`, {
            headers: { Authorization: `KakaoAK ${env.KAKAO_REST_KEY}` },
          }, 'kakao-spot');
          let pos = 0;
          for (const d of j.documents || []) {
            if (pos >= 5) break;
            if (!(ok.test(d.category_group_code) || ok.test(d.category_name))) continue;
            if (SPOT_BAD.test(d.place_name) || /도서관|영화관|주차장|학원/.test(d.category_name)) continue;
            pos++;
            const old = byId.get(d.id);
            if (old) { old.hits++; continue; }
            const addr = d.road_address_name || d.address_name || '';
            byId.set(d.id, {
              id: `k-${d.id}`, name: d.place_name, cat,
              region: addr.split(' ').slice(0, 2).join(' ').replace(/특별자치도|특별자치시|통합특별시/, ''),
              lat: Number(Number(d.y).toFixed(5)), lng: Number(Number(d.x).toFixed(5)),
              sub: d.category_name.split(' > ').slice(-1)[0], url: d.place_url, pos, hits: 1,
            });
          }
        } catch (e) {
          console.log(`  카카오 검색 실패 ${hub} ${kw}: ${e.message}`);
        }
        await sleep(40);
      }
    }
    // 지난번에 관광공사에서 확인한 결과는 이어받는다.
    const old = new Map(spots.map((s) => [s.id, s]));
    spots = [...byId.values()].map((s) => {
      const o = old.get(s.id);
      return o ? { ...s, must: o.must, kto: o.kto, photo: o.photo, overview: o.overview, ktoAt: o.ktoAt, cid: o.cid, photos: o.photos, photosAt: o.photosAt, ctype: o.ctype, parking: o.parking, parkingFee: o.parkingFee, introAt: o.introAt, wp: o.wp, wpAt: o.wpAt, pk: o.pk, pkAt: o.pkAt } : s;
    });
    prev = { searchedAt: new Date().toISOString() };
  }

  // 반드시 있어야 하는 곳(tools/must-have.mjs): 이미 있으면 건너뛰고, 없으면 카카오에서 이름으로 찾아 넣는다.
  for (const [q, cat, max, must] of MUST_HAVE) {
    if (!max || spots.some((s) => s.must?.includes(q))) continue;
    try {
      calls.kakao = (calls.kakao || 0) + 1;
      const j = await getJson(`https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(q)}&sort=accuracy&size=15`, {
        headers: { Authorization: `KakaoAK ${env.KAKAO_REST_KEY}` },
      }, 'kakao-must');
      let n = 0;
      for (const d of j.documents || []) {
        if (n >= max) break;
        if (!d.place_name.replace(/\s/g, '').includes(must.replace(/\s/g, '')) || /주차장|매표소|화장실|정류장|입구|사무|고객센터|지점|\s\d+호|약국|은행|병원|예정/.test(d.place_name)) continue;
        // 건물 안 입점 매장(예: "코엑스 스타벅스")은 건너뛴다: 쇼핑몰·문화시설·관광명소 계열만 받는다.
        // 이름이 찾는 이름으로 시작하고 길이가 비슷하면(예: "코엑스마곡 컨벤션센터") 분류가 뭐든 받는다.
        const norm = d.place_name.replace(/\s/g, '');
        const same = norm.startsWith(must.replace(/\s/g, '')) && norm.length <= must.replace(/\s/g, '').length + 8;
        if (!same && !/쇼핑몰|백화점|도서관|관광|문화|아쿠아|박물관|미술관|전시|테마|놀이/.test(d.category_name)) continue;
        n++;
        const idx = spots.findIndex((s) => s.id === `k-${d.id}`);
        const addr = d.road_address_name || d.address_name || '';
        const row = {
          id: `k-${d.id}`, name: d.place_name, cat,
          region: addr.split(' ').slice(0, 2).join(' ').replace(/특별자치도|특별자치시|통합특별시/, ''),
          lat: Number(Number(d.y).toFixed(5)), lng: Number(Number(d.x).toFixed(5)),
          sub: d.category_name.split(' > ').slice(-1)[0], url: d.place_url, pos: 1, hits: 4, must: [q],
        };
        if (idx >= 0) spots[idx] = { ...spots[idx], must: [...new Set([...(spots[idx].must || []), q])], cat };
        else spots.push(row);
      }
      if (!n) console.log(`  ⚠ 누락: 반드시 있어야 하는 곳 "${q}"을(를) 카카오에서 못 찾음`);
    } catch (e) {
      console.log(`  필수 장소 검색 실패 ${q}: ${e.message}`);
    }
    await sleep(40);
  }

  // 관광공사에도 있는 곳인지 확인 (1km 안, 이름이 겹치면). 하루 호출 한도 때문에 한 번에 최대 400곳.
  let checked = 0;
  for (const s of spots) {
    if (PHOTOS_ONLY || s.ktoAt || checked >= 400) continue;
    try {
      const { items } = await tour('searchKeyword2', { keyword: s.name.replace(/\s*\(.*?\)\s*/g, ' ').trim(), numOfRows: '3', pageNo: '1' });
      const hit = items.find((it) => kmBetween(s, { lat: Number(it.mapy), lng: Number(it.mapx) }) <= 1);
      s.kto = Boolean(hit);
      if (hit?.firstimage) s.photo = https(hit.firstimage);
      if (hit) {
        s.cid = hit.contentid;
        s.ctype = hit.contenttypeid;
        const d = await tour('detailCommon2', { contentId: hit.contentid });
        const ov = summarize(d.items[0]?.overview);
        if (ov) s.overview = ov;
      }
      s.ktoAt = new Date().toISOString();
      checked++;
    } catch (e) {
      console.log(`  관광공사 확인 실패 ${s.name}: ${e.message}`);
      break; // 한도 초과 등은 다음 날 이어서
    }
    await sleep(60);
  }
  // 사진 여러 장: 관광공사에 등록된 곳 중 아직 안 받은 곳만. 예전에 확인해서 번호(cid)가 없는 곳은 다시 찾는다(하루 150곳까지).
  let photoFetched = 0, refound = 0;
  for (const s of spots) {
    if (!s.kto || s.photosAt || imgBudget <= 0) continue;
    try {
      if (!s.cid) {
        if (refound >= 150) continue;
        refound++;
        const { items } = await tour('searchKeyword2', { keyword: s.name.replace(/\s*\(.*?\)\s*/g, ' ').trim(), numOfRows: '3', pageNo: '1' });
        const hit = items.find((it) => kmBetween(s, { lat: Number(it.mapy), lng: Number(it.mapx) }) <= 1);
        if (!hit) { s.photosAt = new Date().toISOString(); continue; }
        s.cid = hit.contentid;
        s.ctype = hit.contenttypeid;
        if (!s.photo && hit.firstimage) s.photo = https(hit.firstimage);
      }
      s.photos = await tourPhotos(s.cid, s.photo);
      if (!s.photo && s.photos[0]) s.photo = s.photos[0];
      s.photosAt = new Date().toISOString();
      photoFetched++;
    } catch (e) {
      console.log(`  사진 목록 실패 ${s.name}: ${e.message}`);
      break; // 한도 초과 등은 다음 날 이어서
    }
    await sleep(60);
  }
  console.log(`  사진 목록 ${photoFetched}곳 (여러 장 있는 곳 ${spots.filter((s) => s.photos?.length > 1).length}곳)`);
  // 주차 안내: 관광공사 번호(cid)를 아는 곳 중 아직 안 받은 곳만
  let parkFetched = 0;
  for (const s of spots) {
    if (!s.cid || s.introAt || introBudget <= 0) continue;
    try {
      await tourParking(s);
      s.introAt = new Date().toISOString();
      parkFetched++;
    } catch (e) {
      console.log(`  주차 안내 실패 ${s.name}: ${e.message}`);
      break;
    }
    await sleep(60);
  }
  console.log(`  주차 안내 ${parkFetched}곳 (안내가 있는 곳 ${spots.filter((s) => s.parking || s.parkingFee).length}곳)`);
  await collectPhotoKorea(spots);
  await collectWikiPhotos(spots);
  // 점수: 관광공사 등록 +15, 여러 도시 검색에 걸림 +, 검색 순위가 높을수록 +
  for (const s of spots) s.base = Math.min(60, 28 + (s.kto ? 15 : 0) + (5 - s.pos) * 2 + Math.min(3, s.hits - 1) * 2);
  writeFileSync(path, JSON.stringify({ searchedAt: prev.searchedAt, updatedAt: new Date().toISOString(), source: '카카오 로컬, 한국관광공사', spots }));
  console.log(`  동네 장소 ${spots.length}곳 (관광공사 확인 ${spots.filter((s) => s.ktoAt).length}곳, 등록 ${spots.filter((s) => s.kto).length}곳, 이번에 확인 ${checked}곳)`);
}

// ── 실행 ────────────────────────────────────────────────────
mkdirSync(`${ROOT}app/data`, { recursive: true });
const stamp = new Date().toISOString();

if (!PHOTOS_ONLY) {
console.log('· 축제·행사');
const festivals = await collectEvents();
console.log(`  행사 ${festivals.length}건`);
console.log('· 공연 일정 (KOPIS)');
let stages = [];
try {
  stages = await collectStages();
} catch (e) {
  // 실패하면 지난번에 모은 공연 중 아직 안 끝난 것을 그대로 둔다.
  try {
    const prev = JSON.parse(readFileSync(`${ROOT}app/data/events.json`, 'utf8')).events || [];
    stages = prev.filter((ev) => ev.source === 'kopis' && ev.end >= ymd(today));
  } catch { /* 없음 */ }
  console.log(`  공연 수집 실패, 지난 자료 ${stages.length}건 유지: ${e.message}`);
}
const events = [...festivals, ...stages];
writeFileSync(`${ROOT}app/data/events.json`, JSON.stringify({ updatedAt: stamp, source: '한국관광공사 국문 관광정보 서비스, KOPIS 공연예술통합전산망', events }));
console.log(`  행사·공연 ${events.length}건 저장`);
}

console.log('· 장소 사진·소개');
const details = await collectDetails();
console.log(`  사진 ${Object.values(details).filter((d) => d.photo).length}곳, 소개 ${Object.values(details).filter((d) => d.overview).length}곳 / ${PLACES.length}곳`);

console.log('· 전국 동네 장소 (카카오)');
await collectSpots();

let prevPlaces = {};
try { prevPlaces = JSON.parse(readFileSync(`${ROOT}app/data/places.json`, 'utf8')).places || {}; } catch { /* 처음 */ }
if (PHOTOS_ONLY) {
  for (const p of PLACES) {
    const d = details[p.id] || {};
    if (prevPlaces[p.id] && d.photos?.length > 1) prevPlaces[p.id].photos = d.photos;
    if (prevPlaces[p.id] && d.parking) prevPlaces[p.id].parking = d.parking;
    if (prevPlaces[p.id] && d.parkingFee) prevPlaces[p.id].parkingFee = d.parkingFee;
  }
  const prevFile = JSON.parse(readFileSync(`${ROOT}app/data/places.json`, 'utf8'));
  writeFileSync(`${ROOT}app/data/places.json`, JSON.stringify({ ...prevFile, places: prevPlaces }));
  console.log(`  사진 여러 장 있는 곳 ${Object.values(prevPlaces).filter((r) => r.photos?.length > 1).length}/${PLACES.length}곳`);
  console.log(`호출 수: 관광공사 ${calls.tour}회`);
  process.exit(0);
}
const nv = await collectNaver(prevPlaces);
const places = {};
for (const p of PLACES) {
  const row = {};
  if (nv.interest[p.id]) row.interest = nv.interest[p.id];
  if (nv.yearlyScore[p.id] != null) row.yearly = nv.yearlyScore[p.id];
  if (nv.trendOf[p.id] != null) row.trend = nv.trendOf[p.id];
  if (nv.buzz[p.id] != null) { row.buzz = nv.buzz[p.id]; row.buzzAt = nv.buzzAt[p.id]; }
  const d = details[p.id] || {};
  if (d.photo) row.photo = d.photo;
  if (d.photos?.length > 1) row.photos = d.photos;
  if (d.parking) row.parking = d.parking;
  if (d.parkingFee) row.parkingFee = d.parkingFee;
  if (d.overview) row.overview = d.overview;
  row.keyword = keywordOf(p);
  places[p.id] = row;
}
writeFileSync(`${ROOT}app/data/places.json`, JSON.stringify({ updatedAt: stamp, anchor: ANCHOR, places }));
const withStats = Object.values(places).filter((r) => r.interest || r.yearly != null).length;
console.log(`  장소 통계 ${withStats}/${PLACES.length}곳 저장`);
console.log(`호출 수: 관광공사 ${calls.tour}회, 네이버 ${calls.naver}회, KOPIS ${calls.kopis || 0}회, 카카오 ${calls.kakao || 0}회`);
