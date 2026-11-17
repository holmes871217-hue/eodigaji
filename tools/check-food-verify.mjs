// 유튜브 기반 맛집 검증 점검: 제작지원 영상 제외, 정보란 추출, 식별, 판정, 30일 규칙, 켜기 전에는 기존 동작 유지.
// 사용: node tools/check-food-verify.mjs   (문제가 있으면 종료 코드 1)
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import * as L from './food-verify/lib.mjs';
import { run } from './food-verify/run.mjs';
import * as N from '../app/js/core/nearby.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const problems = [];
const ok = (c, m) => { if (!c) problems.push(m); };

// 1) 제작지원·광고 제외
ok(L.isSponsored({ snippet: { title: '수원 맛집', description: '' }, paidProductPlacementDetails: { hasPaidProductPlacement: true } }).yes, '유료 제품 노출 표시가 true 면 제외해야 해요');
for (const w of ['본 영상은 OO의 제작지원을 받아', '업체로부터 협찬', '#광고', '유료 광고 포함', '소정의 원고료를 받고', '#AD', '식사를 제공받아 촬영']) {
  ok(L.isSponsored({ snippet: { title: 't', description: w } }).yes, `"${w}" 는 제작지원·광고로 걸러야 해요`);
}
ok(!L.isSponsored({ snippet: { title: '수원 갈비 맛집', description: '내돈내산입니다. 광고 아님, 협찬 없음' } }).yes, '"광고 아님·협찬 없음" 같은 부정 표현은 제외하면 안 돼요');
ok(!L.isSponsored({ snippet: { title: '수원 갈비 맛집', description: '📍 맛있는집 : 경기 수원시 팔달구 행궁로 12' }, paidProductPlacementDetails: { hasPaidProductPlacement: false } }).yes, '평범한 영상은 제외하면 안 돼요');

// 2) 정보란 추출
const desc = [
  '오늘은 수원 갈비 맛집!', '',
  '📍 맛있는집 : 경기 수원시 팔달구 행궁로 12',
  '☎ 031-123-4567',
  '📍 둘째식당 (서울 마포구 와우산로21길 5)',
  '상호명: 셋째 국수',
  '주소: 경기 수원시 영통구 월드컵로 206',
  '구독 좋아요 알림설정 부탁드려요',
  '제휴 문의: biz@example.com',
].join('\n');
const ex = L.extractRestaurants(desc, '수원시');
ok(ex.items.length === 3 && !ex.listOnly, `식당 3곳을 뽑아야 해요(${ex.items.length}: ${ex.items.map((i) => i.name).join(',')})`);
ok(ex.items[0]?.name === '맛있는집' && ex.items[0].phone === '031-123-4567' && /수원시/.test(ex.items[0].addr), '첫 식당의 이름·전화·주소를 정확히 뽑아야 해요');
ok(ex.items[2]?.name === '셋째 국수' && /영통구/.test(ex.items[2].addr), '"상호명:" 라벨과 이어지는 "주소:" 줄을 연결해야 해요');
ok(!ex.items.some((i) => /구독|제휴|문의/.test(i.name)), '구독·제휴 문구를 식당으로 오인하면 안 돼요');
ok(L.extractRestaurants('맛집 소개\n구독 부탁드려요', '').items.length === 0, '식당 정보가 없는 설명에서는 아무것도 지어내지 않아야 해요');
ok(L.extractRestaurants(Array.from({ length: 15 }, (_, i) => `📍 식당${i}번 : 서울 강남구 테헤란로 ${i + 1}`).join('\n'), '').listOnly, '12곳을 넘게 나열한 영상은 나열형으로 제외해야 해요');
ok(L.extractRestaurants('📍 이름만있는집', '').items.length === 0, '지역·주소·전화 근거가 하나도 없으면 후보로 만들면 안 돼요');
ok(L.extractRestaurants('📍 이름만있는집', '수원시').items.length === 1, '영상이 검색된 지역이 있으면 근거로 인정해야 해요');

// 3) 식별
const pl = (o) => ({ id: '1', place_name: '맛있는집 수원본점', phone: '031-123-4567', address_name: '경기 수원시 팔달구 매산로1가 1', road_address_name: '경기 수원시 팔달구 행궁로 12', ...o });
ok(L.pickPlace({ name: '맛있는집', addr: '경기 수원시 팔달구 행궁로 12', phone: '' }, [pl()]).level === 'linked', '이름·도로명이 맞으면 자동 연결해야 해요');
ok(L.pickPlace({ name: '맛있는집', addr: '', phone: '031-123-4567' }, [pl()]).level === 'linked', '이름·전화가 맞으면 자동 연결해야 해요');
ok(L.pickPlace({ name: '맛있는집', addr: '', phone: '' }, [pl()]).level === 'ambiguous', '이름만 맞으면 자동 연결하지 말고 검수로 보내야 해요');
ok(L.pickPlace({ name: '맛있는집', addr: '경기 수원시 팔달구 행궁로 12', phone: '' }, [pl({ id: '1' }), pl({ id: '2', phone: '031-999-0000' })]).level === 'ambiguous', '같은 근거로 두 곳이 맞으면 검수로 보내야 해요');
ok(L.pickPlace({ name: '다른식당', addr: '경기 수원시', phone: '' }, [pl()]).level === 'none', '이름이 다르면 연결하지 않아야 해요');

// 4) 판정
const refs = (...ch) => ch.map((c, i) => ({ videoId: `v${i}`, channelId: c, publishedAt: '2026-10-01' }));
ok(L.judge(refs('A'), new Set(['B'])).status === 'rejected', '승인되지 않은 채널만 추천하면 탈락이어야 해요');
ok(L.judge(refs('A'), new Set(['A'])).status === 'eligible', '승인 채널 추천이 있으면 통과해야 해요');
ok(L.judge(refs('A', 'A', 'A'), new Set(['A']), { minChannels: 2 }).status === 'rejected', '같은 채널의 반복 소개는 독립 추천 1로만 세야 해요');
ok(L.judge(refs('A', 'B'), new Set(['A', 'B']), { minChannels: 2 }).status === 'eligible', '서로 다른 두 채널이면 기준 2를 통과해야 해요');
ok(L.judge(refs('A'), new Set(['A']), { override: 'reject' }).status === 'rejected', '관리자 거절이 우선해야 해요');

// 5) 방문자 평가 기준: 평가 정보 부족은 통과 불가, 앱·도구의 기준이 같아야 함
ok(!L.passesRating(null, 0) && !L.passesRating(4.9, 10) && !L.passesRating(4.0, 500) && L.passesRating(4.5, 300), '평점 기준 동작이 이상해요');
ok(JSON.stringify(L.RATING_RULE) === JSON.stringify(N.RATING_RULE), 'tools 와 app 의 평점 기준이 달라요(두 곳을 같이 고쳐야 해요)');
ok(!N.passesRating(undefined, undefined) && N.passesRating(4.5, 300) === L.passesRating(4.5, 300), '앱의 평점 판정이 도구와 달라요');
ok(N.sameEligible({ name: '맛있는집 수원본점 Matitneun', lat: 37.2, lng: 127.0 }, { n: '맛있는집', lat: 37.2005, lng: 127.0 }), '같은 가게(이름 포함·가까움)는 일치해야 해요');
ok(!N.sameEligible({ name: '맛있는집', lat: 37.3, lng: 127.0 }, { n: '맛있는집', lat: 37.2, lng: 127.0 }), '이름이 같아도 멀면 다른 가게예요');

// 6) 실행기 시험(임시 폴더, 가짜 네트워크)
{
  const root = mkdtempSync(`${tmpdir()}/fv-`);
  mkdirSync(`${root}/app/data`, { recursive: true });
  mkdirSync(`${root}/tools/food-verify/data`, { recursive: true });
  writeFileSync(`${root}/app/data/region-trends.json`, JSON.stringify({ regions: [{ key: '경기 수원시' }, { key: '경기 성남시' }] }));
  const dir = `${root}/tools/food-verify/`;
  const files = (name) => JSON.parse(readFileSync(`${dir}data/${name}`, 'utf8'));
  let calls = 0;
  const NOW = Date.parse('2026-11-17T00:00:00Z');
  const video = (id, ch, desc, extra = {}) => ({ id, snippet: { channelId: ch, channelTitle: ch, title: '수원 맛집', description: desc, publishedAt: '2026-10-01T00:00:00Z' }, ...extra });
  const DESC = '📍 맛있는집 : 경기 수원시 팔달구 행궁로 12\n☎ 031-123-4567';
  const http = async (url) => {
    calls++;
    const u = new URL(url);
    const json = (o) => ({ ok: true, status: 200, json: async () => o });
    if (u.pathname.endsWith('/search')) return json({ items: [{ id: { videoId: 'ok1' } }, { id: { videoId: 'ad1' } }, { id: { videoId: 'un1' } }] });
    if (u.pathname.endsWith('/videos')) {
      const ids = u.searchParams.get('id').split(',');
      const all = { ok1: video('ok1', 'CH_OK', DESC), ad1: video('ad1', 'CH_OK', '📍 광고식당 : 경기 수원시 팔달구 행궁로 99\n제작지원을 받아 촬영', {}), un1: video('un1', 'CH_NO', DESC) };
      all.ad1.paidProductPlacementDetails = { hasPaidProductPlacement: true };
      return json({ items: ids.map((i) => all[i]).filter(Boolean) });
    }
    if (u.hostname === 'dapi.kakao.com') {
      const q = u.searchParams.get('query');
      return json({ documents: /맛있는집/.test(q) ? [{ id: '777', place_name: '맛있는집 수원본점', phone: '031-123-4567', address_name: '경기 수원시 팔달구 매산로1가 1', road_address_name: '경기 수원시 팔달구 행궁로 12', x: '127.01', y: '37.28' }] : [] });
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const quiet = () => {};
  // (a) 꺼져 있으면 네트워크를 건드리지 않는다
  await run({ env: { YOUTUBE_API_KEY: 'x', KAKAO_REST_KEY: 'k' }, http, now: NOW, dir, root, log: quiet });
  ok(calls === 0, '수집 스위치가 꺼져 있는데 네트워크를 호출했어요');
  ok(JSON.parse(readFileSync(`${root}/app/data/food-eligible.json`, 'utf8')).status === 'off', '꺼져 있으면 food-eligible.json 은 off 여야 해요');
  // (b) 키가 없으면 켜도 호출하지 않는다
  writeFileSync(`${dir}config.json`, JSON.stringify({ collect: true, appEnabled: true, searchesPerRun: 2 }));
  await run({ env: {}, http, now: NOW, dir, root, log: quiet });
  ok(calls === 0, 'YOUTUBE_API_KEY 가 없는데 호출했어요');
  // (c) 승인 채널이 없으면: 호출은 하지만 통과 식당 0, 앱 off, 후보 채널만 기록
  const env = { YOUTUBE_API_KEY: 'x', KAKAO_REST_KEY: 'k' };
  let r = await run({ env, http, now: NOW, dir, root, log: quiet });
  ok(r.items.length === 0 && r.status === 'off', '승인 채널이 없으면 통과 식당이 0이고 앱은 off 여야 해요');
  ok(files('suggestions.json').channels.CH_OK && files('suggestions.json').channels.CH_NO, '미승인 채널은 승인 후보 목록에 남아야 해요');
  // (d) 승인 채널 등록 → 제작지원 영상은 빠지고 일반 영상만 통과, 미승인 채널은 제외
  writeFileSync(`${dir}data/channels.json`, JSON.stringify({ approved: [{ id: 'CH_OK', name: '시험채널', approvedAt: '2026-11-17' }] }));
  writeFileSync(`${dir}data/state.json`, JSON.stringify({ cursor: 0 }));
  r = await run({ env, http, now: NOW, dir, root, log: quiet });
  ok(r.items.length === 1 && r.items[0].k === '777', `승인 채널의 일반 영상 식당 1곳만 통과해야 해요(${JSON.stringify(r.items)})`);
  ok(r.out.dropped.sponsored >= 1, '제작지원 영상을 버려야 해요');
  const store = files('candidates.json');
  ok(!store.videos.ad1, '제작지원 영상은 저장하면 안 돼요');
  ok(!JSON.stringify(store).includes('제작지원') && !JSON.stringify(store).includes('구독'), '영상 설명 전문을 저장하면 안 돼요(식당 정보만)');
  ok(r.status === 'on', '앱 반영 스위치가 켜져 있고 통과 식당이 있으면 on 이어야 해요');
  // (e) 앱 반영 스위치가 꺼져 있으면 통과 식당이 있어도 off
  writeFileSync(`${dir}config.json`, JSON.stringify({ collect: true, appEnabled: false, searchesPerRun: 2 }));
  r = await run({ env, http, now: NOW, dir, root, log: quiet });
  ok(r.status === 'off', 'appEnabled=false 면 off 여야 해요');
  // (f) 30일 규칙: 26일 뒤에는 다시 받고, 영상이 없어지면 지운다
  const gone = async (url) => { const u = new URL(url); if (u.pathname.endsWith('/videos')) return { ok: true, status: 200, json: async () => ({ items: [] }) }; if (u.pathname.endsWith('/search')) return { ok: true, status: 200, json: async () => ({ items: [] }) }; return http(url); };
  r = await run({ env, http: gone, now: NOW + 26 * 86400000, dir, root, log: quiet });
  ok(!files('candidates.json').videos.ok1 && r.items.length === 0, '26일 뒤 갱신에서 영상이 없어졌으면 지우고 식당도 빠져야 해요');
  // (g) 30일 넘게 갱신 못 한 정보는 쓰지 않는다
  writeFileSync(`${dir}data/candidates.json`, JSON.stringify({ videos: { old1: { channelId: 'CH_OK', publishedAt: '', fetchedAt: NOW - 40 * 86400000, region: '경기 수원시', items: [{ name: '맛있는집', addr: '', phone: '', kakaoId: '', place: { level: 'linked', key: '777', name: '맛있는집', lat: 37, lng: 127 } }] } } }));
  writeFileSync(`${dir}config.json`, JSON.stringify({ collect: false, appEnabled: true }));
  r = await run({ env: {}, http, now: NOW, dir, root, log: quiet });
  ok(r.items.length === 0, '30일 넘게 갱신하지 못한 영상 정보로 식당을 통과시키면 안 돼요');
}

// 7) 저장소의 실제 설정: 승인·키가 확인되기 전에는 꺼져 있어야 한다
{
  const cfg = JSON.parse(readFileSync(`${ROOT}tools/food-verify/config.json`, 'utf8'));
  const elig = JSON.parse(readFileSync(`${ROOT}app/data/food-eligible.json`, 'utf8'));
  ok(['on', 'off'].includes(elig.status), 'food-eligible.json status 는 on/off 여야 해요');
  if (!cfg.appEnabled) ok(elig.status === 'off', 'appEnabled=false 인데 food-eligible.json 이 on 이에요(앱이 맛집을 거르게 돼요)');
  if (elig.status === 'on') ok(elig.items.length > 0, 'on 인데 통과 식당이 0곳이에요(모든 곳에서 맛집이 사라져요)');
  const ch = JSON.parse(readFileSync(`${ROOT}tools/food-verify/data/channels.json`, 'utf8'));
  if (cfg.appEnabled) ok(ch.approved.length > 0, '승인 채널이 없는데 앱 반영이 켜져 있어요');
}

if (problems.length) { console.log(`❌ 문제 ${problems.length}건\n - ` + problems.join('\n - ')); process.exit(1); }
console.log('✅ 유튜브 기반 맛집 검증 규칙 이상 없음');
