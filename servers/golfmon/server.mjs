// 골픽 골프몬 수집 서버 (구글 클라우드 런, 서울 asia-northeast3)
// 골프몬은 한국 밖 접속을 막아서, 한국에 있는 이 서버가 플레이라이트로 양도 목록 화면을 열어 글자만 돌려준다.
// 열 수 있는 화면은 골프몬 양도 목록 하나뿐이다(아무 주소나 열어 주는 서버가 아니다).
//   GET /health
//   GET /golfmon?day=2026-11-28[&regions=9,1,8]  → { day, results: [{ rid, ok, text | error }] }
import express from 'express';
import { chromium } from 'playwright';

const LIST = 'https://www.golfmon.net/booking/list?tab=%EC%96%91%EB%8F%84';
const REGIONS = ['9', '1', '8', '2', '3', '4', '5', '6', '7']; // 인천경인·경기북부·경기동부·경기남부·충청·강원·전라·경상·제주
const cell = (rid, day) => `.schedule-count[data-gtm-meta*='"region_id":"${rid}","date":"${day}"']`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let browser = null;
let busy = false;

async function readRegion(ctx, rid, day) {
  const page = await ctx.newPage();
  try {
    await page.goto(LIST, { waitUntil: 'domcontentloaded', timeout: 45000 });
    // 칸이 화면에 안 보여도(접힌 달력 등) 있으면 직접 누른다
    await page.waitForSelector(cell(rid, day), { state: 'attached', timeout: 25000 });
    await page.$eval(cell(rid, day), (el) => { el.scrollIntoView({ block: 'center' }); el.click(); });
    await sleep(4000);
    // 아래로 내려 더 불러오기: 길이가 더 안 늘면 멈춘다
    let last = 0;
    for (let i = 0; i < 12; i++) {
      const h = await page.evaluate(() => { window.scrollTo(0, document.body.scrollHeight); return document.body.scrollHeight; });
      if (h === last) break;
      last = h;
      await sleep(1200);
    }
    return { rid, ok: true, text: await page.innerText('body') };
  } catch (e) {
    // 원인 확인용: 화면 제목·주소·글자 앞부분·날짜 칸 예시
    const info = await page.evaluate(() => ({
      title: document.title, url: location.href, text: document.body?.innerText?.slice(0, 600) || '',
      cells: [...document.querySelectorAll('[data-gtm-meta]')].slice(0, 5).map((x) => `${x.className} ${x.getAttribute('data-gtm-meta')}`.slice(0, 200)),
    })).catch(() => null);
    return { rid, ok: false, error: String(e.message || e).slice(0, 200), info };
  } finally {
    await page.close().catch(() => {});
  }
}

const app = express();
app.get('/health', (_req, res) => res.json({ ok: true, name: 'golfmon-collector', busy }));
app.get('/golfmon', async (req, res) => {
  const day = String(req.query.day || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return res.status(400).json({ error: 'day=YYYY-MM-DD 필요' });
  const regions = req.query.regions ? String(req.query.regions).split(',').filter((r) => REGIONS.includes(r)) : REGIONS;
  if (busy) return res.status(429).json({ error: '다른 수집 중' });
  busy = true;
  try {
    if (!browser || !browser.isConnected()) browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const ctx = await browser.newContext({ locale: 'ko-KR', timezoneId: 'Asia/Seoul', viewport: { width: 1280, height: 900 } });
    const results = [];
    for (const rid of regions) results.push(await readRegion(ctx, rid, day));
    await ctx.close();
    res.json({ day, results });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e).slice(0, 200) });
  } finally {
    busy = false;
  }
});

const port = Number(process.env.PORT || 8080);
app.listen(port, () => console.log(`golfmon-collector :${port}`));
