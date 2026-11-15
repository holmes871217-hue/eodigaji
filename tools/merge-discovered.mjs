// tools/discover.mjs 가 찾아낸 "요즘 뜨는 곳" 후보를 앱 데이터(app/data/spots.json)에 합친다.
// 단독 실행: node tools/merge-discovered.mjs 발굴결과.json [--min 5]   (카카오·네이버를 다시 부르지 않고 이미 받은 결과만 쓴다)
//
// 합치는 조건: 새로운 곳 + 검색 지역과 카카오 주소가 맞음 + 아이·가족 나들이에 맞는 분류 + 블로거 min명 이상.
// 카페·음식점·학교·교회·스포츠시설·공연기획 등은 뺀다(카페·맛집은 상세 화면의 "근처 맛집/카페"가 따로 맡는다).
// 이미 합쳐 둔 곳은 최근 확인 날짜만 새로 쓰고, 60일 동안 글에서 안 보이면 뺀다(식은 곳이 계속 남지 않게).
import { readFileSync, writeFileSync } from 'node:fs';

const norm = (s) => String(s || '').replace(/[\s·()\-_/.,!'"]/g, '').toLowerCase();
const ALLOW = /^여행|^문화,예술>(문화시설|미술|전시|종교)|^가정,생활>시장|^스포츠,레저>(수영|스키|레저|수상)|^공원/;
const NOT = /음식점|카페|스포츠시설|교육|유아|도서|축산업|여행사|이벤트|공연기획|공연,연극|영화|학교|병원/;
const BAD_NAME = /주차장|매표소|화장실|충전소|정류장|입구|정문|후문|사무소|사무실|관리소|안내소|인포센터|대학교|분소|매점|편의점|기념품|수장고|연구소|예정\)|유통센터|농수산물|보조풀장|상가|공구|도매/;

export const catOf = (r) => {
  const t = `${r.name} ${r.cat}`;
  return /박물관|과학관|전시관|기념관|체험관|천문대/.test(t) ? 'museum'
    : /미술관|갤러리|미디어/.test(t) ? 'gallery'
    : /동물원|아쿠아|수족관|목장|농장/.test(t) ? 'zoo'
    : /해수욕장|해변|포구|등대|갯벌|섬/.test(t) ? 'sea'
    : /테마파크|놀이|워터|유원지|랜드/.test(t) ? 'theme'
    : /스키|레일바이크|집라인|루지|케이블카|전망대|스카이워크|출렁다리|온천|레포츠|체험/.test(t) ? 'activity'
    : /시장/.test(t) ? 'market'
    : /문화유적|한옥|고택|사찰|불교|서원|궁|성곽|산성|민속|마을|종교/.test(t) ? 'culture'
    : /공원|숲|수목원|정원|호수|계곡|폭포|산|저수지|강|하천|자연|생태|꽃/.test(t) ? 'nature'
    : 'walk';
};

export function mergeDiscovered(result, { root = process.cwd(), min = 5, dryRun = false } = {}) {
  const path = `${root}/app/data/spots.json`;
  const data = JSON.parse(readFileSync(path, 'utf8'));
  const spots = data.spots;
  const today = new Date().toISOString().slice(0, 10);
  const byId = new Map(spots.map((s) => [s.id, s]));
  const nearSame = (r) => spots.some((s) => Math.abs(s.lat - r.lat) < 0.003 && Math.abs(s.lng - r.lng) < 0.004 && (() => { const a = norm(s.name), b = norm(r.name); return a.includes(b) || b.includes(a); })());
  let added = 0, refreshed = 0, skipped = 0;
  const seen = new Set();
  const addedRows = [];
  for (const r of result) {
    const regionOk = r.regionOk ?? String(r.addr || '').includes(String(r.topRegion || '').split(' ')[0]); // 예전 결과 파일엔 regionOk 가 없다
    if (r.known || !regionOk || r.bloggers < min) { if (!r.known) skipped++; continue; }
    const id = `k-${r.id}`;
    const old = byId.get(id);
    if (old?.disc) { old.disc = { ...old.disc, b: r.bloggers, at: today }; seen.add(id); refreshed++; continue; }
    if (old) continue; // 이미 다른 경로로 들어온 곳
    if (!ALLOW.test(r.cat) || NOT.test(r.cat) || BAD_NAME.test(r.name)) { skipped++; continue; }
    if (/종교/.test(r.cat) && r.bloggers < 20) { skipped++; continue; }
    if (nearSame(r)) { skipped++; continue; }
    const row = {
      id, name: r.name, cat: catOf(r),
      region: String(r.addr || '').split(' ').slice(0, 2).join(' ').replace(/특별자치도|특별자치시|통합특별시/, ''),
      lat: Number(r.lat.toFixed(5)), lng: Number(r.lng.toFixed(5)),
      sub: r.cat.split('>').slice(-1)[0], url: r.url, pos: 3, hits: 2,
      disc: { b: r.bloggers, at: today, from: r.topRegion },
    };
    spots.push(row); byId.set(id, row); seen.add(id); added++; addedRows.push(row);
  }
  const cut = Date.now() - 60 * 86400000;
  const keep = spots.filter((s) => !s.disc || seen.has(s.id) || s.must || Date.parse(s.disc.at) > cut);
  const dropped = spots.length - keep.length;
  if (!dryRun) writeFileSync(path, JSON.stringify({ ...data, updatedAt: new Date().toISOString(), spots: keep }));
  console.log(`앱 데이터 합치기${dryRun ? '(시험, 저장 안 함)' : ''}: 새로 ${added}곳 추가, 기존 발굴 장소 ${refreshed}곳 확인 갱신, 60일 지나 뺌 ${dropped}곳, 조건 안 맞아 제외 ${skipped}곳 → 동네 장소 총 ${keep.length}곳`);
  return { added, refreshed, dropped, skipped, addedRows, total: keep.length };
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('merge-discovered.mjs')) {
  const file = process.argv[2];
  if (!file) { console.log('사용: node tools/merge-discovered.mjs 발굴결과.json [--min 5] [--dry]'); process.exit(1); }
  const i = process.argv.indexOf('--min');
  mergeDiscovered(JSON.parse(readFileSync(file, 'utf8')).result, { min: i > 0 ? Number(process.argv[i + 1]) : 5, dryRun: process.argv.includes('--dry') });
}
