// .env 에 넣은 API 키가 실제로 동작하는지 확인한다.
// 실행: node tools/check-keys.mjs
// 키 값은 화면에 절대 출력하지 않고, 결과(성공/실패와 이유)만 보여 준다.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const envPath = fileURLToPath(new URL('../.env', import.meta.url));
const env = {};
try {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {
  console.log('.env 파일을 찾지 못했어요.');
  process.exit(1);
}

const ymd = (d) => d.toISOString().slice(0, 10);
const today = new Date();

async function check(name, keys, run) {
  const missing = keys.filter((k) => !env[k]);
  if (missing.length) {
    console.log(`- ${name}: 아직 비어 있음 (${missing.join(', ')})`);
    return;
  }
  try {
    const msg = await run();
    console.log(`O ${name}: 정상 (${msg})`);
  } catch (e) {
    console.log(`X ${name}: 실패 — ${String(e.message || e).slice(0, 160)}`);
  }
}

async function getJson(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${text.replace(/\s+/g, ' ').slice(0, 120)}`);
  try {
    return JSON.parse(text);
  } catch {
    // 공공데이터포털은 키 오류일 때 JSON 대신 XML 오류 문서를 돌려준다.
    throw new Error(text.replace(/\s+/g, ' ').slice(0, 140));
  }
}

await check('공공데이터포털 · 한국관광공사 행사정보', ['DATA_GO_KR_KEY'], async () => {
  const q = new URLSearchParams({
    serviceKey: env.DATA_GO_KR_KEY,
    MobileOS: 'ETC',
    MobileApp: 'eodigaji',
    _type: 'json',
    eventStartDate: ymd(today).replace(/-/g, ''),
    numOfRows: '1',
    pageNo: '1',
  });
  const j = await getJson(`https://apis.data.go.kr/B551011/KorService2/searchFestival2?${q}`);
  const head = j?.response?.header;
  if (head && head.resultCode !== '0000') throw new Error(`${head.resultCode} ${head.resultMsg}`);
  return `행사 ${j?.response?.body?.totalCount ?? '?'}건 조회됨`;
});

// 네이버 검색·데이터랩은 2026-06-25부터 NAVER API HUB(네이버 클라우드 플랫폼)로 옮겨짐.
// 주소와 인증 헤더: https://api.ncloud-docs.com/docs/naver-api-hub-search-trend
// 콘솔의 [인증 정보]에 나오는 Client ID → NAVER_API_KEY_ID, Client Secret → NAVER_API_KEY.
// 블로그 검색 주소는 이관 가이드의 뉴스 검색(/search/v1/news) 형식에 맞춘 추정값이다.
const naverHeaders = () => ({
  'X-NCP-APIGW-API-KEY-ID': env.NAVER_API_KEY_ID,
  'X-NCP-APIGW-API-KEY': env.NAVER_API_KEY,
});

await check('네이버 블로그 검색 (NAVER API HUB, 선택)', ['NAVER_API_KEY_ID', 'NAVER_API_KEY'], async () => {
  const j = await getJson(`https://naverapihub.apigw.ntruss.com/search/v1/blog?query=${encodeURIComponent('해방촌 신흥시장')}&display=1`, {
    headers: naverHeaders(),
  });
  return `블로그 글 ${j.total}건`;
});

await check('네이버 검색어 트렌드 (NAVER API HUB, 선택)', ['NAVER_API_KEY_ID', 'NAVER_API_KEY'], async () => {
  const start = new Date(today);
  start.setMonth(start.getMonth() - 3);
  const j = await getJson('https://naverapihub.apigw.ntruss.com/search-trend/v1/search', {
    method: 'POST',
    headers: { ...naverHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startDate: ymd(start),
      endDate: ymd(today),
      timeUnit: 'month',
      keywordGroups: [{ groupName: '에버랜드', keywords: ['에버랜드'] }],
      gender: 'm',
      ages: ['6'],
    }),
  });
  return `기간 ${j.results?.[0]?.data?.length ?? 0}개월치 받음`;
});

const kakaoHeaders = () => ({ Authorization: `KakaoAK ${env.KAKAO_REST_KEY}` });

await check('카카오 로컬(주변 장소 검색)', ['KAKAO_REST_KEY'], async () => {
  const j = await getJson(`https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent('신흥시장')}&x=126.986&y=37.544&radius=2000&size=1`, {
    headers: kakaoHeaders(),
  });
  return `"${j.documents?.[0]?.place_name ?? '결과 없음'}" 찾음`;
});

await check('카카오모빌리티(자동차 길찾기)', ['KAKAO_REST_KEY'], async () => {
  const j = await getJson('https://apis-navi.kakaomobility.com/v1/directions?origin=126.986,37.544&destination=127.2026,37.2939', {
    headers: kakaoHeaders(),
  });
  const s = j.routes?.[0]?.summary;
  if (!s) throw new Error(j.routes?.[0]?.result_msg || '경로 없음');
  return `해방촌→에버랜드 약 ${Math.round(s.duration / 60)}분`;
});

console.log(env.KAKAO_JS_KEY
  ? '- 카카오 JavaScript 키: 입력됨 (지도 화면에서 따로 확인 예정)'
  : '- 카카오 JavaScript 키: 아직 비어 있음 (KAKAO_JS_KEY)');
