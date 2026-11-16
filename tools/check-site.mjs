// 사이트 점검: 앱이 부르는 파일이 모두 있는지, 게시 주소에서 깨질 경로가 없는지 자동으로 확인한다.
//
// 사용:
//   node tools/check-site.mjs                 앱 폴더(app/)만 검사한다(인터넷 필요 없음).
//   node tools/check-site.mjs <게시 주소>      위 검사 + 게시된 주소에서 같은 파일들이 실제로 200 으로 열리는지 확인한다.
//                                             예) node tools/check-site.mjs https://holmes871217-hue.github.io/eodigaji/
// 문제가 있으면 목록을 찍고 종료 코드 1. 새 파일을 추가하거나 최적화·리팩터링한 뒤, 게시 전에 한 번 돌릴 것.
//
// 이 앱은 주소 뒤에 /eodigaji/ 가 붙는 곳(GitHub Pages 프로젝트 사이트)에 게시된다. 그래서
//  - 파일 경로를 "/js/..." 처럼 맨 앞 슬래시로 쓰면 github.io/js/... 로 가서 404 가 난다 → 금지(아래에서 잡는다).
//  - 모든 경로는 "./js/..." 또는 "js/..." 같은 상대 경로여야 한다.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname, normalize, relative, resolve } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const APP = join(ROOT, 'app');
const base = process.argv[2] ? process.argv[2].replace(/\/?$/, '/') : null;
const problems = [];
const bad = (msg) => problems.push(msg);
const rel = (p) => relative(ROOT, p).replace(/\\/g, '/');
const read = (p) => readFileSync(p, 'utf8');

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    statSync(p).isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
}
const isLocal = (u) => u && !/^([a-z]+:|\/\/|#|data:|mailto:|tel:)/i.test(u);

// 1) 맨 앞 슬래시 경로(게시 주소에서 깨진다)와 존재하지 않는 import
const jsFiles = walk(join(APP, 'js')).filter((f) => f.endsWith('.js'));
for (const f of jsFiles) {
  const src = read(f);
  // 문자열 안에서 맨 앞 슬래시로 시작하는 앱 내부 경로(import·fetch·src·href)
  for (const m of src.matchAll(/(?:import\s*\(|from\s+|fetch\s*\(|new URL\s*\()\s*['"`](\/[^'"`/][^'"`]*)['"`]/g)) {
    if (!/^\/\//.test(m[1])) bad(`${rel(f)}: 맨 앞 슬래시 경로 "${m[1]}" — 게시 주소(/eodigaji/ 아래)에서는 404 가 납니다. "./" 또는 앞 슬래시 없는 상대 경로를 쓰세요.`);
  }
  // 상대 import 대상이 실제로 있는지
  for (const m of src.matchAll(/(?:\bimport\s+[^'"`;]*?from\s+|\bimport\s*\(\s*|\bimport\s+)['"](\.{1,2}\/[^'"]+)['"]/g)) {
    const target = normalize(join(dirname(f), m[1]));
    if (!existsSync(target)) bad(`${rel(f)}: import "${m[1]}" 파일이 없습니다.`);
  }
  // 정적인 data/ 파일 호출(템플릿 변수가 없는 것)이 실제로 있는지
  for (const m of src.matchAll(/fetch\s*\(\s*['"](data\/[^'"$]+)['"]/g)) {
    if (!existsSync(join(APP, m[1]))) bad(`${rel(f)}: fetch "${m[1]}" 파일이 없습니다.`);
  }
}

// 2) index.html · manifest · 서비스 워커 목록이 가리키는 파일
const html = read(join(APP, 'index.html'));
const refs = [...html.matchAll(/(?:href|src)=["']([^"']+)["']/g)].map((m) => m[1]).filter(isLocal);
const manifest = JSON.parse(read(join(APP, 'manifest.webmanifest')));
refs.push('manifest.webmanifest', ...(manifest.icons || []).map((i) => i.src));
const swSrc = read(join(APP, 'sw.js'));
const shell = [...(swSrc.match(/const SHELL = \[([\s\S]*?)\];/)?.[1] || '').matchAll(/'([^']+)'/g)].map((m) => m[1]).filter((u) => u !== './');
refs.push(...shell);
for (const r of [...new Set(refs)]) {
  if (!existsSync(join(APP, r))) bad(`index.html·manifest·서비스 워커 목록의 "${r}" 파일이 앱 폴더에 없습니다(서비스 워커 설치가 통째로 실패할 수 있어요).`);
}
// 앱 JS 파일이 서비스 워커 목록에 빠져 있으면 오프라인에서 안 열린다
for (const f of jsFiles) {
  const r = relative(APP, f).replace(/\\/g, '/');
  if (!shell.includes(r)) bad(`sw.js 의 SHELL 목록에 "${r}" 이(가) 없습니다(인터넷이 끊기면 이 파일이 없어 앱이 안 열려요).`);
}

// 3) 데이터 파일: JSON 이 읽히는지, 주차장 격자 목록과 실제 파일이 맞는지
for (const f of walk(join(APP, 'data')).filter((p) => p.endsWith('.json'))) {
  try { JSON.parse(read(f)); } catch (e) { bad(`${rel(f)}: JSON 이 깨졌습니다 (${e.message.slice(0, 60)})`); }
}
const idxPath = join(APP, 'data/parking/index.json');
if (existsSync(idxPath)) {
  for (const k of Object.keys(JSON.parse(read(idxPath)).cells || {})) {
    if (!existsSync(join(APP, `data/parking/${k}.json`))) bad(`data/parking/index.json 에 있는 격자 "${k}" 파일이 없습니다.`);
  }
}

// 4) 게시된 주소에서 실제로 열리는지(주소를 준 경우)
if (base) {
  const targets = [...new Set(['', ...refs, 'sw.js', 'data/places.json', 'data/events.json', 'data/spots.json', 'data/parking/index.json', 'data/seoul-parking.json'])];
  let ok = 0;
  for (const t of targets) {
    try {
      const res = await fetch(`${base}${t}?_check=${Date.now()}`, { redirect: 'follow' });
      if (res.ok) ok++; else bad(`게시된 주소에서 "${t || '(첫 화면)'}" 이(가) ${res.status} 입니다.`);
    } catch (e) {
      bad(`게시된 주소에서 "${t}" 을(를) 못 열었습니다 (${e.cause?.code || e.message}).`);
    }
  }
  console.log(`게시 주소 ${base} : ${ok}/${targets.length}개 열림`);
}

console.log(`검사한 앱 JS ${jsFiles.length}개, 서비스 워커 목록 ${shell.length}개, 참조 파일 ${new Set(refs).size}개`);
if (problems.length) {
  console.log(`\n❌ 문제 ${problems.length}건`);
  for (const p of problems) console.log(` - ${p}`);
  process.exit(1);
}
console.log('✅ 문제 없음');
process.exit(0); // 인터넷 연결이 남아 있어도 바로 끝낸다
