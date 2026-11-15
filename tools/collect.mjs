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
import { MUST_EVENTS } from './must-events.mjs';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
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
async function relative(list, extra, startDate, timeUnit, kwOf = keywordOf) {
  const result = {};
  for (const group of chunks(list, 4)) {
    const body = {
      startDate, endDate: ymd(yesterday), timeUnit,
      keywordGroups: [
        { groupName: '__anchor', keywords: [ANCHOR] },
        ...group.map((p) => ({ groupName: p.id, keywords: [kwOf(p)] })),
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
  ['인천', 37.4563, 126.7052], ['수원', 37.2696, 126.9547], ['성남', 37.42, 127.1267], ['고양', 37.6584, 126.832],
  ['용인', 37.2411, 127.1776], ['파주', 37.76, 126.78], ['남양주', 37.636, 127.2165], ['안산', 37.3204, 126.8454],
  ['화성', 37.2, 127.07], ['오산', 37.1307, 127.0809], ['평택', 37.0009, 127.1008], ['가평', 37.8315, 127.5105], ['춘천', 37.8813, 127.7298],
  ['원주', 37.3422, 127.9202], ['강릉', 37.7519, 128.8761], ['속초', 38.207, 128.5918], ['청주', 36.6424, 127.489],
  ['충주', 36.991, 127.926], ['천안', 36.8151, 127.1139], ['공주', 36.4465, 127.119], ['보령', 36.3333, 126.6127],
  ['세종', 36.48, 127.289], ['대전', 36.3504, 127.3845], ['전주', 35.8242, 127.148], ['군산', 35.9676, 126.7366],
  ['광주', 35.1595, 126.8526], ['목포', 34.8118, 126.3922], ['여수', 34.7604, 127.6622], ['순천', 34.9506, 127.4872],
  ['대구', 35.8714, 128.6014], ['경주', 35.8562, 129.2247], ['포항', 36.019, 129.3435], ['안동', 36.5684, 128.7294],
  ['김천', 36.1398, 128.1136], ['울산', 35.5384, 129.3114], ['부산', 35.1796, 129.0756], ['부산 해운대', 35.1631, 129.1636],
  ['창원', 35.228, 128.6811], ['김해', 35.2285, 128.8894], ['진주', 35.18, 128.1076], ['통영', 34.8544, 128.4331],
  ['거제', 34.8806, 128.6211], ['제주', 33.4996, 126.5312], ['서귀포', 33.2541, 126.56],
  // 2026-11-15 사용자 제보("시흥 거북섬·송도·부천·대부도 같은 곳이 없다")로 거점을 크게 늘림: 서울 안쪽 + 수도권 + 지방 소도시
  ['서울 용산', 37.5326, 126.9906], ['서울 성동', 37.5634, 127.0369], ['서울 송파', 37.5145, 127.1059], ['서울 마포', 37.5663, 126.9019],
  ['서울 영등포', 37.5264, 126.8963], ['서울 관악', 37.4784, 126.9516], ['서울 성북', 37.5894, 127.0167],
  ['시흥', 37.38, 126.8029], ['부천', 37.5034, 126.766], ['광명', 37.4786, 126.8644], ['안양', 37.3943, 126.9568], ['의정부', 37.7381, 127.0337],
  ['양주', 37.7852, 127.0458], ['포천', 37.8949, 127.2003], ['동두천', 37.9036, 127.0607], ['이천', 37.272, 127.435], ['여주', 37.2983, 127.637],
  ['양평', 37.4912, 127.4875], ['하남', 37.5393, 127.2148], ['김포', 37.6153, 126.7156], ['인천 송도', 37.392, 126.64], ['인천 영종', 37.4932, 126.493],
  ['안산 대부도', 37.29, 126.59], ['강화', 37.7474, 126.4878], ['홍천', 37.6971, 127.8887], ['평창', 37.3706, 128.3903], ['태안', 36.7456, 126.2978],
  ['서산', 36.7848, 126.4503], ['당진', 36.8898, 126.6458], ['아산', 36.7898, 127.0018], ['부여', 36.2756, 126.9097], ['단양', 36.9845, 128.3655],
  ['문경', 36.5866, 128.1867], ['영주', 36.8057, 128.6241], ['구미', 36.1195, 128.3446], ['양산', 35.335, 129.0372], ['남원', 35.4164, 127.3905],
  ['담양', 35.3214, 126.9882], ['해남', 34.5733, 126.5992], ['완도', 34.311, 126.755], ['고창', 35.4358, 126.702], ['부안', 35.7317, 126.7335],
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
  // 2026-11-15 추가: 먹자골목·섬·한강공원·온천·전망대·촬영지·체험마을·워터파크 등 "요즘 가는 곳"과 오래된 동네 명소
  ['먹자골목', 'cafe', /먹자골목|테마거리/], ['한강공원', 'nature', /공원|^AT4$/], ['호수공원', 'nature', /공원|^AT4$/], ['온천', 'activity', /온천|^AT4$/],
  ['전망대', 'activity', /전망대|^AT4$/], ['드라마 촬영지', 'culture', /촬영지|^AT4$/], ['체험마을', 'activity', /체험|^AT4$/], ['워터파크', 'theme', /워터파크|테마파크|^AT4$/],
  ['서커스', 'stage', /서커스|공연/], ['섬', 'nature', /섬|^AT4$/], ['스트리트 쇼핑', 'shop', /쇼핑|스트리트|거리/], ['미디어아트', 'gallery', /미디어|전시|^AT4$/],
];
const SPOT_BAD = /주차장|매표소|화장실|충전소|정류장|입구|정문|후문|사무소|사무실|관리소|안내소|대학교|분소|매점|편의점|기념품|수장고|연구소|예정\)|유통센터|농수산물/;


// ── 팝업스토어·트렌드 명소 ─────────────────────────────────────
// 팝업스토어는 기간이 짧고 날짜를 주는 공식 자료가 없다. 그래서 카카오 장소 검색에서 이름에 "팝업"이 든 곳을 찾고,
// 네이버 블로그 검색(최신순)에서 최근 30일 안에 그 이름으로 쓴 글이 있는 곳만 남긴다(운영 중이라는 보증은 아니고 "최근 화제" 신호).
// 매 실행마다 새로 만들어 지난 팝업은 저절로 빠진다. 앱에는 "가기 전에 운영 기간을 확인하세요" 안내가 함께 나간다.
const POPUP_HUBS = HUBS.slice(0, 28); // 서울·수도권·강원·충청 일부까지(앞쪽 거점)
async function collectPopups(spots) {
  if (!env.KAKAO_REST_KEY || !env.NAVER_API_KEY) { console.log('  팝업: 카카오/네이버 키 없음, 건너뜀'); return spots; }
  const kept = spots.filter((s) => !s.popup); // 지난 팝업 결과는 버리고 다시 만든다
  const byId = new Map();
  for (const [hub, y, x] of POPUP_HUBS) {
    try {
      calls.kakao = (calls.kakao || 0) + 1;
      const j = await getJson(`https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent('팝업스토어')}&x=${x}&y=${y}&radius=15000&sort=accuracy&size=15`, {
        headers: { Authorization: `KakaoAK ${env.KAKAO_REST_KEY}` },
      }, 'kakao-popup');
      for (const d of j.documents || []) {
        if (!/팝업|pop[- ]?up/i.test(d.place_name) || /주차장|화장실|정류장/.test(d.place_name)) continue;
        if (byId.has(d.id) || kept.some((k) => k.id === `k-${d.id}`)) continue;
        const addr = d.road_address_name || d.address_name || '';
        byId.set(d.id, {
          id: `k-${d.id}`, name: d.place_name, cat: 'trend',
          region: addr.split(' ').slice(0, 2).join(' ').replace(/특별자치도|특별자치시|통합특별시/, ''),
          lat: Number(Number(d.y).toFixed(5)), lng: Number(Number(d.x).toFixed(5)),
          sub: '팝업스토어', url: d.place_url, pos: 1, hits: 1, popup: true,
        });
      }
    } catch (e) {
      console.log(`  팝업 검색 실패 ${hub}: ${e.message}`);
    }
    await sleep(40);
  }
  let logged = false, fresh = 0;
  const now = Date.now();
  for (const c of byId.values()) {
    if (fresh >= 80) break; // 한 번에 블로그 확인 80곳까지
    try {
      calls.naver++;
      const j = await getJson(`${NAVER}/search/v1/blog?query=${encodeURIComponent(c.name)}&display=3&sort=date`, { headers: naverHeaders }, 'blog-popup');
      const items = j.items || [];
      if (!logged) { logged = true; console.log(`  팝업 블로그 첫 응답 필드: ${Object.keys(items[0] || {}).join(',') || '(결과 없음)'}`); }
      const d = String(items[0]?.postdate || '').replace(/\D/g, '').slice(0, 8);
      if (d.length !== 8) continue;
      const days = Math.floor((now - Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`)) / 86400000);
      if (days > 30) continue;
      c.blogDays = days;
      c.base = Math.min(70, 52 + (days <= 7 ? 10 : days <= 14 ? 6 : 2) + Math.min(6, Math.floor(Math.log10(Math.max(1, j.total || 1)) * 2)));
      c.overview = `팝업스토어·트렌드 명소예요. 최근 ${days}일 안에 블로그 글이 올라온 곳이라 요즘 화제인 곳으로 보여요. 운영 기간은 바뀔 수 있으니 가기 전에 꼭 확인하세요.`;
      c.ktoAt = new Date().toISOString(); // 관광공사 확인 대상이 아님
      c.pkAt = c.ktoAt; c.wpAt = c.ktoAt;
      kept.push(c);
      fresh++;
    } catch (e) {
      console.log(`  팝업 블로그 확인 실패 ${c.name}: ${String(e.message).slice(0, 100)}`);
      break;
    }
    await sleep(120);
  }
  console.log(`  팝업스토어 후보 ${byId.size}곳 중 최근 30일 화제 ${fresh}곳`);
  return kept;
}

// 사진이 없는 곳에 한국관광공사 포토코리아(관광사진 정보, 공공누리 1유형) 사진을 붙인다.
// 이름으로 검색해 사진 제목·검색어·촬영지에 장소 이름이 들어간 것만 쓴다. 하루 200곳까지, 한도/오류가 나면 다음 날 이어서 한다.
async function collectPhotoKorea(spots) {
  const norm = (t) => String(t || '').replace(/[\s·()\-_/]/g, '').toLowerCase();
  let done = 0, found = 0, logged = false;
  for (const s of spots) {
    if (done >= 200) break;
    if (s.photo || s.pk || s.pkAt) continue;
    if (norm(s.name).length < 4) { s.pkAt = new Date().toISOString(); continue; } // "점프"·"생태공원"처럼 짧고 흔한 이름은 다른 곳 사진이 붙을 수 있어 건너뜀
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
  const t0 = Date.now();
  for (const s of spots) {
    if (done >= 120 || blocked || Date.now() - t0 > 3 * 60 * 1000) break; // 3분이 넘으면 멈추고 다음 날 이어서(수집 전체 시간 보호)
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

// 동네 장소(카카오·표준데이터)에도 네이버 검색량(1년 인기·최근 추세)을 붙인다.
// 지금까지 이 장소들은 "카카오 검색 순위"로 어림한 점수뿐이라 제이드가든·노들섬처럼 실제로 인기 많은 곳도 위로 못 올라왔다.
// 네이버 데이터랩에서 기준 검색어(남이섬) 대비 배수를 받아 s.yearly(0~100), s.trend(최근 4주÷연평균)로 저장한다.
// 한 번 실행에 SPOT_TREND_CALLS 번(요청 한 번에 4곳)만 부르고, 14일이 지난 곳부터 다시 받는다. 인기 있을 법한 곳(점수 높은 순)이 먼저다.
const SPOT_TREND_CALLS = PHOTOS_ONLY ? 400 : 200;
const REL_LO = Math.log10(1e-3), REL_HI = Math.log10(8); // 기준(남이섬) 대비 0.001배~8배를 0~100점으로
const relScore = (sum) => Math.max(0, Math.min(100, Math.round((100 * (Math.log10(Math.max(sum, 1e-3)) - REL_LO)) / (REL_HI - REL_LO))));
// 네이버에서 실제로 많이 쓰는 이름이 장소 정식 이름과 다르면("원조민속순대타운"↔"신림 순대타운") must-have 목록의 5번째 칸(kw)으로 검색어를 정한다.
const spotKeyword = (s) => s.kw || s.name.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim();

async function collectSpotTrends(spots) {
  const stale = Date.now() - 14 * 86400000;
  const todo = spots
    .filter((s) => !s.popup && !(s.yAt && s.ykw === spotKeyword(s) && Date.parse(s.yAt) > stale))
    .sort((a, b) => (b.must ? 1 : 0) - (a.must ? 1 : 0) || (b.base || 0) - (a.base || 0))
    .slice(0, SPOT_TREND_CALLS * 4);
  if (!todo.length) { console.log('  동네 장소 검색량: 새로 받을 곳 없음'); return; }
  const start = new Date(today); start.setFullYear(start.getFullYear() - 1);
  const items = todo.map((s) => ({ id: s.id, name: spotKeyword(s), kw: spotKeyword(s) }));
  const rel = await relative(items, {}, ymd(start), 'week', (p) => p.kw);
  const partialWeek = yesterday.getDay() !== 0; // 이번 주가 덜 찼으면 마지막 주는 뺀다(collectNaver 와 같은 규칙)
  let got = 0;
  for (const s of todo) {
    const r = rel[s.id];
    if (!r) continue; // 요청이 실패한 곳은 다음에 다시
    const ser = partialWeek ? r.series.slice(0, -1) : r.series;
    const avg = ser.reduce((a, b) => a + b, 0) / (ser.length || 1);
    const recent = ser.slice(-4).reduce((a, b) => a + b, 0) / Math.max(1, Math.min(4, ser.length));
    s.rel = Math.round(r.sum * 1e4) / 1e4;
    s.yearly = relScore(r.sum);
    s.trend = avg > 0 ? Math.round((recent / avg) * 100) / 100 : 1;
    s.yAt = new Date().toISOString();
    s.ykw = spotKeyword(s);
    got++;
  }
  const have = spots.filter((s) => typeof s.yearly === 'number').length;
  console.log(`  동네 장소 검색량 ${got}곳 새로 받음 (전체 ${have}/${spots.length}곳 완료, 남은 ${spots.filter((s) => !s.popup && !s.yAt).length}곳)`);
}

async function collectSpots() {
  if (!env.KAKAO_REST_KEY) { console.log('  KAKAO_REST_KEY 없음, 건너뜀'); return; }
  const path = `${ROOT}app/data/spots.json`;
  let prev = null;
  try { prev = JSON.parse(readFileSync(path, 'utf8')); } catch { /* 처음 */ }
  let spots = prev?.spots || [];

  if (!prev || process.argv.includes('--research') || Date.parse(prev.searchedAt) < Date.now() - 7 * 86400000) {
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
      return o ? { ...s, must: o.must, kto: o.kto, photo: o.photo, overview: o.overview, ktoAt: o.ktoAt, cid: o.cid, photos: o.photos, photosAt: o.photosAt, ctype: o.ctype, parking: o.parking, parkingFee: o.parkingFee, introAt: o.introAt, wp: o.wp, wpAt: o.wpAt, pk: o.pk, pkAt: o.pkAt, popup: o.popup, yearly: o.yearly, trend: o.trend, rel: o.rel, yAt: o.yAt, ykw: o.ykw, kw: o.kw, disc: o.disc } : s;
    });
    const have = new Set(spots.map((s) => s.id));
    spots.push(...[...old.values()].filter((o) => (o.std || o.disc) && !have.has(o.id))); // 표준데이터 명소·블로그에서 발굴한 명소(tools/discover.mjs)는 카카오 재검색과 상관없이 이어받는다
    prev = { searchedAt: new Date().toISOString() };
  }

  // 공공데이터포털 전국관광지·지역특화거리 → 추천 명소 후보
  if (env.DATA_GO_KR_KEY) {
    try { await addStdSpots(spots); } catch (e) { console.log(`  표준데이터 명소 실패(지난 자료 유지): ${e.message}`); }
  }

  // 반드시 있어야 하는 곳(tools/must-have.mjs): 이미 있으면 건너뛰고, 없으면 카카오에서 이름으로 찾아 넣는다.
  for (const [q, cat, max, must, kw] of MUST_HAVE) {
    if (!max || spots.some((s) => s.must?.includes(q))) {
      // 이미 들어 있는 곳이어도 검색어(kw)가 바뀌었으면 반영한다.
      if (kw) for (const s of spots) if (s.must?.includes(q)) s.kw = kw;
      continue;
    }
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
          sub: d.category_name.split(' > ').slice(-1)[0], url: d.place_url, pos: 1, hits: 4, must: [q], ...(kw ? { kw } : {}),
        };
        if (idx >= 0) spots[idx] = { ...spots[idx], must: [...new Set([...(spots[idx].must || []), q])], cat, ...(kw ? { kw } : {}) };
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
      s.kto = s.std ? true : Boolean(hit); // 표준데이터에 있는 곳은 지자체가 공식 등록한 곳
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
  spots = await collectPopups(spots);
  // 점수: 관광공사 등록 +15, 여러 도시 검색에 걸림 +, 검색 순위가 높을수록 +
  if (env.NAVER_API_KEY) await collectSpotTrends(spots);
  // 표준데이터 명소는 관광지 40, 관광단지 46, 특화거리 28
  for (const s of spots) if (!s.popup) s.base = s.std ? (s.sub === '관광단지' ? 46 : s.sub === '특화거리' ? 28 : 40) : Math.min(60, 28 + (s.kto ? 15 : 0) + (5 - s.pos) * 2 + Math.min(3, s.hits - 1) * 2) + (s.disc ? Math.min(8, Math.floor(s.disc.b / 8)) : 0);
  writeFileSync(path, JSON.stringify({ searchedAt: prev.searchedAt, updatedAt: new Date().toISOString(), source: '카카오 로컬, 한국관광공사', spots }));
  console.log(`  동네 장소 ${spots.length}곳 (관광공사 확인 ${spots.filter((s) => s.ktoAt).length}곳, 등록 ${spots.filter((s) => s.kto).length}곳, 이번에 확인 ${checked}곳)`);
}

// ── 서울시 열린데이터광장 (문화행사·주차장) ─────────────────────
// 서울시 서버는 http(8088 포트)만 되어서 폰 앱이 직접 부를 수 없다. 그래서 여기서 받아 app/data 에 담아 둔다.
// 키(SEOUL_API_KEY)가 없으면 건너뛰고 지난 자료를 그대로 둔다.
async function seoulRows(service, pageSize = 1000, max = 25000) {
  const rows = [];
  for (let s = 1; s <= max; s += pageSize) {
    calls.seoul = (calls.seoul || 0) + 1;
    const res = await fetch(`http://openapi.seoul.go.kr:8088/${env.SEOUL_API_KEY}/json/${service}/${s}/${s + pageSize - 1}/`);
    const text = await res.text();
    let j;
    try { j = JSON.parse(text); } catch { throw new Error(`${service}: ${text.replace(/\s+/g, ' ').slice(0, 100).split(env.SEOUL_API_KEY).join('***')}`); }
    const body = j[service];
    const code = body?.RESULT?.CODE || j.RESULT?.CODE;
    if (code === 'INFO-200') break; // 더 이상 자료 없음
    if (!body || code !== 'INFO-000') throw new Error(`${service}: ${code || '응답 이상'}`);
    rows.push(...(body.row || []));
    if (rows.length >= body.list_total_count) break;
    await sleep(100);
  }
  return rows;
}

// 서울 문화행사 → 앱 행사 모양. 어른만 가는 행사는 뺀다.
const SEOUL_TYPE = (c = '') =>
  /^축제/.test(c) ? 'festival'
  : /전시|미술/.test(c) ? 'show'
  : /교육|체험/.test(c) ? 'hands'
  : /콘서트|클래식|국악|연극|뮤지컬|오페라|무용|독주|독창|영화/.test(c) ? 'stage'
  : 'event';
const SEOUL_ADULT_ONLY = /^(성인|활동가)|1[2-9]세\s*이상|중학생\s*이상|청소년\s*이상|19세/;
const SEOUL_KID_OK = /누구나|전체|어린이|유아|아동|가족|초등|영유아|[3-9]세\s*이상|청소년/;
const normTitle = (t) => String(t || '').replace(/\[[^\]]*\]|\([^)]*\)|「|」|<[^>]*>/g, '').replace(/[^0-9A-Za-z가-힣]/g, '').toLowerCase();
function sameEvent(a, b) {
  if (a.start > b.end || a.end < b.start) return false;
  if (kmBetween(a, b) > 1.5) return false;
  const x = normTitle(a.title), y = normTitle(b.title);
  if (x.length < 4 || y.length < 4) return false;
  return x.includes(y) || y.includes(x) || x.slice(0, 7) === y.slice(0, 7);
}

async function collectSeoulEvents(others) {
  const rows = await seoulRows('culturalEventInfo', 1000, 25000);
  const out = [];
  let adult = 0, noPos = 0, dup = 0;
  for (const r of rows) {
    const start = (r.STRTDATE || '').slice(0, 10), end = (r.END_DATE || '').slice(0, 10) || start;
    if (!start || end < ymd(today)) continue;
    const lat = Number(r.LAT), lng = Number(r.LOT);
    if (!lat || !lng) { noPos++; continue; }
    const target = (r.USE_TRGT || '').trim();
    if (SEOUL_ADULT_ONLY.test(target) && !SEOUL_KID_OK.test(target.replace(/성인/g, ''))) { adult++; continue; }
    const code = (r.HMPG_ADDR || '').match(/cultcode=(\d+)/)?.[1] || normTitle(r.TITLE).slice(0, 12);
    const fee = r.IS_FREE === '무료' ? '무료' : `유료${r.USE_FEE ? ` (${plain(r.USE_FEE).slice(0, 60)})` : ''}`;
    const program = plain(r.PROGRAM || r.ETC_DESC || '').slice(0, 80);
    const ev = {
      id: `seoul-${code}`,
      title: plain(r.TITLE),
      type: SEOUL_TYPE(r.CODENAME),
      region: `서울 ${r.GUNAME || ''}${r.PLACE ? ` · ${plain(r.PLACE)}` : ''}`.trim(),
      lat, lng, start, end,
      kid: SEOUL_KID_OK.test(target),
      desc: [plain(r.PLACE), r.PRO_TIME ? `${r.PRO_TIME} 시작` : '', fee, program].filter(Boolean).join(' · '),
      photo: https(r.MAIN_IMG) || null,
      source: 'seoul',
      link: r.ORG_LINK && /^https?:/.test(r.ORG_LINK) ? r.ORG_LINK : r.HMPG_ADDR || null,
    };
    if (others.some((o) => sameEvent(ev, o)) || out.some((o) => sameEvent(ev, o))) { dup++; continue; }
    out.push(ev);
  }
  console.log(`  서울 문화행사 ${rows.length}건 중 앞으로 열리는 ${out.length + dup + adult + noPos}건 → 추가 ${out.length}건 (중복 ${dup}, 어른 전용 ${adult}, 좌표 없음 ${noPos})`);
  return out;
}

// 서울 주차장: 요금·운영 정보를 짧게 줄여 app/data/seoul-parking.json 에 담는다.
// 좌표가 비어 있는 곳은 카카오 주소 검색으로 채우고, 한 번 찾은 좌표는 다음부터 다시 찾지 않는다.
async function collectSeoulParking() {
  const path = `${ROOT}app/data/seoul-parking.json`;
  let prev = {}, prevMissing = new Set(), prevAt = 0;
  try {
    const f = JSON.parse(readFileSync(path, 'utf8'));
    for (const r of f.lots || []) prev[r.id] = r;
    prevMissing = new Set(f.missing || []);
    prevAt = Date.parse(f.missingAt || 0) || 0;
  } catch { /* 처음 */ }
  const retryMissing = Date.now() - prevAt > 7 * 86400000; // 위치를 못 찾은 곳은 일주일에 한 번만 다시 시도
  const missing = [];
  const rows = await seoulRows('GetParkInfo', 1000, 5000);
  const hhmm = (t) => (t && String(t).length === 4 ? `${String(t).slice(0, 2)}:${String(t).slice(2)}` : '');
  const lots = [];
  let geocoded = 0, noPos = 0;
  for (const r of rows) {
    const id = String(r.PKLT_CD);
    let lat = Number(r.LAT), lng = Number(r.LOT);
    if (!lat || !lng) {
      if (prev[id]?.lat) { lat = prev[id].lat; lng = prev[id].lng; }
      else if (env.KAKAO_REST_KEY && (retryMissing || !prevMissing.has(id)) && r.ADDR) {
        try {
          calls.kakao = (calls.kakao || 0) + 1;
          const j = await getJson(`https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(`서울 ${r.ADDR}`)}&size=1`, { headers: { Authorization: `KakaoAK ${env.KAKAO_REST_KEY}` } }, 'kakao-addr');
          const d = j.documents?.[0];
          if (d) { lat = Number(Number(d.y).toFixed(5)); lng = Number(Number(d.x).toFixed(5)); geocoded++; }
        } catch { /* 다음에 다시 */ }
        await sleep(30);
      }
    }
    if (!lat || !lng) { noPos++; missing.push(id); continue; }
    const paid = r.CHGD_FREE_SE === 'Y';
    lots.push({
      id, name: plain(r.PKLT_NM), addr: r.ADDR || '', lat: Number(Number(lat).toFixed(5)), lng: Number(Number(lng).toFixed(5)),
      kind: r.PKLT_KND_NM === '노상 주차장' ? '노상' : '노외',
      n: Number(r.TPKCT) || 0,
      paid,
      // 기본요금(기본 시간)·추가요금(단위 시간)·하루 최대·월 정기권
      base: paid && r.PRK_CRG ? [Number(r.PRK_CRG), Number(r.PRK_HM) || 0] : null,
      add: paid && r.ADD_CRG ? [Number(r.ADD_CRG), Number(r.ADD_UNIT_TM_MNT) || 0] : null,
      day: paid && Number(r.DLY_MAX_CRG) ? Number(r.DLY_MAX_CRG) : null,
      wd: hhmm(r.WD_OPER_BGNG_TM) && `${hhmm(r.WD_OPER_BGNG_TM)}~${hhmm(r.WD_OPER_END_TM)}`,
      satFree: r.SAT_CHGD_FREE_NM === '무료', holFree: r.LHLDY_NM === '무료',
      tel: r.TELNO || '',
    });
  }
  writeFileSync(path, JSON.stringify({ updatedAt: new Date().toISOString(), source: '서울 열린데이터광장 GetParkInfo', missing, missingAt: retryMissing ? new Date().toISOString() : new Date(prevAt).toISOString(), lots }));
  console.log(`  서울 주차장 ${rows.length}곳 중 위치 있는 ${lots.length}곳 저장 (카카오 주소로 새로 찾은 곳 ${geocoded}, 위치 못 찾음 ${noPos})`);
}

// ── 공공데이터포털 전국 표준데이터 (지자체가 직접 올리는 자료) ─────────
// 전국문화축제 · 전국공연행사정보 · 전국주차장정보 · 전국관광지정보 · 전국지역특화거리.
// 모두 DATA_GO_KR_KEY 하나로 받는다(각 자료를 활용신청해서 승인받은 키). 승인 전이면 403 이 나오고, 그때는 지난 자료를 그대로 둔다.
async function stdRows(ep) {
  const rows = [];
  for (let page = 1; page <= 60; page++) {
    calls.std = (calls.std || 0) + 1;
    const j = await getJson(`http://api.data.go.kr/openapi/${ep}?serviceKey=${encodeURIComponent(env.DATA_GO_KR_KEY)}&pageNo=${page}&numOfRows=1000&type=json`, undefined, ep);
    if (!j?.body) throw new Error(`${ep}: ${JSON.stringify(j).replace(env.DATA_GO_KR_KEY, '***').slice(0, 100)}`);
    const items = [].concat(j.body.items?.item || j.body.items || []);
    rows.push(...items);
    if (!items.length || page * 1000 >= Number(j.body.totalCount || 0)) break;
    await sleep(100);
  }
  return rows;
}
const hash36 = (s) => { let h = 5381; for (const c of String(s)) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0; return h.toString(36); };
const STD_AREA = (a = '') => ({ 전남광주통합특별시: '광주', 광주특별시: '광주', 광주광역시: '광주' }[a] || SHORT_AREA(a));
// 2026년 광주·전남이 합쳐져 주소가 모두 "전남광주통합특별시"로 나온다. 광주 5개 구만 광주, 나머지 시·군은 전남으로 본다.
const stdRegion = (r) => {
  const t = String(r.rdnmadr || r.lnmadr || '').split(' ');
  const area = t[0] === '전남광주통합특별시' ? (/^(동구|서구|남구|북구|광산구)$/.test(t[1]) ? '광주' : '전남') : STD_AREA(t[0]);
  return `${area} ${t[1] || ''}`.trim();
};
const stdPos = (r) => { const lat = Number(r.latitude), lng = Number(r.longitude); return lat > 32 && lat < 39.5 && lng > 124 && lng < 132 ? { lat: Number(lat.toFixed(5)), lng: Number(lng.toFixed(5)) } : null; };
const stdUrl = (u) => { const s = String(u || '').trim(); if (!s) return null; return /^https?:\/\//i.test(s) ? s : /^[\w.-]+\.[a-z]{2,}/i.test(s) ? `http://${s}` : null; };
const STD_KID_OK = /제한\s*없|전연령|전체|누구나|가족|영유아|유아|어린이|아동|초등|[3-9]세\s*이상|청소년/;
const STD_TYPE = (t = '') =>
  /축제|페스티벌|페스타/.test(t) ? 'festival'
  : /전시|미술|사진전|박람|갤러리|공예/.test(t) ? 'show'
  : /체험|교육|강좌|만들기|교실|캠프|워크숍/.test(t) ? 'hands'
  : /공연|연극|음악|콘서트|뮤지컬|무용|인형극|영화|연주|오케스트라|국악|합창|마술|서커스/.test(t) ? 'stage'
  : 'event';

/** 지자체 축제(전국문화축제) + 공연·행사(전국공연행사정보) 중 앞으로 열리는 것. others 와 겹치면 뺀다. */
async function collectStdEvents(others) {
  const today0 = ymd(today);
  const out = [];
  let dup = 0, adult = 0, noPos = 0;
  const push = (ev) => {
    if (others.some((o) => sameEvent(ev, o)) || out.some((o) => sameEvent(ev, o))) { dup++; return; }
    out.push(ev);
  };
  for (const r of await stdRows('tn_pubr_public_cltur_fstvl_api')) {
    const start = r.fstvlStartDate, end = r.fstvlEndDate || start;
    if (!start || end < start || end < today0) continue;
    const pos = stdPos(r);
    if (!pos) { noPos++; continue; }
    push({
      id: `std-f-${hash36(`${r.fstvlNm}|${start}`)}`,
      title: plain(r.fstvlNm), type: 'festival', region: stdRegion(r), ...pos, start, end, kid: null,
      desc: [plain(r.opar), plain(r.fstvlCo).replace(/\+/g, ' · ').slice(0, 100)].filter(Boolean).join(' · '),
      photo: null, source: 'std', link: stdUrl(r.homepageUrl),
    });
  }
  const nFest = out.length;
  for (const r of await stdRows('tn_pubr_public_pblprfr_event_info_api')) {
    const start = r.eventStartDate, end = r.eventEndDate || start;
    if (!start || end < start || end < today0) continue;
    const pos = stdPos(r);
    if (!pos) { noPos++; continue; }
    const age = String(r.entncAge || '').trim();
    if (SEOUL_ADULT_ONLY.test(age) && !STD_KID_OK.test(age.replace(/성인/g, ''))) { adult++; continue; }
    const fee = /무료/.test(r.chrgeInfo || '') ? '무료' : [r.chrgeInfo, r.admfee].map(plain).filter(Boolean).join(' ').slice(0, 60);
    push({
      id: `std-e-${hash36(`${r.eventNm}|${start}|${r.opar}`)}`,
      title: plain(r.eventNm), type: STD_TYPE(`${r.eventNm} ${r.eventCo}`), region: stdRegion(r), ...pos, start, end,
      kid: STD_KID_OK.test(age) ? true : null,
      desc: [plain(r.opar), r.eventStartTime ? `${r.eventStartTime} 시작` : '', fee, plain(r.eventCo).slice(0, 80), age ? `관람 ${age}` : ''].filter(Boolean).join(' · '),
      photo: null, source: 'std', link: stdUrl(r.homepageUrl),
    });
  }
  console.log(`  지자체 축제 ${nFest}건 + 공연·행사 ${out.length - nFest}건 추가 (중복 ${dup}, 어른 전용 ${adult}, 좌표 없음 ${noPos})`);
  return out;
}

// 전국시티투어정보: 좌표가 없어서 장소로는 못 쓰고, 시·군·구별 "이 지역에 시티투어가 있어요" 안내로만 쓴다.
// app/data/citytour.json 에 { "<시도 두 글자>|<시군구에서 시·군·구를 뗀 이름>": [{ c: 코스, run: 운행, fee: 요금, tel, url, brd: 탑승지 }] } 로 담는다.
const stripGun = (n) => String(n || '').replace(/(시|군|구)$/, '');
async function collectCityTours() {
  const rows = await stdRows('tn_pubr_public_city_tour_api');
  const clean = (t, n) => plain(t).replace(/\s*\+\s*/g, ' · ').slice(0, n);
  const tours = {};
  for (const r of rows) {
    const area = r.ctprvnNm === '전남광주통합특별시' ? (/^(동구|서구|남구|북구|광산구)$/.test(r.signguNm) ? '광주' : '전남') : STD_AREA(r.ctprvnNm);
    const key = `${area.slice(0, 2)}|${stripGun(r.signguNm)}`;
    const c = clean(r.cityTourCourse, 40);
    if (!c) continue;
    const list = (tours[key] ||= []);
    if (list.some((x) => x.c === c)) continue;
    list.push({
      c,
      run: [clean(r.operHhmm, 60), r.operOpenHhmm && r.operCloseHhmm && !/\d{2}:\d{2}/.test(r.operHhmm || '') ? `${r.operOpenHhmm}~${r.operCloseHhmm}` : ''].filter(Boolean).join(' · '),
      fee: clean(r.useCharge, 70),
      brd: clean(r.brdngPlaceNm, 50),
      tel: r.phoneNumber || '',
      url: stdUrl(r.homepageUrl),
    });
  }
  writeFileSync(`${ROOT}app/data/citytour.json`, JSON.stringify({ updatedAt: new Date().toISOString(), source: '공공데이터포털 전국시티투어정보표준데이터', tours }));
  console.log(`  시티투어 ${rows.length}개 코스 → ${Object.keys(tours).length}개 시·군·구 저장`);
}

/**
 * 직접 확인해 넣는 행사(tools/must-events.mjs)를 목록에 더한다.
 * 이미 목록에 같은 행사(제목·날짜·장소가 겹침)가 있으면 — 공공 자료에 올라온 것 — 직접 넣은 쪽은 뺀다. 끝난 행사도 뺀다.
 */
function withManualEvents(events) {
  const base = events.filter((e) => e.source !== 'manual');
  const add = MUST_EVENTS
    .filter((m) => m.end >= ymd(today))
    .map((m) => ({ ...m, source: 'manual' }))
    .filter((m) => !base.some((o) => sameEvent(m, o)));
  return [...base, ...add];
}

// 전국주차장정보: 격자(0.25도 ≈ 가로 22km × 세로 28km)별 파일로 나눠 app/data/parking/ 에 담는다.
// 앱은 장소 둘레(2km) 가 걸치는 격자 파일만 받는다. 서울은 서울시 자료(seoul-parking.json)가 더 자세해서 뺀다.
const PARK_CELL = (lat, lng) => `${Math.floor(lat * 4)}_${Math.floor(lng * 4)}`;
async function collectStdParking() {
  const rows = await stdRows('tn_pubr_prkplce_info_api');
  const hm = (a, b) => (a && b ? (/^0?0:?00$/.test(a) && /^(23:59|24:00|2400)$/.test(b) ? '00:00~24:00' : `${a}~${b}`) : '');
  const cells = {};
  let kept = 0;
  for (const r of rows) {
    const pos = stdPos(r);
    if (!pos || /^서울/.test(r.lnmadr || r.rdnmadr || '')) continue;
    if (r.prkplceType === '부설' || (r.prkplceSe === '민영' && (r.prkplceType === '노상' || Number(String(r.prkcmprt).replace(/[^d]/g, '')) < 30))) continue; // 건물 손님 전용, 노상 민영, 30면 미만 민영은 뺀다
    const paid = !/^무료/.test(r.parkingchrgeInfo || '');
    const num = (v) => Number(String(v || '').replace(/[^\d.]/g, '')) || 0;
    const lot = {
      id: `p${r.prkplceNo}`, name: plain(r.prkplceNm), addr: r.rdnmadr || r.lnmadr || '', ...pos,
      kind: r.prkplceType === '노상' ? '노상' : '노외', pub: r.prkplceSe === '공영',
      n: num(r.prkcmprt), paid,
      base: paid && num(r.basicCharge) ? [num(r.basicCharge), num(r.basicTime)] : null,
      add: paid && num(r.addUnitCharge) ? [num(r.addUnitCharge), num(r.addUnitTime)] : null,
      day: paid && num(r.dayCmmtkt) ? num(r.dayCmmtkt) : null,
      wd: hm(r.weekdayOperOpenHhmm, r.weekdayOperColseHhmm),
      satFree: false, holFree: false,
      tel: r.phoneNumber || '',
    };
    (cells[PARK_CELL(pos.lat, pos.lng)] ||= []).push(lot);
    kept++;
  }
  const dir = `${ROOT}app/data/parking`;
  mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(dir)) if (!(f.replace('.json', '') in cells)) unlinkSync(`${dir}/${f}`);
  for (const [k, lots] of Object.entries(cells)) writeFileSync(`${dir}/${k}.json`, JSON.stringify({ lots }));
  writeFileSync(`${dir}/index.json`, JSON.stringify({ updatedAt: new Date().toISOString(), source: '공공데이터포털 전국주차장정보표준데이터', cells: Object.fromEntries(Object.entries(cells).map(([k, v]) => [k, v.length])) }));
  console.log(`  전국 주차장 ${rows.length}곳 중 ${kept}곳을 ${Object.keys(cells).length}개 격자 파일로 저장 (서울·건물 전용 제외)`);
}

// 전국관광지정보 + 전국지역특화거리 → 추천 명소 후보(동네 장소와 같은 모양)
const STD_CAT = (name, intro, kind) => {
  const t = `${name} ${intro}`;
  if (kind === '특화거리') {
    return /시장|장터/.test(name) ? 'market' : /카페|커피|디저트|빵/.test(t) ? 'cafe' : /음식|먹거리|먹자|맛|식당|횟집|고기|구이|국밥|치킨|족발|막걸리|포장마차|야시장/.test(t) ? 'cafe' : /문화|예술|전통|한옥|역사|공예|도자|한복/.test(t) ? 'culture' : /패션|의류|디자인|가구|도서|책|만화|웹툰|소품|골목/.test(t) ? 'shop' : 'walk';
  }
  return /박물관|과학관|전시관|기념관|체험관|천문대/.test(name) ? 'museum'
    : /동물원|아쿠아|수족관|목장|농장/.test(name) ? 'zoo'
    : /해수욕장|해변|바다|포구|항|해안|섬|갯벌|등대/.test(name) ? 'sea'
    : /테마파크|랜드|리조트|워터|유원지/.test(name) ? 'theme'
    : /스키|레일바이크|레포츠|집라인|루지|짚|래프팅|카트|골프/.test(t) ? 'activity'
    : /한옥|고택|사찰|사|성곽|산성|궁|유적|민속|마을|서원|향교|역사|전통|문화/.test(name) ? 'culture'
    : /공원|숲|수목원|정원|호수|계곡|폭포|산|휴양림|자연|생태|습지|온천|저수지|강|천|꽃|둘레길|누리길|해맞이/.test(name) ? 'nature'
    : 'nature';
};
async function fetchStdPlaces() {
  const out = [];
  const seen = [];
  const add = (r, kind) => {
    const name = plain(kind === '특화거리' ? r.stretNm : r.trrsrtNm).replace(/\s+/g, ' ');
    const pos = stdPos(r);
    if (!name || !pos) return;
    if (kind === '특화거리' && /공구|웨딩|오토바이|귀금속|철물|자동차|부품|인쇄|안경|조명|가구|건축자재|중고|여성친화|안전/.test(name)) return; // 나들이로 가는 거리가 아닌 업종 거리
    if (/골프|컨트리클럽|CC$/.test(name) || /^(신영|라비에벨)$/.test(name)) return; // 골프장·골프 리조트는 나들이 명소로 쓰지 않는다
    if (seen.some((s) => s.name === name && kmBetween(s, pos) < 0.5)) return;
    seen.push({ name, ...pos });
    const intro = plain(kind === '특화거리' ? r.stretIntrcn : r.trrsrtIntrcn);
    const sub = kind === '특화거리' ? '특화거리' : (r.trrsrtSe || '관광지');
    out.push({
      id: `std-${kind === '특화거리' ? 's' : 't'}-${hash36(`${name}|${pos.lat}|${pos.lng}`)}`,
      name, cat: STD_CAT(name, intro, kind), region: stdRegion(r), ...pos, sub,
      stdOverview: summarize(intro), std: true, kto: true, pos: 3, hits: 1,
    });
  };
  for (const r of await stdRows('tn_pubr_public_trrsrt_api')) add(r, '관광지');
  for (const r of await stdRows('tn_pubr_public_area_spcliz_stret_api')) add(r, '특화거리');
  return out;
}
/** spots(동네 장소 목록)에 표준데이터 명소를 넣거나 새로 고친다. @returns 새로 넣은 수 */
async function addStdSpots(spots) {
  const std = await fetchStdPlaces();
  const byId = new Map(spots.map((s) => [s.id, s]));
  let added = 0;
  for (const p of std) {
    const o = byId.get(p.id);
    if (o) Object.assign(o, { name: p.name, cat: p.cat, region: p.region, lat: p.lat, lng: p.lng, sub: p.sub, std: true, stdOverview: p.stdOverview, kto: true });
    else { spots.push(p); added++; }
  }
  // 이번 목록에 더는 없는 표준데이터 명소(제외 규칙이 바뀌었거나 자료에서 빠진 곳)는 뺀다.
  const keep = new Set(std.map((p) => p.id));
  for (let i = spots.length - 1; i >= 0; i--) if (spots[i].std && !keep.has(spots[i].id)) spots.splice(i, 1);
  console.log(`  표준데이터 명소 ${std.length}곳 (관광지·관광단지 ${std.filter((p) => p.sub !== '특화거리').length}, 특화거리 ${std.filter((p) => p.sub === '특화거리').length}) 중 새로 넣은 ${added}곳`);
  return added;
}

// ── 실행 ────────────────────────────────────────────────────
mkdirSync(`${ROOT}app/data`, { recursive: true });
const stamp = new Date().toISOString();

// 표준데이터만 받기: node tools/collect.mjs --std (지자체 행사·전국 주차장·관광지/특화거리 명소. 네이버·관광공사 한도를 쓰지 않는다)
if (process.argv.includes('--std')) {
  const file = JSON.parse(readFileSync(`${ROOT}app/data/events.json`, 'utf8'));
  const others = file.events.filter((ev) => ev.source !== 'std');
  console.log('· 지자체 축제·공연행사');
  const std = await collectStdEvents(others);
  writeFileSync(`${ROOT}app/data/events.json`, JSON.stringify({ ...file, events: withManualEvents([...others, ...std]) }));
  console.log('· 전국 주차장');
  await collectStdParking();
  console.log('· 시티투어');
  await collectCityTours();
  console.log('· 관광지·지역특화거리 명소');
  const sp = JSON.parse(readFileSync(`${ROOT}app/data/spots.json`, 'utf8'));
  await addStdSpots(sp.spots);
  for (const x of sp.spots) if (x.std) x.base = x.sub === '관광단지' ? 46 : x.sub === '특화거리' ? 28 : 40;
  writeFileSync(`${ROOT}app/data/spots.json`, JSON.stringify(sp));
  console.log(`호출 수: 공공데이터포털 ${calls.std || 0}회`);
  process.exit(0);
}

// 서울시 자료만 받기: node tools/collect.mjs --seoul (네이버·관광공사 한도를 쓰지 않는다)
if (process.argv.includes('--seoul')) {
  if (!env.SEOUL_API_KEY) { console.log('SEOUL_API_KEY 가 없어요'); process.exit(1); }
  const file = JSON.parse(readFileSync(`${ROOT}app/data/events.json`, 'utf8'));
  const others = file.events.filter((ev) => ev.source !== 'seoul');
  console.log('· 서울 문화행사');
  const seoul = await collectSeoulEvents(others);
  writeFileSync(`${ROOT}app/data/events.json`, JSON.stringify({ ...file, source: '한국관광공사 국문 관광정보 서비스, KOPIS 공연예술통합전산망, 서울 열린데이터광장', events: withManualEvents([...others, ...seoul]) }));
  console.log('· 서울 주차장');
  await collectSeoulParking();
  console.log(`호출 수: 서울시 ${calls.seoul || 0}회, 카카오 ${calls.kakao || 0}회`);
  process.exit(0);
}

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
console.log('· 서울 문화행사 (서울 열린데이터광장)');
let seoulEvents = [];
const keepSeoul = () => {
  try { return (JSON.parse(readFileSync(`${ROOT}app/data/events.json`, 'utf8')).events || []).filter((ev) => ev.source === 'seoul' && ev.end >= ymd(today)); } catch { return []; }
};
if (env.SEOUL_API_KEY) {
  try {
    seoulEvents = await collectSeoulEvents([...festivals, ...stages]);
  } catch (e) {
    seoulEvents = keepSeoul();
    console.log(`  서울 문화행사 수집 실패, 지난 자료 ${seoulEvents.length}건 유지: ${e.message}`);
  }
} else {
  seoulEvents = keepSeoul();
  console.log(`  SEOUL_API_KEY 없음, 지난 자료 ${seoulEvents.length}건 유지`);
}
console.log('· 지자체 축제·공연행사 (공공데이터포털 표준데이터)');
let stdEvents = [];
const keepStd = () => {
  try { return (JSON.parse(readFileSync(`${ROOT}app/data/events.json`, 'utf8')).events || []).filter((ev) => ev.source === 'std' && ev.end >= ymd(today)); } catch { return []; }
};
try {
  stdEvents = await collectStdEvents([...festivals, ...stages, ...seoulEvents]);
} catch (e) {
  stdEvents = keepStd();
  console.log(`  지자체 행사 수집 실패, 지난 자료 ${stdEvents.length}건 유지: ${e.message}`);
}
const events = withManualEvents([...festivals, ...stages, ...seoulEvents, ...stdEvents]);
writeFileSync(`${ROOT}app/data/events.json`, JSON.stringify({ updatedAt: stamp, source: '한국관광공사 국문 관광정보 서비스, KOPIS 공연예술통합전산망, 서울 열린데이터광장, 공공데이터포털 표준데이터', events }));
console.log(`  행사·공연 ${events.length}건 저장`);

console.log('· 서울 주차장 (서울 열린데이터광장)');
if (env.SEOUL_API_KEY) {
  try { await collectSeoulParking(); } catch (e) { console.log(`  서울 주차장 수집 실패, 지난 자료 유지: ${e.message}`); }
} else console.log('  SEOUL_API_KEY 없음, 지난 자료 유지');
console.log('· 전국 주차장 (공공데이터포털 표준데이터)');
try { await collectStdParking(); } catch (e) { console.log(`  전국 주차장 수집 실패, 지난 자료 유지: ${e.message}`); }
console.log('· 시티투어 (공공데이터포털 표준데이터)');
try { await collectCityTours(); } catch (e) { console.log(`  시티투어 수집 실패, 지난 자료 유지: ${e.message}`); }
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
console.log(`호출 수: 서울시 ${calls.seoul || 0}회, 관광공사 ${calls.tour}회, 네이버 ${calls.naver}회, KOPIS ${calls.kopis || 0}회, 카카오 ${calls.kakao || 0}회`);
