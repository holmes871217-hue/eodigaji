// 골픽 골프몬 수집 서버 (구글 클라우드 런, 서울 asia-northeast3) — 플레이라이트로 골프몬 공개 화면을 읽는다.
// 열 수 있는 화면은 골프몬 양도 목록과 해외 투어 목록 두 개뿐이다(아무 주소나 열어 주는 서버가 아니다).
// 사람이 쓰는 크롬과 같은 브라우저 정보(한국어, 서울 시간)로 열고, 요청은 한 번에 하나씩 천천히 보낸다.
//   GET /health
//   GET /golfmon/calendar                      → { mode, cells: [{ rid, date, n }] }  양도 달력(지역·날짜별 매물 수)
//   GET /golfmon?day=YYYY-MM-DD[&regions=9,1]  → { mode, day, results: [{ rid, ok, text | error }] }
//   GET /golfmon/abroad                        → { mode, ok, text, html }  해외 투어 목록
import express from 'express';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const LIST = 'https://www.golfmon.net/booking/list?tab=%EC%96%91%EB%8F%84';
const ABROAD = 'https://www.golfmon.net/overseas/tour';
const REGIONS = ['9', '1', '8', '2', '3', '4', '5', '6', '7']; // 인천경인·경기북부·경기동부·경기남부·충청·강원·전라·경상·제주
const cell = (rid, day) => `.schedule-count[data-gtm-meta*='"region_id":"${rid}","date":"${day}"']`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const BLOCKED = /요청이 차단되었습니다|서비스 이용 지역 안내/;

// 브라우저 두 가지: 화면 없는 크롬(기본) → 막히면 화면 있는 크롬(가상 화면 xvfb)
const MODES = ['headless', 'headed'];
const browsers = {};
let mode = MODES[0];
let busy = false;

// 화면 있는 크롬이 필요할 때만 가상 화면(Xvfb :99)을 띄운다
let xvfb = null;
async function ensureDisplay() {
  if (process.env.DISPLAY) return;
  if (!xvfb) {
    xvfb = spawn('Xvfb', [':99', '-screen', '0', '1366x900x24', '-nolisten', 'tcp'], { stdio: 'ignore' });
    xvfb.on('error', (e) => console.log('Xvfb 실행 실패', e.message));
    await sleep(1500);
  }
  process.env.DISPLAY = ':99';
}

async function context(m) {
  if (m === 'headed') await ensureDisplay();
  if (!browsers[m] || !browsers[m].isConnected()) {
    browsers[m] = await chromium.launch({ headless: m === 'headless', executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  }
  return browsers[m].newContext({ userAgent: UA, locale: 'ko-KR', timezoneId: 'Asia/Seoul', viewport: { width: 1366, height: 900 }, extraHTTPHeaders: { 'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8' } });
}

/** 화면을 열어 본다. 막혔으면 다음 브라우저 방식으로 한 번 더. 성공한 방식을 기억한다. */
async function openPage(url, ready) {
  const order = [mode, ...MODES.filter((m) => m !== mode)];
  let last = null;
  for (const m of order) {
    const ctx = await context(m);
    const page = await ctx.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await sleep(2500);
      const title = await page.title();
      const head = (await page.innerText('body').catch(() => '')).slice(0, 300);
      if (BLOCKED.test(title) || BLOCKED.test(head)) { last = `${m}: ${title}`; await ctx.close(); continue; }
      if (ready) await page.waitForSelector(ready, { state: 'attached', timeout: 20000 });
      mode = m;
      return { ctx, page };
    } catch (e) { last = `${m}: ${String(e.message || e).slice(0, 120)}`; await ctx.close(); }
  }
  throw new Error(`열기 실패 (${last})`);
}

async function scrollAll(page) {
  let last = 0;
  for (let i = 0; i < 12; i++) {
    const h = await page.evaluate(() => { window.scrollTo(0, document.body.scrollHeight); return document.body.scrollHeight; });
    if (h === last) break;
    last = h;
    await sleep(1200);
  }
}

async function readRegion(rid, day) {
  let opened = null;
  try {
    opened = await openPage(LIST, cell(rid, day));
    const { page } = opened;
    await page.$eval(cell(rid, day), (el) => { el.scrollIntoView({ block: 'center' }); el.click(); });
    await sleep(4000);
    await scrollAll(page);
    return { rid, ok: true, text: await page.innerText('body') };
  } catch (e) {
    return { rid, ok: false, error: String(e.message || e).slice(0, 200) };
  } finally {
    await opened?.ctx.close().catch(() => {});
    await sleep(1500); // 천천히
  }
}

const app = express();
const one = (fn) => async (req, res) => {
  if (busy) return res.status(429).json({ error: '다른 수집 중' });
  busy = true;
  try { res.json({ mode, ...(await fn(req)) }); } catch (e) { res.status(500).json({ mode, error: String(e.message || e).slice(0, 300) }); } finally { busy = false; }
};

app.get('/health', (_req, res) => res.json({ ok: true, name: 'golfmon-collector', busy, mode }));

app.get('/golfmon/calendar', one(async () => {
  const { ctx, page } = await openPage(LIST, '.schedule-count');
  try {
    const cells = await page.$$eval('.schedule-count[data-gtm-meta]', (els) => els.map((el) => {
      const meta = el.getAttribute('data-gtm-meta') || '';
      return { rid: /"region_id":"(\d+)"/.exec(meta)?.[1] || null, date: /"date":"(\d{4}-\d{2}-\d{2})"/.exec(meta)?.[1] || null, n: Number((el.textContent || '').replace(/[^\d]/g, '')) || 0 };
    }).filter((c) => c.rid && c.date));
    return { cells };
  } finally { await ctx.close(); }
}));

app.get('/golfmon', one(async (req) => {
  const day = String(req.query.day || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('day=YYYY-MM-DD 필요');
  const regions = req.query.regions ? String(req.query.regions).split(',').filter((r) => REGIONS.includes(r)) : REGIONS;
  const results = [];
  for (const rid of regions) results.push(await readRegion(rid, day));
  return { day, results };
}));

app.get('/golfmon/abroad', one(async () => {
  const { ctx, page } = await openPage(ABROAD);
  try {
    await sleep(3000);
    await scrollAll(page);
    return { ok: true, text: await page.innerText('body'), html: await page.content() };
  } finally { await ctx.close(); }
}));

// ── 카카오골프: 먼저 구조 확인용(robots.txt, 화면 글, 화면이 부르는 JSON 주소) ─────────────
import { readFileSync } from 'node:fs';
app.get('/kakaogolf/probe', one(async (req) => {
  const path = String(req.query.path || '/');
  if (!/^\/[\w\-/?=&.%]*$/.test(path)) throw new Error('path 형식 오류');
  const ctx = await context(mode);
  const page = await ctx.newPage();
  const xhr = [];
  page.on('response', async (r) => {
    const ct = r.headers()['content-type'] || '';
    if (!/json/.test(ct) || xhr.length >= 25) return;
    try { xhr.push({ url: r.url().slice(0, 300), status: r.status(), body: (await r.text()).slice(0, 2000) }); } catch {}
  });
  try {
    let robots = '';
    try { const rr = await ctx.request.get('https://www.kakao.golf/robots.txt'); robots = `${rr.status()} ${(await rr.text()).slice(0, 3000)}`; } catch (e) { robots = String(e.message).slice(0, 200); }
    await page.goto(`https://www.kakao.golf${path}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(5000);
    await scrollAll(page);
    const links = await page.$$eval('a', (as) => [...new Set(as.map((a) => a.href))].slice(0, 80));
    return { robots, url: page.url(), title: await page.title(), text: (await page.innerText('body')).slice(0, 6000), links, xhr };
  } finally { await ctx.close(); }
}));

// ── 골프장 홈페이지(티스캐너에 등록된 공식 홈페이지 주소만): 이벤트 확인용 ─────────────
const HOMEPAGES = JSON.parse(readFileSync(new URL('./homepages.json', import.meta.url), 'utf8'));
const HP_HOSTS = new Set(Object.values(HOMEPAGES).map((x) => new URL(x.u).hostname.replace(/^www\./, '')));
const EV = /이벤트|EVENT|특가|프로모션|할인|그린피/i;
app.get('/homepage', one(async (req) => {
  const u = new URL(String(req.query.u || ''));
  if (!HP_HOSTS.has(u.hostname.replace(/^www\./, ''))) throw new Error('등록된 골프장 홈페이지가 아님');
  const ctx = await context(mode);
  const page = await ctx.newPage();
  try {
    await page.goto(u.href, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000);
    const text = (await page.innerText('body').catch(() => '')).slice(0, 20000);
    const links = await page.$$eval('a', (as) => as.map((a) => ({ t: (a.innerText || a.title || '').trim().slice(0, 80), h: a.href }))).catch(() => []);
    const imgs = await page.$$eval('img', (is) => is.map((i) => ({ alt: i.alt || '', src: i.src }))).catch(() => []);
    return { url: page.url(), title: await page.title(), text, links: links.filter((l) => EV.test(`${l.t} ${l.h}`)).slice(0, 30), imgs: imgs.filter((i) => EV.test(`${i.alt} ${i.src}`)).slice(0, 20) };
  } finally { await ctx.close(); }
}));

// ── 한국 브라우저 창구: 비밀 토큰(KR_BROWSER_TOKEN)을 가진 쪽만, 아무 공개 화면이나 한국에서 열어 준다 ─────────
// POST /browse  헤더 Authorization: Bearer <토큰>
// { url, actions: [{type:'wait',ms}|{type:'click',selector}|{type:'scroll'}|{type:'type',selector,text}|{type:'goto',url}],
//   want: ['text','html','links','imgs','xhr','screenshot'], mode: 'headless'|'headed', xhrMax: JSON 응답 글자 수(기본 4000, 최대 200000) }
app.use(express.json({ limit: '200kb' }));
const TOKEN = process.env.KR_BROWSER_TOKEN || '';
app.post('/browse', async (req, res) => {
  if (!TOKEN || req.get('authorization') !== `Bearer ${TOKEN}`) return res.status(401).json({ error: '토큰 필요' });
  if (busy) return res.status(429).json({ error: '다른 일 처리 중' });
  busy = true;
  const b = req.body || {};
  const want = new Set(b.want || ['text']);
  let ctx = null;
  try {
    const u = new URL(String(b.url || ''));
    if (!/^https?:$/.test(u.protocol)) throw new Error('http(s) 주소만');
    ctx = await context(b.mode === 'headed' ? 'headed' : mode);
    const page = await ctx.newPage();
    const xhr = [];
    if (want.has('xhr')) page.on('response', async (r) => {
      const ct = r.headers()['content-type'] || '';
      if (!/json/.test(ct) || xhr.length >= 40) return;
      try { xhr.push({ url: r.url().slice(0, 400), status: r.status(), body: (await r.text()).slice(0, Math.min(Number(b.xhrMax) || 4000, 3000000)) }); } catch {}
    });
    const resp = await page.goto(u.href, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(2500);
    for (const a of (b.actions || []).slice(0, 30)) {
      if (a.type === 'wait') await sleep(Math.min(Number(a.ms) || 1000, 15000));
      else if (a.type === 'click') await page.$eval(String(a.selector), (el) => { el.scrollIntoView({ block: 'center' }); el.click(); });
      else if (a.type === 'scroll') await scrollAll(page);
      else if (a.type === 'type') await page.fill(String(a.selector), String(a.text || ''));
      else if (a.type === 'goto') await page.goto(String(a.url), { waitUntil: 'domcontentloaded', timeout: 45000 });
    }
    const out = { status: resp?.status() || null, url: page.url(), title: await page.title() };
    if (want.has('text')) out.text = (await page.innerText('body').catch(() => '')).slice(0, 60000);
    if (want.has('html')) out.html = (await page.content()).slice(0, 400000);
    if (want.has('links')) out.links = await page.$$eval('a', (as) => as.map((a) => ({ t: (a.innerText || a.title || '').trim().slice(0, 100), h: a.href })).slice(0, 400));
    if (want.has('imgs')) out.imgs = await page.$$eval('img', (is) => is.map((i) => ({ alt: i.alt || '', src: i.src })).slice(0, 200));
    if (want.has('xhr')) out.xhr = xhr;
    if (want.has('screenshot')) out.screenshot = (await page.screenshot({ type: 'jpeg', quality: 60 })).toString('base64');
    res.json({ mode, ...out });
  } catch (e) {
    res.status(500).json({ mode, error: String(e.message || e).slice(0, 300) });
  } finally {
    await ctx?.close().catch(() => {});
    busy = false;
  }
});

// ── 골픽 해외 항공권: 앱이 고른 라운딩 일정으로 인천 왕복 최저가를 묻는다(네이버 항공권 MCP 서버, 서울) ─────────
// GET /fare?to=BKK&dep=YYYY-MM-DD&ret=YYYY-MM-DD&after=17
//  → 10개 후보 중 "돌아오는 편이 after 시 이후에 출발"하는 가장 싼 편(마지막 날 라운딩 뒤 출발). 없으면 가장 싼 편.
// 앱(github.io)에서만 부를 수 있게 CORS 를 좁히고, 같은 질문은 6시간 저장해 둔다.
const NAVER_MCP = process.env.NAVER_MCP || 'https://naver-flight-mcp-oqvj6zwx3q-du.a.run.app/mcp';
const FARE_ORIGINS = new Set(['https://holmes871217-hue.github.io', 'http://localhost:8765']);
const fareCache = new Map();
let fareRunning = 0;
function fareCors(req, res) {
  const o = req.get('origin');
  if (o && FARE_ORIGINS.has(o)) { res.set('Access-Control-Allow-Origin', o); res.set('Vary', 'Origin'); }
}
function parseFlights(text) {
  return String(text).split('---').map((b) => {
    const g = (k) => new RegExp(`${k}:\\s*([^\\n]+)`).exec(b)?.[1]?.trim() || '';
    const price = Number(g('총요금').replace(/[^\d]/g, '')) || 0;
    const legs = [...b.matchAll(/소요시간:\s*(\d+)분/g)].map((m) => Number(m[1]));
    return { price, out: g('가는편'), back: g('오는편'), outDep: g('가는편 출발'), outArr: g('가는편 도착'), backDep: g('오는편 출발'), backArr: g('오는편 도착'), outMin: legs[0] || null, backMin: legs[1] || null };
  }).filter((f) => f.price > 0);
}
app.get('/fare', async (req, res) => {
  fareCors(req, res);
  const to = String(req.query.to || '').toUpperCase(), dep = String(req.query.dep || ''), ret = String(req.query.ret || '');
  const after = Math.max(0, Math.min(23, Number(req.query.after ?? 17)));
  if (!/^[A-Z]{3}$/.test(to) || !/^\d{4}-\d{2}-\d{2}$/.test(dep) || !/^\d{4}-\d{2}-\d{2}$/.test(ret)) return res.status(400).json({ error: 'to, dep, ret 필요' });
  const key = `${to}|${dep}|${ret}|${after}`;
  const hit = fareCache.get(key);
  if (hit && Date.now() - hit.at < 6 * 3600e3) return res.json({ ...hit.data, cached: true });
  if (fareRunning >= 3) return res.status(429).json({ error: '조회가 많아요. 잠시 후 다시' });
  fareRunning++;
  try {
    const body = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'search_naver_flights', arguments: { departure: 'ICN', arrival: to, departureDate: dep, returnDate: ret } } };
    const r = await fetch(NAVER_MCP, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify(body), signal: AbortSignal.timeout(90000) });
    const raw = await r.text();
    const line = raw.split('\n').find((l) => l.startsWith('data:'));
    const j = JSON.parse(line ? line.slice(5) : raw);
    const text = j.result?.content?.map((c) => c.text).join('\n') || '';
    const list = parseFlights(text);
    const hour = (t) => Number(String(t).slice(0, 2));
    const fit = list.filter((f) => f.backDep && hour(f.backDep) >= after).sort((a, b) => a.price - b.price);
    const any = [...list].sort((a, b) => a.price - b.price);
    const pick = fit[0] || any[0] || null;
    const data = { to, dep, ret, after, src: 'naver', at: new Date().toISOString(), min: any[0]?.price || null, pick, fitsAfter: Boolean(fit[0]), n: list.length };
    if (pick) fareCache.set(key, { at: Date.now(), data });
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: String(e.message || e).slice(0, 200) });
  } finally { fareRunning--; }
});

const port = Number(process.env.PORT || 8080);
app.listen(port, () => console.log(`golfmon-collector :${port}`));
