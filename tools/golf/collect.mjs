// 골프 탭 자료 모으기: 티스캐너·골팡(국내 그린피), 티스캐너 해외 골프 상품, 카카오 미래 길찾기(거점→골프장), 환율.
// 결과: app/data/golf.json (앱이 읽는 파일). 캐시: tools/golf/data/*.json
// 실행: node tools/golf/collect.mjs  (KAKAO_REST_KEY 가 있으면 길찾기·골팡 골프장 위치 찾기까지 한다. 키 값은 출력하지 않는다.)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  unescapeHtml, nameKey, isHiddenName, parseGolfpangRows, golfpangTotal, perPersonCost,
  haversineKm, nextSaturday0600, is18Tee, pickAirport, AIRPORTS, isPar3, cartIncludedText, median, parseGolfmonOverseas, parseGolfmonDomestic, golfmonCell, GOLFMON_REGIONS, cityOf, flightIncluded, coordsFromGoogleUrl,
} from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DATA = path.join(ROOT, 'tools/golf/data');
const OUT = path.join(ROOT, 'app/data/golf.json');
fs.mkdirSync(DATA, { recursive: true });

const DAYS = Number(process.env.GOLF_DAYS || 7);
const GP_MAX_PAGES = Number(process.env.GOLF_GP_PAGES || 8);
const KAKAO = process.env.KAKAO_REST_KEY || '';
const FIRECRAWL = process.env.FIRECRAWL_API_KEY || ''; // 골프몬(한국 밖 접속 차단)을 한국 위치로 열 때 쓴다
const GOLFMON_DAYS = Number(process.env.GOLF_GM_DAYS || 3); // 골프몬 국내는 앞으로 며칠치(무료 한도 고려)
const DRIVE_CAP = Number(process.env.GOLF_DRIVE_CAP || 3000); // 한 번에 부르는 길찾기 최대 건수(하루 무료 10,000건)
const DRIVE_TTL_DAYS = 14;
const DRIVE_BUDGET_MIN = Number(process.env.GOLF_DRIVE_MIN || 12); // 길찾기에 쓰는 시간 상한(분). 못 다 한 것은 다음 날 이어서 한다
const HUB_RADIUS_KM = 230; // 직선 230km 넘는 거점은 길찾기를 부르지 않는다(차로 3시간 넘음)

// 응답 없는 요청이 작업 전체를 붙잡지 않게 모든 요청에 20초 제한을 건다
const rawFetch = globalThis.fetch;
globalThis.fetch = (u, o = {}) => rawFetch(u, { signal: AbortSignal.timeout(20000), ...o });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')); } catch { return d; } };
const writeJson = (f, v) => fs.writeFileSync(path.join(DATA, f), JSON.stringify(v, null, 1));
const log = (...a) => console.log(...a);

// 앱의 거점 목록(geo.js CITIES)을 그대로 읽는다 — 같은 좌표를 써야 앱과 맞는다.
async function loadHubs() {
  const { CITIES } = await import(path.join(ROOT, 'app/js/core/geo.js'));
  return CITIES;
}

function kstDates(n) {
  const out = [];
  const now = new Date(Date.now() + 9 * 3600e3);
  for (let i = 1; i <= n; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + i));
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

// ── 티스캐너 ───────────────────────────────────────────────
const TS = 'https://foapi.teescanner.com/v1';
const TS_HEAD = { Referer: 'https://www.teescanner.com/', Origin: 'https://www.teescanner.com', 'x-client-build': '1', 'x-client-version': '2.0.0', 'User-Agent': 'Mozilla/5.0' };

async function tsGet(p) {
  const r = await fetch(TS + p, { headers: TS_HEAD });
  if (!r.ok) throw new Error(`teescanner ${r.status}`);
  const j = await r.json();
  if (j.result !== 0) throw new Error(`teescanner result ${j.result}`);
  return j.data;
}
async function tsPost(p, fields) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, String(v));
  const r = await fetch(TS + p, { method: 'POST', headers: TS_HEAD, body: fd });
  if (!r.ok) throw new Error(`teescanner ${r.status}`);
  const j = await r.json();
  if (j.result !== 0) throw new Error(`teescanner result ${j.result}`);
  return j.data;
}

async function collectTeescanner(dates, courses, stat) {
  const todo = [];
  for (const day of dates) {
    const d = await tsPost('/booking/getGolfclubListByGolfclub', { page: 1, page_size: 500, orderType: 'distance', roundDay: day, userLatitude: 37.5, userLongitude: 127.0, tab: 'golfcourse', isScroll: 'N', _tab: 'golfcourse' });
    const seen = new Set();
    for (const c of d.golfclubList || []) {
      if (seen.has(c.golfclub_seq)) continue; // 광고 칸이 같은 골프장을 한 번 더 넣는 경우
      seen.add(c.golfclub_seq);
      const lat = Number(c.latitude), lng = Number(c.longitude);
      if (!lat || !lng) continue;
      const id = `ts-${c.golfclub_seq}`;
      const co = courses.get(id) || { id, tsSeq: c.golfclub_seq, name: unescapeHtml(c.golfclub_name), key: nameKey(c.golfclub_name), area: unescapeHtml(c.area_name), lat, lng, grade: c.avg_grade || null, photo: c.thmbn_file_url || '', ids: { ts: c.golfclub_seq }, offers: {} };
      courses.set(id, co);
      if (c.min_cost > 0 && c.teecount > 0) todo.push({ co, day });
    }
    stat.days++;
    log(`티스캐너 ${day}: 골프장 ${seen.size}곳`);
    await sleep(400);
  }
  // 목록의 최저가에는 9홀 상품이 섞일 수 있어, 골프장마다 티타임 목록을 열어 18홀 티타임만으로 최저가·티 수를 다시 센다.
  let i = 0;
  const worker = async () => {
    while (i < todo.length) {
      const { co, day } = todo[i++];
      try {
        const d = await tsGet(`/booking/getTeeTimeListbyGolfclub?golfclub_seq=${co.tsSeq}&roundDay=${day}&orderType=`);
        const tees = (d.teeTimeList || []).filter(is18Tee);
        if (tees.length) {
          const best = tees.reduce((a, b) => (b.min_cost < a.min_cost ? b : a));
          (co.offers[day] ||= []).push({ src: 'ts', price: best.min_cost, count: tees.length, noCaddie: /노캐디|셀프/.test(best.caddie_name || ''), cartIncluded: cartIncludedText(`${best.course_name || ''} ${best.benefit_comment || ''} ${best.condition_text || ''} ${best.product_tag_nm || ''}`) });
          stat.offers++;
        } else stat.only9++;
      } catch { stat.errors = (stat.errors || 0) + 1; }
      await sleep(150);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  log(`티스캐너 18홀 티타임 확인 ${todo.length}건, 18홀 없음 ${stat.only9}건`);
}


// 골프장 정보(주소·전화·카트비·캐디피): 한 번 받아 두고 7일마다 다시 받는다.
async function teescannerInfo(courses) {
  const cache = readJson('ts-info.json', {});
  const now = Date.now();
  let calls = 0;
  for (const co of courses.values()) {
    if (!co.tsSeq) continue;
    const c = cache[co.tsSeq];
    if (!c || now - (c.at || 0) > 7 * 864e5) {
      try {
        const d = await tsPost('/board/getGolfclubInformationInfo', { golfclub_seq: co.tsSeq });
        const g = d.golfclubInfo || {};
        cache[co.tsSeq] = { at: now, addr: unescapeHtml(g.address1), tel: g.golfclub_tel || '', holes: g.hole_count || null, cart: g.cart_fee || 0, caddie: g.caddie_fee || 0, week: g.green_fee_week || 0, weekend: g.green_fee_weekend || 0, type: unescapeHtml(g.membership_type_name || '') };
        calls++;
        await sleep(250);
      } catch (e) { log('티스캐너 골프장 정보 실패', co.tsSeq, e.message); }
    }
    const i = cache[co.tsSeq];
    if (i) Object.assign(co, { addr: i.addr, tel: i.tel, holes: i.holes, cartFee: i.cart, caddieFee: i.caddie, type: i.type });
  }
  writeJson('ts-info.json', cache);
  log(`티스캐너 골프장 정보 새로 받음 ${calls}곳`);
}

// ── 골팡 ───────────────────────────────────────────────────
const GP = 'https://www.golfpang.com';
const GP_SECTORS = [['5', '한강이남'], ['1', '강북/경춘'], ['4', '충청'], ['8', '원주/영동'], ['16', '영호남/제주']];

async function collectGolfpang(dates, stat) {
  // 첫 화면을 열어 받은 쿠키로 부킹표를 부른다(브라우저와 같은 순서).
  const first = await fetch(`${GP}/web/round/booking_list.do`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const cookie = (first.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
  const agg = new Map(); // key|day → {name, region, day, price, count}
  for (const day of dates) {
    for (const [sector, region] of GP_SECTORS) {
      let total = 0;
      for (let page = 1; page <= GP_MAX_PAGES; page++) {
        const body = new URLSearchParams({ pageNum: page, bkOrder: 'rd_fee_desc', rd_date: day, ampm: '', sector, idx: '', cust_nick: '', clubname: '', sector2: '', sector3: '', cdOrder: '' });
        const r = await fetch(`${GP}/web/round/booking_tblList.do`, { method: 'POST', body, headers: { 'X-Requested-With': 'XMLHttpRequest', Referer: `${GP}/web/round/booking_list.do`, Origin: GP, 'User-Agent': 'Mozilla/5.0', 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', Cookie: cookie } });
        if (!r.ok) { stat.errors++; break; }
        const html = await r.text();
        if (page === 1) total = golfpangTotal(html);
        const rows = parseGolfpangRows(html);
        stat.pages++;
        for (const row of rows) {
          stat.rows++;
          if (isHiddenName(row.name)) { stat.hidden++; continue; }
          if (row.holes && !/18/.test(row.holes)) { stat.not18++; continue; } // 9홀 등은 값이 비교되지 않아 뺀다
          const k = `${nameKey(row.name)}|${day}`;
          const a = agg.get(k) || { name: row.name, key: nameKey(row.name), region, day, price: Infinity, count: 0 };
          a.count++;
          if (row.price < a.price) { a.price = row.price; a.noCaddie = /노캐디/.test(row.caddie || ''); a.cartIncluded = /카트/.test(row.incl || ''); }
          agg.set(k, a);
        }
        if (rows.length < 100 || page * 100 >= total) break;
        await sleep(500);
      }
      log(`골팡 ${day} ${region}: 전체 ${total}타임`);
      await sleep(500);
    }
  }
  return [...agg.values()];
}

// 골팡 골프장 위치: 이름이 티스캐너와 같으면 그 골프장으로 합치고, 아니면 카카오 장소검색(골프장 분류만)으로 찾는다.
async function kakaoFindGolf(name) {
  const q = `${unescapeHtml(name).replace(/\((p|퍼|퍼9)\)|퍼9$|퍼$/gi, '').trim()} 골프`;
  const r = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(q)}&size=5`, { headers: { Authorization: `KakaoAK ${KAKAO}` } });
  if (!r.ok) throw new Error(`kakao ${r.status}`);
  const j = await r.json();
  return (j.documents || []).filter((d) => /골프장/.test(d.category_name || '') && !/연습장|스크린/.test(d.category_name || ''));
}

async function mergeGolfpang(gpRows, courses, stat, src = 'gp') {
  const byKey = new Map();
  for (const co of courses.values()) if (!byKey.has(co.key)) byKey.set(co.key, co);
  const geo = readJson('gp-geo.json', {});
  for (const g of gpRows) {
    let co = byKey.get(g.key);
    if (!co && KAKAO) {
      if (!(g.key in geo)) {
        try {
          const docs = await kakaoFindGolf(g.name);
          geo[g.key] = docs.length ? { name: docs[0].place_name, lat: Number(docs[0].y), lng: Number(docs[0].x), addr: docs[0].road_address_name || docs[0].address_name, kid: docs[0].id, n: docs.length } : null;
          await sleep(150);
        } catch (e) { log('카카오 장소검색 실패', e.message); }
      }
      const p = geo[g.key];
      if (p) {
        // 티스캐너 골프장과 1.5km 안이면 같은 골프장(플랫폼 중복 제거)
        let best = null, bestKm = 1.5;
        for (const c of courses.values()) { const km = haversineKm(p, c); if (km < bestKm) { best = c; bestKm = km; } }
        if (best) co = best;
        else {
          const id = `${src}-${g.key}`;
          co = courses.get(id) || { id, name: p.name, key: nameKey(p.name), area: g.region, lat: p.lat, lng: p.lng, addr: p.addr, kakaoId: p.kid, ids: {}, offers: {} };
          courses.set(id, co);
        }
        byKey.set(g.key, co);
      }
    }
    if (!co) { stat.unplaced.add(g.name); continue; }
    (co.offers[g.day] ||= []).push({ src, price: g.price, count: g.count, name: g.name, noCaddie: g.noCaddie, cartIncluded: g.cartIncluded });
    stat.merged++;
  }
  writeJson('gp-geo.json', geo);
}

// ── 골프몬: 한국 밖 접속을 막아 Firecrawl(한국 위치)로 화면을 열고 달력 칸을 눌러 목록을 읽는다 ─────────
async function firecrawl(body) {
  const r = await fetch('https://api.firecrawl.dev/v2/scrape', { method: 'POST', headers: { Authorization: `Bearer ${FIRECRAWL}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ location: { country: 'KR', languages: ['ko'] }, onlyMainContent: true, ...body }), signal: AbortSignal.timeout(150000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.success) throw new Error(`firecrawl ${r.status} ${j.error || ''}`.trim());
  return j.data?.markdown || '';
}

async function collectGolfmon(dates, stat) {
  const agg = new Map();
  const year = dates[0].slice(0, 4);
  for (const day of dates.slice(0, GOLFMON_DAYS)) {
    for (const [rid, region] of GOLFMON_REGIONS) {
      try {
        const md = await firecrawl({ url: 'https://www.golfmon.net/booking/list?tab=%EC%96%91%EB%8F%84', actions: [{ type: 'wait', milliseconds: 3000 }, { type: 'click', selector: golfmonCell(rid, day) }, { type: 'wait', milliseconds: 4000 }, { type: 'scroll', direction: 'down' }, { type: 'wait', milliseconds: 1500 }] });
        const rows = parseGolfmonDomestic(md);
        stat.pages++;
        for (const r of rows) {
          const [m, d] = r.md.split('/').map(Number);
          const rd = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          if (rd !== day) continue;
          stat.rows++;
          if (isHiddenName(r.name)) continue;
          if (r.holes && !/18/.test(r.holes)) continue;
          const k = `${nameKey(r.name)}|${day}`;
          const a = agg.get(k) || { name: r.name, key: nameKey(r.name), region, day, price: Infinity, count: 0 };
          a.count++;
          if (r.price < a.price) a.price = r.price;
          agg.set(k, a);
        }
        log(`골프몬 ${day} ${region}: ${rows.length}건`);
      } catch (e) { stat.errors++; log('골프몬 실패', day, region, e.message.slice(0, 80)); }
    }
  }
  return [...agg.values()];
}

async function collectGolfmonAbroad() {
  const md = await firecrawl({ url: 'https://www.golfmon.net/overseas/tour', waitFor: 4000 });
  const items = parseGolfmonOverseas(md);
  if (items.length) writeJson('golfmon-abroad.json', { source: '골프몬 해외투어 목록(https://www.golfmon.net/overseas/tour) 첫 화면, 한국 위치 접속(Firecrawl)', collectedAt: new Date().toISOString(), items });
  return items.length;
}

// ── 티업엔조이: 지역·날짜별 골프장 최저가(공개 목록 API, robots.txt 가 /api/proxy/ 허용) ─────────
const TU = 'https://app.teeupnjoy.com';
const TU_AREAS = ['ARE10', 'ARE20', 'ARE30', 'ARE40', 'ARE50', 'ARE60', 'ARE70'];

async function collectTeeupnjoy(dates, courses, stat) {
  const rows = [];
  for (const day of dates) {
    for (const cat of TU_AREAS) {
      for (let page = 1; page <= 10; page++) {
        const u = `${TU}/api/proxy/booking/search/list?dateFirst=${day}&searchType=golfClub&sortBy=clubName&category=${cat}&subCategory=0&pageIndex=${page}&today=N&isManager=false`;
        const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0', Referer: `${TU}/booking` } });
        if (!r.ok) { stat.errors++; break; }
        const j = await r.json();
        for (const c of j.resultList || []) {
          const price = Number(String(c.disPrice || '').replace(/[^\d]/g, ''));
          const lat = Number(c.clubLat), lng = Number(c.clubLng);
          if (!price || !lat || !lng || c.nation !== 'CTYKR') continue;
          rows.push({ day, id: c.clubId, name: unescapeHtml(c.clubName).replace(/_임박$/, ''), lat, lng, addr: unescapeHtml(c.region || ''), price, count: Number(c.clubCnt) || 1, area: c.codeName || '' });
        }
        stat.pages++;
        const pi = j.paginationInfo || {};
        if (!pi.totalPageCount || page >= pi.totalPageCount) break;
        await sleep(300);
      }
      await sleep(300);
    }
    log(`티업엔조이 ${day}: 누적 ${rows.length}건`);
  }
  // 골프장 화면(공개)에서 사진과 "18홀 티타임이 있는지"를 한 번 확인해 30일 보관
  const cache = readJson('tu-club.json', {});
  const now = Date.now();
  const ids = [...new Set(rows.map((r) => r.id))];
  for (const id of ids) {
    const c = cache[id];
    if (c && now - c.at < 30 * 864e5) continue;
    try {
      const day = rows.find((r) => r.id === id).day;
      const h = await (await fetch(`${TU}/club/${id}?dateFirst=${day}`, { headers: { 'User-Agent': 'Mozilla/5.0' } })).text();
      const m = /<script type="application\/ld\+json">(\{"@context":"https:\/\/schema.org","@type":"GolfCourse"[\s\S]*?)<\/script>/.exec(h);
      const ld = m ? JSON.parse(m[1]) : null;
      const offers = ld?.makesOffer || [];
      cache[id] = { at: now, photo: (Array.isArray(ld?.image) ? ld.image[0] : ld?.image) || '', has18: offers.some((o) => /18홀/.test(o.name || '')), has9only: offers.length > 0 && offers.every((o) => /9홀/.test(o.name || '') && !/18홀/.test(o.name || '')) };
      stat.clubPages++;
      await sleep(400);
    } catch { stat.errors++; }
  }
  writeJson('tu-club.json', cache);
  // 기존 골프장과 합치기: 이름이 같거나 1.5km 안이면 같은 골프장
  const byKey = new Map();
  for (const co of courses.values()) if (!byKey.has(co.key)) byKey.set(co.key, co);
  for (const r of rows) {
    if (cache[r.id]?.has9only) { stat.only9++; continue; }
    let co = byKey.get(nameKey(r.name));
    if (!co) {
      let best = null, bestKm = 1.5;
      for (const c of courses.values()) { const km = haversineKm(r, c); if (km < bestKm) { best = c; bestKm = km; } }
      co = best;
    }
    if (!co) {
      const id = `tu-${r.id}`;
      co = courses.get(id) || { id, name: r.name, key: nameKey(r.name), area: r.area, lat: r.lat, lng: r.lng, addr: r.addr, offers: {} };
      courses.set(id, co);
      byKey.set(co.key, co);
      stat.newCourses++;
    }
    (co.ids ||= {}).tu = r.id;
    if (!co.photo && cache[r.id]?.photo) co.photo = cache[r.id].photo;
    if (!co.addr && r.addr) co.addr = r.addr;
    const prev = (co.offers[r.day] ||= []).find((o) => o.src === 'tu');
    if (prev) { if (r.price < prev.price) prev.price = r.price; prev.count += r.count; }
    else { co.offers[r.day].push({ src: 'tu', price: r.price, count: r.count }); stat.merged++; }
  }
}

// ── 카카오 미래 길찾기: 거점 → 골프장 (토요일 06:00 출발 예상) ───────────
async function driveTimes(courses, hubs, meta) {
  const cache = readJson('drive.json', {});
  const dep = nextSaturday0600();
  meta.drive = { source: KAKAO ? 'kakao-future' : 'none', departure: dep, calls: 0, errors: 0, status: KAKAO ? 'ok' : '카카오 키 없음 — 앱이 직선거리 추정으로 표시' };
  const now = Date.now();
  const keyOf = (co, h) => `${co.lat.toFixed(4)},${co.lng.toFixed(4)}|${h.name}`;
  // 새로 불러야 하는 것만 모은다(가까운 거점부터 → 시간이 모자라도 많이 쓰는 값부터 채워진다)
  const jobs = [];
  for (const co of courses.values()) for (const h of hubs) {
    const km = haversineKm(h, co);
    if (km > HUB_RADIUS_KM) continue;
    const c = cache[keyOf(co, h)];
    if (!c || now - c.at > DRIVE_TTL_DAYS * 864e5) jobs.push({ co, h, km });
  }
  jobs.sort((a, b) => a.km - b.km);
  const deadline = Date.now() + DRIVE_BUDGET_MIN * 60e3;
  const errCodes = {};
  let lastLog = 0;
  let failRun = 0;
  let i = 0;
  const worker = async () => {
    while (KAKAO && i < jobs.length && meta.drive.status === 'ok' && meta.drive.calls < DRIVE_CAP && Date.now() < deadline) {
      const { co, h } = jobs[i++];
      meta.drive.calls++;
      try {
        const u = `https://apis-navi.kakaomobility.com/v1/future/directions?origin=${h.lng},${h.lat}&destination=${co.lng},${co.lat}&departure_time=${dep}&summary=true`;
        const r = await fetch(u, { headers: { Authorization: `KakaoAK ${KAKAO}` }, signal: AbortSignal.timeout(8000) });
        if (r.status === 401 || r.status === 403) { meta.drive.status = `카카오모빌리티 사용 권한 없음(${r.status})`; meta.drive.errors++; }
        else if (r.status === 429) { meta.drive.status = '카카오모빌리티 하루 사용량 초과(429)'; meta.drive.errors++; }
        else if (r.ok) {
          const s = (await r.json()).routes?.[0];
          failRun = 0;
          cache[keyOf(co, h)] = s && s.result_code === 0 ? { at: now, min: Math.round(s.summary.duration / 60), km: Math.round(s.summary.distance / 100) / 10, dep } : { at: now, fail: s?.result_code ?? 'x' };
        } else {
          meta.drive.errors++; errCodes[r.status] = (errCodes[r.status] || 0) + 1;
          if (!meta.drive.firstError) meta.drive.firstError = `${r.status} ${(await r.text().catch(() => '')).slice(0, 160)}`;
          if (++failRun >= 30) meta.drive.status = `카카오모빌리티 연속 실패로 중단(${meta.drive.firstError})`;
        }
      } catch (e) { meta.drive.errors++; errCodes[e.name || 'x'] = (errCodes[e.name || 'x'] || 0) + 1; }
      if (meta.drive.calls % 500 === 0 && meta.drive.calls !== lastLog) { lastLog = meta.drive.calls; log(`카카오 길찾기 ${meta.drive.calls}건 진행`); }
      await sleep(120);
    }
  };
  await Promise.all(Array.from({ length: 3 }, worker));
  meta.drive.errorCodes = errCodes;
  meta.drive.pending = Math.max(0, jobs.length - i);
  for (const co of courses.values()) {
    co.drive = {};
    for (const h of hubs) { const c = cache[keyOf(co, h)]; if (c && c.min) co.drive[h.name] = [c.min, c.km, c.dep]; }
  }
  if (meta.drive.status === 'ok' && !Object.values(cache).some((c) => c.min)) meta.drive.source = 'none';
  writeJson('drive.json', cache);
  log(`카카오 길찾기 호출 ${meta.drive.calls}건, 오류 ${meta.drive.errors} ${JSON.stringify(errCodes)}, 남은 것 ${meta.drive.pending}건(다음 실행 때 이어서), 상태: ${meta.drive.status}`);
}

// ── 몽키트래블 해외 골프장: 공개 목록 API(robots.txt 에서 productList.php 허용) + 상세 화면 제목의 홀 수 ─────────
const MT = 'https://www.monkeytravel.com';
const MT_BRANCHES = [['1', 'th', 'golf'], ['2', 'tw', 'golf'], ['3', 'ph', 'golf'], ['4', 'vn', 'golf'], ['5', 'gu', 'guam-golf'], ['5', 'gu', 'saipan-golf'], ['7', 'jp', '']];

async function mtList(branch, m2, checkInDate) {
  // startNum 은 건너뛸 개수(오프셋). 한 번에 500개까지 받고, 더 있으면 이어서 받는다.
  const seen = new Map();
  for (let page = 0; page < 10; page++) {
    const body = { checkInDate, currency: 'KRW', m1: 'golf', m2, m3: '', site: 'monkey', lang: 'ko', branch, filter: { 'selected-filter': 'sortNoAsc' }, sort: 'sortNoAsc', isStopSale: false, startNum: seen.size, searchAfter: '', isSearch: false, pageSize: 500, size: 500 };
    const r = await fetch(`${MT}/api/search/productList.php`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' }, body: JSON.stringify(body) });
    if (!r.ok) break;
    const d = (await r.json())?.data;
    let added = 0;
    for (const p of d?.productDataList || []) if (!seen.has(p.product_id)) { seen.set(p.product_id, p); added++; }
    if (!added || seen.size >= (d.totalCount || 0)) break;
    await sleep(500);
  }
  return [...seen.values()];
}

async function mtHoles(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
  while (buf.length < 60000) { const { done, value } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true }); if (/<\/title>/i.test(buf)) break; }
  try { reader.cancel(); } catch {}
  const title = /<title>([^<]+)<\/title>/i.exec(buf)?.[1] || '';
  const h = /(\d{1,3})\s*홀/.exec(title); const par = /파\s*(\d{2,3})/.exec(title);
  return { holes: h ? Number(h[1]) : null, par: par ? Number(par[1]) : null };
}

async function collectMonkey(stat) {
  const checkIn = new Date(Date.now() + 9 * 3600e3 + 14 * 864e5).toISOString().slice(0, 10); // 2주 뒤 날짜 기준 1인당 가격
  const cache = readJson('mt-holes.json', {});
  const out = [];
  for (const [branch, cc, m2] of MT_BRANCHES) {
    let list = [];
    try { list = await mtList(branch, m2, checkIn); } catch (e) { stat.errors++; log('몽키트래블 목록 실패', cc, m2, e.message); }
    for (const p of list) {
      // 골프장이 아닌 상품(골프채 렌탈·캠프·맞춤 견적·조인 모집 등)은 뺀다
      if (/렌탈|캠프|맞춤골프|맞춤 골프|조인 골프|기타 지역 골프장/.test(p.productName || '')) { stat.skipped = (stat.skipped || 0) + 1; continue; }
      const menu = p.menuJson?.[0] || { m1: 'golf', m2: m2 || 'golf', m3: '' };
      const url = `${MT}/${cc}/ko/${menu.m1 || 'golf'}/${menu.m2}/${menu.m3 ? `${menu.m3}/` : ''}product/product_detail.php?product_id=${p.product_id}`;
      // "[예약 대행]" 상품의 가격은 그린피가 아니라 예약 대행 수수료라 1인당 가격에서 뺀다(대행 수수료는 따로 둔다).
      const rawName = unescapeHtml(p.productName);
      const agency = /예약\s*대행/.test(rawName);
      out.push({
        id: `mt-${p.product_id}`, pid: p.product_id, name: rawName.replace(/\s*\[예약\s*대행\]\s*/g, ' ').trim(), agency, agencyFee: agency ? Number(p.lowPrice) || 0 : 0, country: p.region?.country || '', city: p.region?.city || '', town: p.region?.town || '',
        lat: Number(p.latitude) || null, lng: Number(p.longitude) || null, grade: Number(p.grade) || null, rating: Number(p.reviewRatingAvg) || null, reviews: p.reviewCount || 0,
        where: unescapeHtml(p.displayDistanceStringSimple || ''), photo: p.mainImg || '', price: agency ? 0 : Number(p.lowPrice) || 0, cur: p.lowPriceCurrency || 'KRW', url,
      });
    }
    log(`몽키트래블 ${cc} ${m2 || '전체'}: ${list.length}곳`);
  }
  // 홀 수: 처음 보는 골프장만 상세 화면 제목을 읽어 보관(한 번 받으면 다시 안 받음)
  const need = out.filter((g) => !(g.pid in cache));
  let i = 0;
  const worker = async () => { while (i < need.length) { const g = need[i++]; try { cache[g.pid] = await mtHoles(g.url); } catch { cache[g.pid] = { holes: null }; } await sleep(400); } };
  await Promise.all([worker(), worker(), worker()]);
  writeJson('mt-holes.json', cache);
  const flights = readJson('flights.json', { airports: {} }).airports;
  for (const g of out) {
    g.holes = cache[g.pid]?.holes || null; g.par = cache[g.pid]?.par || null;
    // 가까운 공항과 인천 왕복 항공권(구글 항공편 조회값). 못 찾으면 비워 두고 화면에 "확인 불가"로 표시한다.
    // 좌표가 없는 골프장은 도시로 공항을 정한다(괌·사이판·클락 등)
    const CITY_AIR = { 괌: 'GUM', 사이판: 'SPN', '수빅ㆍ클락': 'CRK', 방콕: 'BKK', '마닐라 근교': 'MNL' };
    const a = pickAirport(g, flights) || (CITY_AIR[g.city] ? { ...AIRPORTS.find((x) => x.iata === CITY_AIR[g.city]), km: null } : null);
    const f = a ? flights[a.iata] : null;
    g.air = a ? { iata: a.iata, name: a.name, km: Math.round(a.km), direct: f?.direct?.min || null, airlines: f?.direct?.airlines?.slice(0, 3) || [], transfer: f?.direct ? null : f?.transfer?.min || null, via: f?.direct ? '' : f?.transfer?.via || '', fare: f?.fare?.min || null, fareDirect: f?.fare?.direct || null, fareDep: f?.fare?.dep || '', fareRet: f?.fare?.ret || '', fareUrl: f?.fare?.url || '' } : null;
  }
  stat.count = out.length; stat.priced = out.filter((g) => g.price > 0).length; stat.newHoles = need.length; stat.checkIn = checkIn;
  return out;
}

// ── 해외: 티스캐너 해외 골프 상품 ─────────────────────────────
async function resolveMapUrl(u) {
  if (!u) return null;
  try {
    const r = await fetch(u, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0' } });
    return coordsFromGoogleUrl(r.headers.get('location') || u);
  } catch { return null; }
}

async function osrmRoute(a, b) {
  try {
    const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=false`, { headers: { 'User-Agent': 'nolpick-golf/1.0' } });
    if (!r.ok) return null;
    const j = await r.json();
    const s = j.routes?.[0];
    return s ? { km: Math.round(s.distance / 100) / 10, min: Math.round(s.duration / 60) } : null;
  } catch { return null; }
}

async function collectAbroad(stat) {
  const d = await tsGet('/tour/getDomesticTourList?order_type=price_row&page=1&page_size=200&is_tour_page=Y&tour_type=R');
  const cache = readJson('abroad-clubs.json', {});
  const flights = readJson('flights.json', { airports: {} });
  const out = [];
  for (const t of d.list || []) {
    const title = unescapeHtml(t.title);
    const city = cityOf(`${title} ${t.etc_name || ''}`);
    let options = [], clubs = [];
    try {
      const info = await tsGet(`/tour/getDomesticTourInfo?tour_seq=${t.tour_seq}`);
      options = (info.optionList || []).map((o) => ({ name: unescapeHtml(o.option_name), from: o.start_date, to: o.end_date, cost: o.cost }));
      await sleep(250);
      const gi = await tsGet(`/tour/getDomesticTourGolfclubInfoList?tour_seq=${t.tour_seq}`);
      const uniq = new Map();
      for (const g of gi.golfclubInfoList || []) if (!uniq.has(g.golfclub_seq)) uniq.set(g.golfclub_seq, g);
      for (const g of uniq.values()) {
        const ck = String(g.golfclub_seq);
        if (!(ck in cache)) { cache[ck] = await resolveMapUrl(g.map_url); await sleep(300); }
        const pos = cache[ck];
        let route = null;
        if (pos && city && city.airport) {
          const rk = `${ck}|${city.iata}`;
          if (!(rk in cache)) { cache[rk] = await osrmRoute(city.airport, pos); await sleep(1100); }
          route = cache[rk];
          // 공항에서 300km 넘게 떨어지면 공항 판단이 틀렸을 수 있어 표시하지 않는다.
          if (route && route.km > 300) route = null;
        }
        clubs.push({ name: unescapeHtml(g.golfclub_name), en: unescapeHtml(g.address2 || ''), holes: g.hole_count || null, airport: route });
      }
      await sleep(250);
    } catch (e) { stat.errors++; log('해외 상품 상세 실패', t.tour_seq, e.message); }
    if (!clubs.length) clubs = (t.club_name || []).map((n) => ({ name: unescapeHtml(n), airport: null }));
    const prices = options.map((o) => o.cost).filter((x) => x > 0);
    const price = prices.length ? Math.min(...prices) : t.sales_cost;
    const fl = city ? flights.airports[city.iata] || null : null;
    out.push({
      id: `tst-${t.tour_seq}`,
      title,
      country: city?.country || unescapeHtml(t.area_seq_name || ''),
      city: city?.city || '',
      iata: city?.iata || '',
      price, cur: 'KRW',
      flightIncl: flightIncluded(`${title} ${options.map((o) => o.name).join(' ')} ${t.keywords || ''}`),
      options, clubs,
      flight: fl,
      site: '티스캐너',
      seller: unescapeHtml(t.import_company_name || '') || '티스캐너',
      photo: t.thmbn_file_url || '',
      url: `https://www.teescanner.com/tour/detail?tab=product&tour_seq=${t.tour_seq}`,
    });
    stat.abroad++;
  }
  writeJson('abroad-clubs.json', cache);
  // 골프몬 해외 상품: 한국 밖 접속을 막는 사이트라 GitHub 에서는 못 받고, 한국 위치로 연 화면을 정리한 저장본을 쓴다(수집 시각 표시).
  const gm = readJson('golfmon-abroad.json', null);
  if (gm?.items?.length) {
    for (const it of gm.items) {
      const city = cityOf(it.city);
      out.push({
        id: `gm-${out.length}`, title: it.title, country: city?.country || ['말레이시아', '인도네시아', '일본', '태국', '베트남', '필리핀', '중국'].find((c) => it.city.includes(c)) || '', city: city?.city || '', iata: city?.iata || '',
        price: it.price, cur: 'KRW', flightIncl: flightIncluded(it.title) === 'no' ? 'no' : it.air ? 'yes' : 'unknown', // 골프몬 목록은 항공 포함 상품에 비행기 표시와 항공사를 붙인다 options: it.from ? [{ name: `${it.from} ~ ${it.to} 출발`, cost: it.price }] : [], clubs: [],
        flight: city ? flights.airports[city.iata] || null : null, airline: it.air && it.air !== '실시간 최저가' ? it.air : '',
        site: '골프몬', seller: '골프몬', photo: it.img || '', url: 'https://www.golfmon.net/overseas/tour', collectedAt: gm.collectedAt,
      });
    }
    stat.golfmon = gm.items.length;
  }
  return { list: out, flightsAt: flights.observedAt || null, flightsSource: flights.source || null };
}

// ── 환율 ──────────────────────────────────────────────────
async function fx() {
  try {
    const r = await fetch('https://open.er-api.com/v6/latest/KRW');
    const j = await r.json();
    if (j.result !== 'success') return null;
    const pick = {};
    for (const c of ['USD', 'JPY', 'THB', 'VND', 'PHP', 'MYR', 'CNY', 'TWD']) if (j.rates[c]) pick[c] = 1 / j.rates[c];
    return { base: 'KRW', perUnit: pick, source: 'ExchangeRate-API (open.er-api.com)', at: j.time_last_update_utc };
  } catch { return null; }
}

// ── 실행 ──────────────────────────────────────────────────
// 해외 골프장(몽키트래블)만 다시 받을 때: GOLF_ONLY_MT=1 node tools/golf/collect.mjs (나머지 자료는 그대로 둔다)
if (process.env.GOLF_ONLY_MT) {
  const prev = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  const st = { errors: 0 };
  prev.courses = await collectMonkey(st);
  prev.sources = [...(prev.sources || []).filter((x) => x.id !== 'mt'), { id: 'mt', name: '몽키트래블 골프장', ok: prev.courses.length > 0, ...st, at: new Date().toISOString() }];
  fs.writeFileSync(OUT, JSON.stringify(prev));
  log(`몽키트래블만 저장: ${prev.courses.length}곳`, st);
  process.exit(0);
}

const dates = kstDates(DAYS);
const hubs = await loadHubs();
const courses = new Map();
const meta = { sources: [] };
const tsStat = { days: 0, offers: 0, only9: 0 };
const gpStat = { pages: 0, rows: 0, hidden: 0, not18: 0, errors: 0, merged: 0, unplaced: new Set() };
const abStat = { abroad: 0, errors: 0 };

try { await collectTeescanner(dates, courses, tsStat); await teescannerInfo(courses); meta.sources.push({ id: 'ts', name: '티스캐너', ok: true, ...tsStat, at: new Date().toISOString() }); }
catch (e) { meta.sources.push({ id: 'ts', name: '티스캐너', ok: false, error: e.message }); log('티스캐너 실패', e.message); }

try {
  const gpRows = await collectGolfpang(dates, gpStat);
  await mergeGolfpang(gpRows, courses, gpStat);
  meta.sources.push({ id: 'gp', name: '골팡', ok: gpStat.pages > 0, pages: gpStat.pages, rows: gpStat.rows, hidden: gpStat.hidden, not18: gpStat.not18, merged: gpStat.merged, unplaced: gpStat.unplaced.size, at: new Date().toISOString() });
} catch (e) { meta.sources.push({ id: 'gp', name: '골팡', ok: false, error: e.message }); log('골팡 실패', e.message); }

const gmStat = { pages: 0, rows: 0, errors: 0, merged: 0, unplaced: new Set() };
if (FIRECRAWL) {
  try {
    const gmRows = await collectGolfmon(dates, gmStat);
    await mergeGolfpang(gmRows, courses, gmStat, 'gm');
    meta.sources.push({ id: 'gm', name: '골프몬', ok: gmStat.pages > 0, pages: gmStat.pages, rows: gmStat.rows, merged: gmStat.merged, unplaced: gmStat.unplaced.size, errors: gmStat.errors, days: GOLFMON_DAYS, at: new Date().toISOString() });
  } catch (e) { meta.sources.push({ id: 'gm', name: '골프몬', ok: false, error: e.message }); log('골프몬 실패', e.message); }
  try { log(`골프몬 해외 상품 ${await collectGolfmonAbroad()}개`); } catch (e) { log('골프몬 해외 실패', e.message.slice(0, 80)); }
} else log('FIRECRAWL_API_KEY 없음 — 골프몬은 저장본만 사용');

const tuStat = { pages: 0, clubPages: 0, errors: 0, merged: 0, newCourses: 0, only9: 0 };
try { await collectTeeupnjoy(dates, courses, tuStat); meta.sources.push({ id: 'tu', name: '티업엔조이', ok: tuStat.pages > 0, ...tuStat, at: new Date().toISOString() }); }
catch (e) { meta.sources.push({ id: 'tu', name: '티업엔조이', ok: false, error: e.message }); log('티업엔조이 실패', e.message); }

await driveTimes(courses, hubs, meta);

let abroad = { list: [] };
try { abroad = await collectAbroad(abStat); meta.sources.push({ id: 'tst', name: '티스캐너 해외 골프', ok: true, count: abStat.abroad, errors: abStat.errors, at: new Date().toISOString() }); }
catch (e) { meta.sources.push({ id: 'tst', name: '티스캐너 해외 골프', ok: false, error: e.message }); log('해외 실패', e.message); }

const mtStat = { errors: 0 };
let monkey = [];
try { monkey = await collectMonkey(mtStat); meta.sources.push({ id: 'mt', name: '몽키트래블 골프장', ok: monkey.length > 0, ...mtStat, at: new Date().toISOString() }); }
catch (e) { meta.sources.push({ id: 'mt', name: '몽키트래블 골프장', ok: false, error: e.message }); log('몽키트래블 실패', e.message); }

const rate = await fx();

// 앱에 내보낼 모양: 가격이 하나라도 있는 골프장만, 1인 총비용(같은 기준: 카트·캐디피 포함 예상가)을 붙인다.
// 카트·캐디피를 모르는 골프장은 같은 지역(티스캐너 지역 1단계) 골프장들의 중간값을 예상값으로 쓴다.
const areaOf = (co) => String(co.area || '').split('>')[0].trim();
const feeByArea = new Map();
for (const co of courses.values()) {
  const a = areaOf(co);
  const e = feeByArea.get(a) || { cart: [], caddie: [] };
  if (co.cartFee) e.cart.push(co.cartFee);
  if (co.caddieFee) e.caddie.push(co.caddieFee);
  feeByArea.set(a, e);
}
const allCart = median([...courses.values()].map((c) => c.cartFee || 0));
const allCaddie = median([...courses.values()].map((c) => c.caddieFee || 0));
const estFor = (co) => { const e = feeByArea.get(areaOf(co)); return { estCart: (e && e.cart.length >= 3 && median(e.cart)) || allCart, estCaddie: (e && e.caddie.length >= 3 && median(e.caddie)) || allCaddie }; };
let par3 = 0;
const list = [];
for (const co of courses.values()) {
  if (isPar3(co.name)) { par3++; continue; }
  const est = estFor(co);
  const days = {};
  for (const [day, offers] of Object.entries(co.offers)) {
    // 노캐디 여부를 알려 주지 않는 플랫폼(티업엔조이·골프몬)은, 같은 골프장·같은 날 다른 플랫폼에서 노캐디로 확인되면 그대로 따른다(같은 기준 비교).
    const dayNoCaddie = offers.some((o) => o.noCaddie === true);
    const priced = offers.map((o) => ({ o, cost: perPersonCost(o.price, co.cartFee, co.caddieFee, { noCaddie: o.noCaddie ?? dayNoCaddie, cartIncluded: o.cartIncluded, ...est }) }));
    const best = priced.reduce((a, b) => (b.cost.total < a.cost.total ? b : a));
    days[day] = { ...best.cost, src: best.o.src, offers: priced.map(({ o, cost }) => [o.src, o.price, o.count, cost.total]) }; // 링크는 앱이 만든다(파일 크기 줄이기)
  }
  if (!Object.keys(days).length) continue;
  if (co.holes && co.holes < 18) continue; // 9홀 골프장은 18홀 가격과 비교되지 않아 뺀다
  list.push({ id: co.id, name: co.name, area: co.area || '', addr: co.addr || '', tel: co.tel || '', lat: Math.round(co.lat * 1e5) / 1e5, lng: Math.round(co.lng * 1e5) / 1e5, grade: co.grade || null, holes: co.holes || null, type: co.type || '', kakaoId: co.kakaoId || '', ids: co.ids || {}, photo: co.photo || '', drive: co.drive || {}, days });
}
log(`파3 골프장 제외 ${par3}곳`);
list.sort((a, b) => a.name.localeCompare(b.name, 'ko'));

const out = {
  v: 2,
  updatedAt: new Date().toISOString(),
  dates,
  sources: meta.sources,
  drive: meta.drive,
  fx: rate,
  domestic: list,
  abroad: abroad.list,
  courses: monkey,
  flightsAt: abroad.flightsAt,
  flightsSource: abroad.flightsSource,
  notes: {
    cost: '1인 총비용 = 1인 그린피 + 카트비÷4 + 캐디피÷4 (카트·캐디피는 티스캐너 골프장 정보의 팀 요금). 모르는 항목이 있으면 "미포함"으로 표시한다.',
    golfpang: '골팡은 양도·부킹 게시글 기준, 18홀만, 골프장 이름을 감춘(비공개) 글은 뺀다. 날짜·지역마다 싼 순서로 최대 ' + GP_MAX_PAGES * 100 + '개까지 본다.',
  },
};
fs.writeFileSync(OUT, JSON.stringify(out));
log(`저장: 국내 ${list.length}곳, 해외 상품 ${abroad.list.length}개 → app/data/golf.json (${Math.round(fs.statSync(OUT).size / 1024)}KB)`);
if (gpStat.unplaced.size) log('골팡 위치 못 찾은 골프장:', [...gpStat.unplaced].slice(0, 40).join(', '));
process.exit(0);
