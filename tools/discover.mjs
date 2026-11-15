// "요즘 뜨는 곳" 후보 자동 발굴 (시험판)
// 사람이 장소 이름을 알려 주지 않아도, 지역 이름 + "요즘 뜨는 곳/핫플/가볼만한 곳/나들이"로 네이버 블로그를 검색해
// 최근 글에 자주 나오는 이름 조각을 모으고, 카카오 지도에서 "이름이 정확히 같은 실제 장소"인 것만 남긴다.
// 인스타그램은 쓰지 않는다(공식 방법이 없고, 긁어 오는 건 이용약관 위반).
//
// 사용: node tools/discover.mjs [--out 파일.json] [--regions 숫자] [--max-kakao 숫자]
// 결과는 파일로만 저장한다(앱 데이터에는 아직 넣지 않음). 정확도를 확인한 뒤 연결한다.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg('--out', 'discover-result.json');
const REGION_LIMIT = Number(arg('--regions', 999));
const MAX_KAKAO = Number(arg('--max-kakao', 900));

const env = {};
for (const line of readFileSync(`${root}/.env`, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && m[2]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
for (const k of ['NAVER_API_KEY_ID', 'NAVER_API_KEY', 'KAKAO_REST_KEY']) if (!process.env[k] && env[k]) process.env[k] = env[k];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 도시·지역 단위 이름만 쓴다(특정 장소 이름은 넣지 않는다 — 그래야 "스스로 찾는지" 시험이 된다).
const REGIONS = ['서울', '종로', '중구 서울', '강남', '송파', '마포', '용산', '성동', '영등포', '서대문', '은평', '강서', '노원', '광진', '동작', '서초', '동대문', '성북', '강동', '관악', '구로', '양천', '도봉', '중랑', '강북',
  '수원', '용인', '성남', '고양', '부천', '시흥', '안산', '화성', '파주', '김포', '하남', '광명', '안양', '의정부', '남양주', '양평', '가평', '포천', '이천', '여주', '평택', '안성', '광주 경기', '구리', '과천', '오산',
  '인천', '송도', '영종도', '강화', '청라', '월미도',
  '강릉', '속초', '춘천', '홍천', '평창', '양양', '원주', '동해', '삼척', '정선',
  '대전', '천안', '아산', '공주', '태안', '보령', '충주', '제천', '단양', '청주', '세종', '서산',
  '전주', '여수', '순천', '담양', '목포', '군산', '광주 전라', '영월', '고성 강원', '횡성', '인제', '철원', '부안', '남원', '보성', '창원', '진주', '김해', '양산', '대구 달성', '영주', '울진', '공주 부여', '부여', '논산', '당진', '예산', '화천', '양구',
  '부산', '경주', '대구', '거제', '통영', '안동', '문경', '울산', '포항', '김천', '제주'];
const PHRASES = ['요즘 뜨는 곳', '핫플', '가볼만한 곳', '나들이', '신상 핫플', '아이와 가볼만한 곳', '데이트 코스', '당일치기'];
const PAGES = Number(arg('--pages', 2)); // 한 검색어당 100건씩 몇 쪽 받을지
const NGRAM = Number(arg('--ngram', 2)); // 이름 조각 최대 단어 수
const MIN_BLOGGERS = Number(arg('--min-bloggers', 3));
async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } })); }
const RECENT_DAYS = 120;

const naverHeaders = { 'X-NCP-APIGW-API-KEY-ID': process.env.NAVER_API_KEY_ID, 'X-NCP-APIGW-API-KEY': process.env.NAVER_API_KEY };
async function getJson(url, headers, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url, { headers });
    if (r.status === 429 || r.status >= 500) { await sleep(800 * (i + 1)); continue; }
    return r.json();
  }
  throw new Error('요청 실패 ' + url.slice(0, 80));
}

const strip = (t) => String(t || '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;|&gt;|&#\d+;/g, ' ');
const norm = (s) => String(s || '').replace(/[\s·()\-_/.,!'"]/g, '').toLowerCase();

// ── 1) 블로그 글 모으기 (결과는 캐시 파일에 저장해 다시 돌릴 때 재사용) ──
const cutoff = new Date(Date.now() - RECENT_DAYS * 86400000).toISOString().slice(0, 10).replace(/-/g, '');
const CACHE = arg('--cache', '');
const posts = new Map(); // link → {title, text, blogger, date, regions:Set}
let naverCalls = 0;
if (CACHE && existsSync(CACHE)) {
  for (const [k, v] of Object.entries(JSON.parse(readFileSync(CACHE, 'utf8')))) posts.set(k, { ...v, regions: new Set(v.regions) });
  console.log(`캐시에서 글 ${posts.size}건 불러옴`);
} else {
  const jobs = [];
  for (const region of REGIONS.slice(0, REGION_LIMIT)) for (const ph of PHRASES) for (let pg = 0; pg < PAGES; pg++) jobs.push([region, ph, pg]);
  await pool(jobs, 5, async ([region, ph, pg]) => {
    try {
      naverCalls++;
      const j = await getJson(`https://naverapihub.apigw.ntruss.com/search/v1/blog?query=${encodeURIComponent(`${region} ${ph}`)}&display=100&start=${pg * 100 + 1}&sort=sim`, naverHeaders);
      for (const it of j.items || []) {
        if (String(it.postdate) < cutoff) continue;
        let p = posts.get(it.link);
        if (!p) posts.set(it.link, (p = { title: strip(it.title), text: `${strip(it.title)} . ${strip(it.description)}`, blogger: it.bloggername, date: it.postdate, regions: new Set() }));
        p.regions.add(region);
      }
    } catch (e) { console.log('  블로그 검색 실패', region, ph, e.message); }
  });
  if (CACHE) writeFileSync(CACHE, JSON.stringify(Object.fromEntries([...posts].map(([k, v]) => [k, { ...v, regions: [...v.regions] }]))));
}
console.log(`블로그 검색 ${naverCalls}번 → 최근 ${RECENT_DAYS}일 글 ${posts.size}건`);

// ── 2) 이름 조각 세기 ─────────────────────────────────────────
const JOSA = ['에서도', '에서는', '에서', '으로', '에는', '에도', '이나', '까지', '부터', '이라', '라는', '에', '은', '는', '이', '가', '을', '를', '의', '도', '로', '와', '과', '만'];
const variants = (tok) => {
  const out = new Set([tok]);
  for (const j of JOSA) if (tok.endsWith(j) && tok.length - j.length >= 2) { out.add(tok.slice(0, -j.length)); break; }
  return [...out];
};
const STOP = new Set(['요즘', '뜨는', '핫플', '핫플레이스', '가볼만한', '가볼만한곳', '나들이', '추천', '후기', '맛집', '카페', '데이트', '코스', '여행', '주말', '서울', '경기', '인천', '강원', '제주', '근교', '당일치기', '아이와', '아이랑', '가족', '가족여행', '국내여행', '국내', '베스트', '리스트', '총정리', '정리', '소개', '방문', '다녀온', '다녀왔어요', '다녀왔습니다', '오늘', '이번', '정말', '너무', '진짜', '완전', '대박', '인기', '유명', '스팟', '명소', '장소', '곳곳', '바로', '함께', '있는', '이런', '그리고', '그런', '하는', '위한', '같은', '많은']);
// 글 하나에서 나온 이름 조각(중복 제거)을 {키: 원문} 으로 돌려준다
function gramsOf(text) {
  const out = new Map();
  for (const seg of text.split(/[^가-힣A-Za-z0-9\s]+/)) {
    const toks = seg.split(/\s+/).filter(Boolean);
    for (let n = 1; n <= NGRAM; n++) {
      for (let i = 0; i + n <= toks.length; i++) {
        const win = toks.slice(i, i + n);
        if (n === 1 && (STOP.has(win[0]) || win[0].length < 3)) continue;
        if (win.some((w, k) => k < n - 1 && w.length < 2)) continue;
        for (const lv of variants(win[win.length - 1])) {
          const cand = [...win.slice(0, -1), lv].join(' ');
          const key = norm(cand);
          if (key.length < 3 || /^[0-9A-Za-z]{1,3}$/.test(cand) || STOP.has(key) || out.has(key)) continue;
          out.set(key, cand);
        }
      }
    }
  }
  return out;
}
// 1차: 서로 다른 블로거 4명 이상이 쓴 조각만 남긴다
const first = new Map();
const gramCache = new Map();
for (const [link, p] of posts) {
  const g = gramsOf(p.text);
  gramCache.set(link, g);
  for (const key of g.keys()) {
    let s = first.get(key);
    if (!s) first.set(key, (s = new Set()));
    s.add(p.blogger);
  }
}
const keep = new Set([...first].filter(([, s]) => s.size >= MIN_BLOGGERS).map(([k]) => k));
first.clear();
// 2차: 지역 쏠림 — 어느 지역 검색에서나 나오는 흔한 말("11월", "이야기")은 버리고, 한두 지역에 몰린 이름만 남긴다
const info = new Map();
for (const [link, p] of posts) {
  for (const [key, cand] of gramCache.get(link)) {
    if (!keep.has(key)) continue;
    let c = info.get(key);
    if (!c) info.set(key, (c = { text: cand, n: 0, bloggers: new Set(), reg: new Map(), samples: [], last: '' }));
    c.n++; c.bloggers.add(p.blogger);
    for (const r of p.regions) { let s = c.reg.get(r); if (!s) c.reg.set(r, (s = new Set())); s.add(p.blogger); }
    if (c.samples.length < 2) c.samples.push(p.title.slice(0, 60));
    if (p.date > c.last) c.last = p.date;
  }
}
gramCache.clear();
const SPREAD_MAX = Number(arg('--spread', 8));
const ranked = [];
for (const c of info.values()) {
  let top = 0, topRegion = '';
  for (const [r, s] of c.reg) if (s.size > top) { top = s.size; topRegion = r; }
  c.top = top; c.topRegion = topRegion; c.spread = c.reg.size;
  if (top >= MIN_BLOGGERS && (c.spread <= SPREAD_MAX || top / c.bloggers.size >= 0.25)) ranked.push(c);
}
ranked.sort((a, b) => b.top - a.top || b.n - a.n);
console.log(`이름 조각 ${keep.size}개(블로거 4명 이상) 중 한두 지역에 몰린 것 ${ranked.length}개`);
// 시험용: 말씀하신 장소가 조각 목록에 있는지(카카오 확인 전 단계) 따로 기록
globalThis.__info = info;

// ── 3) 카카오 지도에서 "이름이 정확히 같은 실제 장소"만 남기기 ──
const known = new Set();
const { PLACES } = await import(pathToFileURL(`${root}/app/js/data/places.js`).href);
for (const p of PLACES) known.add(norm(p.name));
const spotsJson = JSON.parse(readFileSync(`${root}/app/data/spots.json`, 'utf8')).spots;
for (const s of spotsJson) known.add(norm(s.name));

const OK_CAT = /여행|관광|명소|문화|예술|스포츠|레저|테마|공원|놀이|카페|아쿠아|박물|미술|전시|체험|농장|목장|온천|해수욕|섬|시장|거리|골목/;
const BAD_CAT = /기독교|천주교|교회|성당|축구|야구장|경마|교육단체|교통|지하철|역$|행정|학교|병원|의료|부동산|주유|은행|편의점|마트|주차|숙박|모텔|호텔|펜션|약국|미용|세탁|통신|공공|사무/;
const found = new Map(); // kakao id → 결과
let kakaoCalls = 0;
const todo = [];
let knownHit = 0;
for (const c of ranked.slice(0, MAX_KAKAO)) {
  if (known.has(norm(c.text))) { knownHit++; found.set('known-' + norm(c.text), { id: 'known-' + norm(c.text), name: c.text, known: true, bloggers: c.top, regions: c.spread, topRegion: c.topRegion, posts: c.n, last: c.last, samples: c.samples, cat: '' }); continue; }
  todo.push(c);
}
await pool(todo, 6, async (c) => {
  try {
    kakaoCalls++;
    const j = await getJson(`https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(c.text)}&size=5`, { Authorization: `KakaoAK ${process.env.KAKAO_REST_KEY}` });
    const docs = j.documents || [];
    const nc = norm(c.text);
    let same = docs.filter((d) => norm(d.place_name) === nc);
    if (!same.length) same = docs.filter((d) => { const nn = norm(d.place_name); return nn.length >= 3 && nc.length - nn.length <= 6 && (nc.endsWith(nn) || nc.startsWith(nn)); });
    if (!same.length && nc.length >= 4) same = docs.filter((d) => { const nn = norm(d.place_name); return nn.startsWith(nc) && nn.length - nc.length <= 6; }); // "플레이아쿠아리움" → "플레이아쿠아리움 부천"
    if (!same.length || same.length >= 3) return; // 이름이 같은 곳이 3곳 이상이면 체인점으로 보고 버린다
    const d = same[0];
    if (BAD_CAT.test(d.category_name) || !OK_CAT.test(d.category_name)) return;
    const prev = found.get(d.id);
    if (prev && prev.bloggers >= c.top) return;
    found.set(d.id, {
      id: d.id, name: d.place_name, cat: d.category_name.split(' > ').slice(0, 3).join('>'),
      addr: d.road_address_name || d.address_name, lat: Number(d.y), lng: Number(d.x), url: d.place_url,
      bloggers: c.top, regions: c.spread, topRegion: c.topRegion, posts: c.n, last: c.last, samples: c.samples,
      known: known.has(norm(d.place_name)),
      // 검색한 지역과 카카오 주소가 맞는지(같은 이름의 다른 지역 장소를 걸러내는 용도)
      regionOk: (d.road_address_name || d.address_name || '').includes(c.topRegion.split(' ')[0]) || (c.topRegion.startsWith('서울') && (d.address_name || '').startsWith('서울')),
    });
  } catch (e) { console.log('  카카오 실패', c.text, e.message); }
});
const result = [...found.values()].sort((a, b) => b.bloggers - a.bloggers);
writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), naverCalls, kakaoCalls, posts: posts.size, result, ranked: ranked.map((c) => [c.text, c.top, c.spread, c.topRegion]) }, null, 1));
console.log(`카카오 확인 ${kakaoCalls}번 → 실제 장소 후보 ${result.length}곳 (이미 앱에 있음 ${result.filter((r) => r.known).length}, 새로운 곳 ${result.filter((r) => !r.known).length}) → ${OUT}`);
