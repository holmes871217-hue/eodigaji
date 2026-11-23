// 시험용: FIRECRAWL_API_KEY 로 한국 위치에서 골프몬이 열리는지, 해외 상품 몇 개가 읽히는지, 국내 달력 칸을 눌렀을 때 무엇이 보이는지 출력한다(키 값은 출력하지 않음).
import { parseGolfmonOverseas, golfmonCell } from './lib.mjs';
const KEY = process.env.FIRECRAWL_API_KEY || '';
console.log('FIRECRAWL_API_KEY:', KEY ? '설정됨' : '없음');
if (!KEY) process.exit(0);
async function scrape(body) {
  const r = await fetch('https://api.firecrawl.dev/v2/scrape', { method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, j };
}
const loc = { country: 'KR', languages: ['ko'] };
const a = await scrape({ url: 'https://www.golfmon.net/overseas/tour', formats: ['markdown'], location: loc, waitFor: 4000, onlyMainContent: true });
const md = a.j?.data?.markdown || '';
console.log('해외 응답', a.status, a.j?.success, '오류:', a.j?.error || '-', '글자수', md.length, '403화면?', /이용할 수 없습니다|이용 지역/.test(md));
console.log('해외 상품 읽음', parseGolfmonOverseas(md).length);
const day = new Date(Date.now() + 9 * 3600e3 + 5 * 864e5).toISOString().slice(0, 10);
const b = await scrape({ url: 'https://www.golfmon.net/booking/list?tab=%EC%96%91%EB%8F%84', formats: ['markdown'], location: loc, onlyMainContent: true,
  actions: [{ type: 'wait', milliseconds: 3000 }, { type: 'click', selector: golfmonCell('2', day) }, { type: 'wait', milliseconds: 4000 }, { type: 'scroll', direction: 'down' }, { type: 'wait', milliseconds: 1500 }] });
const md2 = b.j?.data?.markdown || '';
console.log('국내 응답', b.status, b.j?.success, '오류:', b.j?.error || '-', '날짜', day, '글자수', md2.length);
const i = md2.search(/[\d,]{5,}원/);
console.log('국내 내용 일부 >>>\n' + md2.slice(Math.max(0, i - 1500), i + 2500) + '\n<<<');
