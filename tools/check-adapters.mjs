// 8단계 점검: 승인 안 된 외부 공급원이 호출·저장·표시되지 않는지, 실패가 기존 서비스를 멈추지 않는지 확인한다.
import { existsSync, readdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ADAPTERS, isLive } from './adapters/index.mjs';
import { runAdapters } from './run-adapters.mjs';

const problems = [];
const ok = (c, m) => { if (!c) problems.push(m); };
const root = new URL('..', import.meta.url).pathname;

ok(ADAPTERS.length >= 4, '공급원 목록이 비어 있어요');
ok(ADAPTERS.every((a) => a.status === 'unapproved'), '승인 전 공급원이 approved 로 되어 있어요(사용자 승인 없이 켜면 안 돼요)');
ok(ADAPTERS.every((a) => !isLive(a, Object.fromEntries((a.requires || []).map((k) => [k, 'x'])))), '승인 전 공급원은 키가 있어도 호출 대상이 되면 안 돼요');
ok(ADAPTERS.every((a) => Array.isArray(a.blockers) && a.blockers.length > 0), '승인 전 공급원에는 막힌 이유(blockers)가 적혀 있어야 해요');
ok(!existsSync(`${root}app/data/signals`) || readdirSync(`${root}app/data/signals`).length === 0, '승인 전인데 app/data/signals 에 파일이 있어요(운영 중처럼 보일 수 있어요)');

// 키가 있어도 승인 전이면 호출하지 않고(네트워크 없이) 안내만 한다
const spots = [{ id: 's1', name: '시험 장소', region: '서울 중구', yearly: 50 }];
const tmp = mkdtempSync(join(tmpdir(), 'adp-'));
const env = { YOUTUBE_API_KEY: 'x', FOURSQUARE_API_KEY: 'x', TRIPADVISOR_API_KEY: 'x', GOOGLE_TRENDS_API_KEY: 'x' };
const lines = await runAdapters({ env, spots, outDir: tmp, mock: false });
ok(lines.some((l) => l.includes('미연동')), '승인 전 공급원은 "미연동"으로 안내해야 해요');
ok(readdirSync(tmp).length === 0, '승인 전 공급원이 결과 파일을 만들었어요');

// 승인된 공급원이 실패(예외)해도 실행은 계속된다
const boom = { id: 'boom', label: '시험(예외)', status: 'approved', requires: [], dailyBudget: 5, blockers: [], fetchSignals: async () => { throw new Error('실패'); }, mock: () => ({}) };
let threw = false;
try { await runAdapters({ adapters: [boom], env: {}, spots, outDir: tmp, mock: false }); } catch { threw = true; }
ok(!threw, '공급원이 예외를 내도 실행이 멈추면 안 돼요');

// 모의 데이터는 앱 폴더가 아닌 곳에만 쓴다
const mockDir = mkdtempSync(join(tmpdir(), 'adpm-'));
await runAdapters({ spots, outDir: mockDir, mock: true });
ok(readdirSync(mockDir).length === ADAPTERS.length && !mockDir.includes('/app/data'), '모의 데이터는 앱 폴더 밖에만 써야 해요');

if (problems.length) { console.log(`❌ 문제 ${problems.length}건\n - ` + problems.join('\n - ')); process.exit(1); }
console.log('✅ 외부 공급원 규칙 이상 없음(승인 전 4곳은 호출·저장·표시하지 않음)');
