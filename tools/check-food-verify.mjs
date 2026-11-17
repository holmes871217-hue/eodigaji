// 유튜브 기반 맛집 검증 점검: 제작지원 영상 제외, 정보란 추출, 식별, 판정, 30일 규칙, 켜기 전에는 기존 동작 유지.
// 사용: node tools/check-food-verify.mjs   (문제가 있으면 종료 코드 1)
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
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

ok(!L.isSponsored({ snippet: { title: '또간집 EP.1', description: '[ 또간집 선서 ]\n✋🏻맛집 광고✋🏻 ✋🏻맛집 협찬✋🏻 ✋🏻맛집 비즈니스✋🏻 안 받겠습니다. 하지만.. 풍자가 쫌..\n00:00 오프닝' } }).yes, '"광고·협찬 안 받겠습니다"(또간집 선서)는 협찬 표시가 아니에요(실제 데이터에서 31편이 잘못 걸렸음)');
ok(L.isSponsored({ snippet: { title: '또간집', description: '[ 또간집 선서 ]\n맛집 광고 안 받겠습니다\n\n본 영상은 OO의 제작지원을 받아 제작되었습니다' } }).yes, '선서 줄이 있어도 별도의 제작지원 문구가 있으면 제외해야 해요');

for (const t of ['✋🏻맛집 광고✋🏻\n✋🏻맛집 협찬✋🏻\n✋🏻맛집 비즈니스✋🏻\n안 받겠습니다.', 'SNS 핫플, 광고 맛집 전부 제외. 오직 맛부심으로', '게스트 출연 문의 / 협찬 / 비즈니스\nsuze.official@studiosuze.co.kr', '이 영상은 제작지원을 받지 않았습니다']) ok(!L.isSponsored({ snippet: { title: '또간집', description: `맛집 소개\n${t}\n00:00 오프닝` } }).yes, `안내·선언 문구를 협찬으로 오인하면 안 돼요: ${t.slice(0, 20)}`);
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
      const all = { ok1: video('ok1', 'CH_OK', DESC), ad1: video('ad1', 'CH_OK', '📍 마지막식당 : 경기 수원시 팔달구 행궁로 99\n제작지원을 받아 촬영', {}), un1: video('un1', 'CH_NO', DESC) };
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

// ── 8) 전문 시리즈 채널(또간집): 추출·역할·점수·위험 신호 ──────────────────
{
  const d = ['오늘의 또간집!', '00:00 오프닝', '02:10 첫 번째 식당 - 맛있는집 (김해 장유)', '10:30 두번째 - 둘째국수', '25:00 최종 선정 - 셋째횟집', '40:12 🏆 또간집 1위 넷째한우', '55:00 엔딩', '구독 좋아요'].join('\n');
  const r = L.extractSeries(d, '김해시').items;
  const role = (n) => r.find((x) => x.name === n)?.role;
  ok(r.length === 4 && !r.some((x) => /오프닝|엔딩|구독/.test(x.name)), `오프닝·엔딩·구독 문구를 빼고 식당 4곳을 뽑아야 해요(${r.map((x) => x.name)})`);
  ok(role('맛있는집') === 'visited' && role('둘째국수') === 'visited', '표시가 없는 소개 식당은 방문·소개(visited)여야 해요');
  ok(role('셋째횟집') === 'final', '"최종 선정" 표시가 있으면 final 이어야 해요');
  ok(role('넷째한우') === 'winner', '1위 표시가 있으면 winner 여야 해요');
  ok(L.extractSeries('00:00 오프닝\n03:00 그냥 이야기\n구독', '').items.every((x) => x.role !== 'winner'), '1위 표시가 없으면 winner 로 추정하면 안 돼요');
  const now = Date.parse('2026-11-17');
  const win = L.contentScore([{ videoId: 'a', role: 'winner', publishedAt: '2026-05-01' }], undefined, now).score;
  const vis = L.contentScore([{ videoId: 'a', role: 'visited', publishedAt: '2026-05-01' }], undefined, now).score;
  const rep = L.contentScore([{ videoId: 'a', role: 'visited', publishedAt: '2026-05-01' }, { videoId: 'b', role: 'visited', publishedAt: '2026-06-01' }, { videoId: 'a', role: 'winner', publishedAt: '2026-05-01' }], undefined, now);
  ok(win > vis, '최종 1위는 일반 소개 식당보다 점수가 높아야 해요');
  ok(rep.episodes === 2 && rep.score > win, '여러 회차 반복 소개는 가산되고, 같은 영상은 한 번만 세야 해요');
  ok(L.contentScore([{ videoId: 'a', role: 'visited', publishedAt: '2020-01-01' }], undefined, now).parts.recent === 0, '24개월이 지난 이력에는 최근성 가산이 없어야 해요');
  ok(L.contentScore([{ videoId: 'a', role: 'visited', publishedAt: '2026-05-01' }], { visited: 9 }, now).parts.base === 9, '관리자가 가중치를 바꾸면 반영돼야 해요');
  ok(L.judge([{ videoId: 'a', channelId: 'A', role: 'mentioned' }], new Set(['A'])).reasons[0] === 'A2_MENTION_ONLY', '단순 언급만 있으면 통과하면 안 돼요');
  ok(L.judge([{ videoId: 'a', channelId: 'A', role: 'visited' }], new Set(['A']), { open: false }).reasons[0] === 'STATUS_CLOSED', '폐업이면 탈락이어야 해요');
  ok(L.judge([{ videoId: 'a', channelId: 'A', role: 'visited' }], new Set(['A']), { risk: { level: 'high' } }).reasons[0] === 'RISK_HIGH', '위험 신호가 높으면 보류해야 해요');
  ok(L.reviewRisk({ rating: undefined, count: 0 }).level === 'unknown', '평점이 없으면 위험 여부를 추측하지 않고 unknown 이어야 해요');
  ok(L.reviewRisk({ rating: 4.4, count: 900, reviews: [] }).level === 'unknown', '리뷰 표본이 없으면 none 으로 단정하지 않고 unknown 이어야 해요');
  const rv = (t, i, extra = '') => ({ publishTime: `2026-11-0${1 + (i % 2)}T00:00:00Z`, text: `맛있어요 ${t} 정말 좋았고 또 올게요 ${extra}` });
  ok(L.reviewRisk({ rating: 4.9, count: 80, reviews: [rv('a', 0), rv('a', 1), rv('a', 2), rv('a', 3)] }).level === 'high', '쏠린 시점·반복 문구·높은 평점 소수 리뷰가 겹치면 high 여야 해요');
  const ev = L.reviewRisk({ rating: 4.5, count: 500, reviews: [{ publishTime: '2026-01-01T00:00:00Z', text: '리뷰 작성 시 음료 서비스 제공 이벤트로 방문했어요' }, { publishTime: '2026-03-01T00:00:00Z', text: '체험단으로 제공받아 먹었습니다 잘 먹었어요' }, { publishTime: '2026-05-01T00:00:00Z', text: '평범한 한 끼였고 주차는 조금 불편했어요 그래도 괜찮았음' }] });
  ok(ev.level === 'watch' && ev.signals.includes('EVENT_WORDS'), '이벤트성 리뷰 2건은 위험 신호(watch)로만 분류해야 해요(허위 확정 금지)');
  ok(L.reviewRisk({ rating: 4.4, count: 900, reviews: [{ publishTime: '2026-01-01T00:00:00Z', text: '무난하게 맛있게 잘 먹었습니다 감사합니다 다음에도' }, { publishTime: '2026-04-01T00:00:00Z', text: '국물이 진하고 면이 쫄깃했어요 줄이 길었지만 만족' }, { publishTime: '2026-08-01T00:00:00Z', text: '가격 대비 양이 많고 직원분들이 친절하셨습니다' }] }).level === 'none', '신호가 없으면 none 이어야 해요');
  const rows = [
    { id: 'a', name: 'A', rating: 4.95, reviews: 3000, km: 0.2, p: 1 },
    { id: 'b', name: 'B', rating: 4.3, reviews: 150, km: 2, p: 5.5 },
    { id: 'c', name: 'C', rating: 4.5, reviews: 400, km: 1, p: 3 },
    { id: 'b', name: 'B', rating: 4.3, reviews: 150, km: 2, p: 5.5 }, { id: 'd', name: 'D', rating: 4.4, reviews: 200, km: 1, p: 2 }, { id: 'e', name: 'E', rating: 4.4, reviews: 200, km: 1, p: 2 }, { id: 'f', name: 'F', rating: 4.4, reviews: 200, km: 1, p: 2 },
  ];
  const top = N.rankEligible(rows);
  ok(top[0].id === 'b' && top[1].id === 'c', '평점이 가장 높아도 전문 콘텐츠 점수가 낮으면 뒤에 와야 해요');
  ok(top.length === 5 && new Set(top.map((x) => x.id)).size === 5, '최대 5곳이고 같은 식당은 한 번만 나와야 해요');
  ok(N.rankEligible(rows.slice(0, 2)).length === 2, '5곳이 안 되면 채우지 않고 그대로 보여 줘야 해요');
}

// ── 9) 시리즈 수집·매칭·최종 선정(가짜 네트워크, 임시 폴더) ───────────────────
{
  const root = mkdtempSync(`${tmpdir()}/fs-`);
  mkdirSync(`${root}/app/data`, { recursive: true });
  mkdirSync(`${root}/tools/food-verify/data`, { recursive: true });
  writeFileSync(`${root}/app/data/region-trends.json`, JSON.stringify({ regions: [{ key: '경남 김해시' }, { key: '경기 수원시' }] }));
  const dir = `${root}/tools/food-verify/`;
  const f = (n) => JSON.parse(readFileSync(`${dir}data/${n}`, 'utf8'));
  const NOW = Date.parse('2026-11-17T00:00:00Z');
  const chCfg = (id = '') => ({ approved: [{ key: 'ddagganjip', name: '스튜디오 수제 — 풍자의 또간집', handle: '@STUDIO_SUZE', expectTitle: '스튜디오 수제', titleFilter: '또간집|Repeat Restaurant', series: true, enabled: true, id, uploads: '', approvedAt: '2026-11-17' }] });
  writeFileSync(`${dir}data/channels.json`, JSON.stringify(chCfg()));
  writeFileSync(`${dir}config.json`, JSON.stringify({ collect: true, regionSearch: false, appEnabled: true }));
  const D1 = ['또간집 김해편', '00:00 오프닝', '02:10 첫 번째 식당 - 맛있는집 (김해)', '10:00 🏆 또간집 1위 둘째국수', '20:00 셋째횟집', '40:00 엔딩'].join('\n');
  const D2 = ['또간집 김해 2탄', '02:10 맛있는집', '12:00 마지막식당'].join('\n');
  const vids = {
    e1: { title: '풍자의 또간집 EP.1 김해', desc: D1, date: '2026-10-01T00:00:00Z' },
    e2: { title: 'Repeat Restaurant EP.2 Gimhae', desc: D2, date: '2026-10-20T00:00:00Z' },
    e3: { title: '풍자의 또간집 EP.3 협찬편', desc: '본 영상은 OO의 제작지원을 받아 제작되었습니다\n02:00 협찬식당', date: '2026-10-25T00:00:00Z', ppp: true },
    v1: { title: '풍자 브이로그', desc: '', date: '2026-10-26T00:00:00Z' },
  };
  const calls = {};
  const bump = (k) => { calls[k] = (calls[k] || 0) + 1; };
  const mk = (over = {}) => async (url, init) => {
    const u = new URL(url); const j = (o) => ({ ok: true, status: 200, json: async () => o });
    const last = u.pathname.split('/').pop();
    if (u.hostname === 'www.googleapis.com') bump(last);
    if (last === 'channels') return j({ items: [{ id: 'UC_SUZE', snippet: { title: over.channelTitle || '스튜디오 수제' }, contentDetails: { relatedPlaylists: { uploads: 'UU_SUZE' } } }] });
    if (last === 'playlistItems') return j({ items: Object.entries(vids).reverse().map(([id, v]) => ({ snippet: { title: v.title, resourceId: { videoId: id } } })) });
    if (last === 'videos') { const ids = u.searchParams.get('id').split(','); return j({ items: ids.map((id) => vids[id] && ({ id, snippet: { channelId: 'UC_SUZE', channelTitle: '스튜디오 수제', title: vids[id].title, description: vids[id].desc, publishedAt: vids[id].date }, statistics: { viewCount: '1234567', ...(over.noLikes ? {} : { likeCount: '4321' }) }, ...(vids[id].ppp ? { paidProductPlacementDetails: { hasPaidProductPlacement: true } } : {}) })).filter(Boolean) }); }
    if (u.hostname === 'dapi.kakao.com') {
      const q = u.searchParams.get('query');
      const P = (id, name, extra = {}) => ({ id, place_name: name, phone: '', address_name: '경남 김해시 장유동 1', road_address_name: '경남 김해시 장유로 1', x: '128.8', y: '35.2', ...extra });
      return j({ documents: /맛있는집/.test(q) ? [P('101', '맛있는집')] : /둘째국수/.test(q) ? [P('102', '둘째국수')] : /셋째횟집/.test(q) ? [P('103', '셋째횟집'), P('104', '셋째횟집', { address_name: '경남 김해시 내동 9', road_address_name: '경남 김해시 가야로 9' })] : /마지막식당/.test(q) ? [P('105', '마지막식당')] : [] });
    }
    if (u.hostname === 'places.googleapis.com') { bump('google'); return j({ places: /맛있는집/.test(JSON.parse(init.body).textQuery) ? [{ id: 'G1', displayName: { text: '맛있는집' }, formattedAddress: '경상남도 김해시 장유동', location: { latitude: 35.2, longitude: 128.8 }, businessStatus: 'OPERATIONAL', rating: 4.5, userRatingCount: 300 }] : [] }); }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const quiet = () => {};
  const env = { YOUTUBE_API_KEY: 'x', KAKAO_REST_KEY: 'k' };

  // (a) 채널 이름이 기대와 다르면 채널 ID 를 확정하지 않는다(추측 금지)
  let r = await run({ env, http: mk({ channelTitle: '전혀 다른 채널' }), now: NOW, dir, root, log: quiet });
  ok(f('channels.json').approved[0].id === '' && !existsSync(`${dir}data/series-videos.json`) || Object.keys(f('series-videos.json').videos).length === 0, '채널 이름이 다르면 채널 ID 를 채우거나 영상을 모으면 안 돼요');
  // (b) 정상: 채널 확정 → 또간집 제목 영상만 수집, 협찬 영상은 설명 없이 표시만
  r = await run({ env, http: mk(), now: NOW, dir, root, log: quiet });
  ok(f('channels.json').approved[0].id === 'UC_SUZE', '이름이 맞으면 핸들로 조회한 채널 ID 가 저장돼야 해요');
  const sv = f('series-videos.json').videos;
  ok(sv.e1 && sv.e2 && !sv.v1, '또간집 제목 영상만 수집해야 해요(브이로그 제외)');
  ok(sv.e1.title && sv.e1.url === 'https://www.youtube.com/watch?v=e1' && sv.e1.viewCount === 1234567 && sv.e1.likeCount === 4321 && sv.e1.publishedAt && sv.e1.channelId === 'UC_SUZE' && sv.e1.description, '제목·URL·조회수·좋아요·게시일·채널·설명을 저장해야 해요');
  ok(sv.e3.sponsored === true && !sv.e3.description, '제작지원 영상은 표시만 하고 설명은 저장하면 안 돼요');
  const ex = f('extractions.json');
  ok(!ex.e3, '제작지원 영상에서는 식당을 뽑으면 안 돼요');
  ok(ex.e1.items.some((i) => i.name === '둘째국수' && i.role === 'winner' && i.match.level === 'linked') && ex.e1.items.some((i) => i.name === '맛있는집' && i.role === 'visited'), '영상별 식당·역할·매칭 결과가 저장돼야 해요');
  ok(ex.e1.items.find((i) => i.name === '셋째횟집').match.level === 'ambiguous', '같은 이름 지점이 여러 곳이면 자동 확정하지 말고 검수 대상으로 둬야 해요');
  ok(r.items.map((i) => i.k).join() === '102,101', `통과 식당은 1위(102)가 먼저, 그다음 반복 소개(101)여야 해요(${r.items.map((i) => `${i.k}:${i.p}`)})`);
  if (process.env.DBG) console.log(JSON.stringify(f('extractions.json').e2), JSON.stringify(f('series-videos.json').videos.e2).slice(0,200));
  ok(r.items.find((i) => i.k === '101').p === 3 && r.items.find((i) => i.k === '102').p === 5.5, `점수: 1위 5+0.5, 두 회차 소개 1+1.5+0.5 여야 해요(${r.items.map((i) => `${i.k}:${i.p}`)})`);
  ok(!r.items.some((i) => ['103', '104', '105'].includes(i.k)), '모호한 지점(103·104)과 협찬 영상 식당은 추천에 들어가면 안 돼요');
  ok(f('review-queue.json').some((q) => q.name === '셋째횟집' && q.kind === 'series'), '모호한 후보는 검수 큐에 있어야 해요');
  ok(r.items.length === new Set(r.items.map((i) => i.k)).size, '같은 식당이 중복으로 들어가면 안 돼요');
  // (c) 두 번째 실행: 이미 받은 영상은 다시 받지도, 다시 처리하지도 않는다
  for (const k of Object.keys(calls)) delete calls[k];
  const before = JSON.stringify(f('extractions.json'));
  await run({ env, http: mk(), now: NOW + 3600000, dir, root, log: quiet });
  ok(!calls.videos, `변경 없는 영상은 videos.list 를 다시 부르면 안 돼요(${calls.videos})`);
  ok(JSON.stringify(f('extractions.json')) === before, '설명이 같으면 추출·매칭을 다시 하면 안 돼요');
  // (d) 25일 뒤에는 갱신하고, 설명이 바뀌면 다시 추출한다
  vids.e2.desc = ['또간집 김해 2탄', '02:10 맛있는집', '12:00 마지막식당', '30:00 최종 선정 - 둘째국수'].join('\n');
  r = await run({ env, http: mk(), now: NOW + 26 * 86400000, dir, root, log: process.env.DBG ? console.log : quiet });
  ok(f('extractions.json').e2.items.some((i) => i.name === '둘째국수' && i.role === 'final'), '설명이 바뀐 영상은 다시 추출해야 해요');
  // (e) 영상이 사라지면 지우고, 그 영상에만 의존한 식당은 빠진다
  delete vids.e1; delete vids.e2;
  r = await run({ env, http: mk(), now: NOW + 52 * 86400000, dir, root, log: quiet });
  ok(!f('series-videos.json').videos.e1 && r.items.length === 0, '사라진 영상은 지우고 그에 의존한 식당도 빠져야 해요');
  // (f) 구글 서버 키가 있으면 구글 업체 ID 로 매칭하고 g 를 남긴다
  vids.e1 = { title: '풍자의 또간집 EP.1 김해', desc: D1, date: '2026-10-01T00:00:00Z' };
  rmSync(`${dir}data/series-videos.json`); rmSync(`${dir}data/extractions.json`); rmSync(`${dir}data/restaurants.json`);
  r = await run({ env: { ...env, GOOGLE_PLACES_SERVER_KEY: 'g' }, http: mk(), now: NOW, dir, root, log: quiet });
  const gi = r.items.find((i) => i.g === 'G1');
  ok(gi && gi.k === 'g:G1', `구글 업체로 매칭되면 장소 ID(g)가 남아야 해요(${JSON.stringify(r.items)})`);
  ok(!JSON.stringify(f('restaurants.json')).includes('formattedAddress') && !/경상남도 김해시 장유동/.test(JSON.stringify(f('restaurants.json'))), '구글 업체의 주소·상호 원문은 저장하면 안 돼요(장소 ID·좌표만)');
  // (g) 검증 스위치: 키 없이는 아무 것도 호출하지 않는다
  for (const k of Object.keys(calls)) delete calls[k];
  await run({ env: {}, http: mk(), now: NOW, dir, root, log: quiet });
  ok(Object.keys(calls).length === 0, 'YOUTUBE_API_KEY 가 없는데 호출했어요');
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
