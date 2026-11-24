// 골픽 골프몬 수집 서버 (구글 클라우드 런, 서울 asia-northeast3) — 플레이라이트로 골프몬 공개 화면을 읽는다.
// 열 수 있는 화면은 골프몬 양도 목록과 해외 투어 목록 두 개뿐이다(아무 주소나 열어 주는 서버가 아니다).
// 사람이 쓰는 크롬과 같은 브라우저 정보(한국어, 서울 시간)로 열고, 요청은 한 번에 하나씩 천천히 보낸다.
//   GET /health
//   GET /golfmon/calendar                      → { mode, cells: [{ rid, date, n }] }  양도 달력(지역·날짜별 매물 수)
//   GET /golfmon?day=YYYY-MM-DD[&regions=9,1]  → { mode, day, results: [{ rid, ok, text | error }] }
//   GET /golfmon/abroad                        → { mode, ok, text, html }  해외 투어 목록
import express from 'express';
import { chromium } from 'playwright';

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

async function context(m) {
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

const port = Number(process.env.PORT || 8080);
app.listen(port, () => console.log(`golfmon-collector :${port}`));
