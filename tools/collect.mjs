// 실제 데이터 수집기. 실행: node tools/collect.mjs
// .env 의 키로 외부 데이터를 모아 app/data/*.json 으로 저장한다. 저장 파일에는 키가 들어가지 않는다.
//
//  - 축제·행사: 한국관광공사 국문 관광정보 서비스 "행사정보조회"
//  - 장소 사진: 같은 서비스 "키워드 검색 조회"의 대표 이미지 (장소 좌표 5km 안의 결과만 사용)
//  - 성별·연령대별 검색 인기, 1년 인기, 최근 추세: 네이버 검색어 트렌드(NAVER API HUB)
//  - 블로그 언급 수: 네이버 블로그 검색(NAVER API HUB)
//
// 네이버 검색어 트렌드는 한 번 요청 안에서만 비교되는 상대값(가장 높은 값 = 100)이라,
// 매 요청에 기준 검색어(ANCHOR)를 함께 넣어 요청끼리 비교할 수 있게 맞춘다.

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
const keywordOf = (p) => KEYWORD[p.id] || p.name.replace(/\s*\(.*?\)\s*/g, '').split('·')[0].trim();

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

async function collectPhotos() {
  const photos = {};
  for (const p of PLACES) {
    try {
      const { items } = await tour('searchKeyword2', { keyword: keywordOf(p), numOfRows: '5', pageNo: '1' });
      const hit = items.find((it) => it.firstimage && kmBetween(p, { lat: Number(it.mapy), lng: Number(it.mapx) }) <= 5);
      if (hit) photos[p.id] = https(hit.firstimage);
    } catch (e) {
      console.log(`  사진 실패 ${p.name}: ${e.message}`);
    }
    await sleep(80);
  }
  return photos;
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
async function relative(extra, startDate, timeUnit) {
  const result = {};
  for (const group of chunks(PLACES, 4)) {
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

async function collectNaver() {
  const yearStart = new Date(today);
  yearStart.setFullYear(yearStart.getFullYear() - 1);
  const threeMonths = new Date(today);
  threeMonths.setMonth(threeMonths.getMonth() - 3);

  console.log('· 1년 인기·최근 추세');
  const yearly = await relative({}, ymd(yearStart), 'week');
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
      const scores = toScores(await relative({ gender: g, ages: band.ages }, ymd(threeMonths), 'month'));
      for (const [id, sc] of Object.entries(scores)) {
        interest[id] ||= {};
        for (const code of band.codes) interest[id][`${g}${code}`] = sc;
      }
    }
  }

  console.log('· 블로그 언급 수');
  const buzz = {};
  for (const p of PLACES) {
    try {
      calls.naver++;
      const j = await getJson(`${NAVER}/search/v1/blog?query=${encodeURIComponent(keywordOf(p))}&display=1`, { headers: naverHeaders }, 'blog');
      buzz[p.id] = j.total;
    } catch (e) {
      console.log(`  블로그 실패 ${p.name}: ${e.message}`);
    }
    await sleep(120);
  }
  return { yearlyScore, trendOf, interest, buzz };
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
  const hit = docs.find((d) => !areaShort || (d.address_name || '').startsWith(areaShort)) || null;
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
    calls.kopis = (calls.kopis || 0) + 1;
    const q = new URLSearchParams({ service: env.KOPIS_KEY, stdate: compact(today), eddate: compact(until), cpage: String(page), rows: '100', kidstate: 'Y' });
    const res = await fetch(`https://kopis.or.kr/openApi/restful/pblprfr?${q}`);
    const xml = await res.text();
    if (!res.ok || !xml.includes('<dbs')) throw new Error(`KOPIS HTTP ${res.status} ${xml.slice(0, 120)}`);
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
    if (!(key in venues)) {
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

// ── 실행 ────────────────────────────────────────────────────
mkdirSync(`${ROOT}app/data`, { recursive: true });
const stamp = new Date().toISOString();

console.log('· 축제·행사');
const festivals = await collectEvents();
console.log(`  행사 ${festivals.length}건`);
console.log('· 공연 일정 (KOPIS)');
let stages = [];
try {
  stages = await collectStages();
} catch (e) {
  console.log(`  공연 수집 실패: ${e.message}`);
}
const events = [...festivals, ...stages];
writeFileSync(`${ROOT}app/data/events.json`, JSON.stringify({ updatedAt: stamp, source: '한국관광공사 국문 관광정보 서비스, KOPIS 공연예술통합전산망', events }));
console.log(`  행사·공연 ${events.length}건 저장`);

console.log('· 장소 사진');
const photos = await collectPhotos();
console.log(`  사진 ${Object.keys(photos).length}/${PLACES.length}곳`);

const nv = await collectNaver();
const places = {};
for (const p of PLACES) {
  const row = {};
  if (nv.interest[p.id]) row.interest = nv.interest[p.id];
  if (nv.yearlyScore[p.id] != null) row.yearly = nv.yearlyScore[p.id];
  if (nv.trendOf[p.id] != null) row.trend = nv.trendOf[p.id];
  if (nv.buzz[p.id] != null) row.buzz = nv.buzz[p.id];
  if (photos[p.id]) row.photo = photos[p.id];
  row.keyword = keywordOf(p);
  places[p.id] = row;
}
writeFileSync(`${ROOT}app/data/places.json`, JSON.stringify({ updatedAt: stamp, anchor: ANCHOR, places }));
const withStats = Object.values(places).filter((r) => r.interest).length;
console.log(`  장소 통계 ${withStats}/${PLACES.length}곳 저장`);
console.log(`호출 수: 관광공사 ${calls.tour}회, 네이버 ${calls.naver}회, KOPIS ${calls.kopis || 0}회, 카카오 ${calls.kakao || 0}회`);
