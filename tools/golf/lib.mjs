// 골프 수집기 공통 규칙(순수 함수만 둔다 → tools/check-golf.mjs 가 점검한다).

/** HTML 특수문자(&#40; 등)를 글자로 되돌린다. */
export function unescapeHtml(s) {
  return String(s ?? '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
}

/**
 * 골프장 이름 비교용 열쇠. 플랫폼마다 붙이는 꼬리표(P)(퍼)(퍼9)·CC·골프클럽 등을 떼고 공백을 없앤다.
 * 예: "화성(P)" → "화성", "블루원용인(퍼)" → "블루원용인", "포웰(안성)cc" → "포웰안성"
 */
export function nameKey(s) {
  let t = unescapeHtml(s).toLowerCase();
  t = t.replace(/\((p|퍼|퍼9|퍼블릭|대중제|회원제|비공개)\)/g, '');
  t = t.replace(/[-\s]?(퍼9|퍼블릭|퍼)$/g, '');
  t = t.replace(/(컨트리클럽|골프클럽|골프앤리조트|골프리조트|골프장|골프&리조트|country ?club|golf ?club|cc|gc)$/g, '');
  t = t.replace(/[()\s·.&\-_/]/g, '');
  return t;
}

/** 골팡 이름이 "여주(비공개)"처럼 골프장을 감춘 경우 */
export const isHiddenName = (s) => /비공개/.test(String(s || ''));

/** 골팡 부킹표 HTML → 행 배열. 칸 순서: 지역, 부킹일, 티타임, 포함, 골프장, 홀수, -, 그린피, 판매자, 캐디, 구분, 조회 */
export function parseGolfpangRows(html) {
  const out = [];
  const re = /<tr id="tr_(\d+)"([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = re.exec(html))) {
    const tds = [...m[2].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => unescapeHtml(x[1].replace(/<[^>]+>/g, ' ')));
    if (tds.length < 11) continue;
    const price = Number(String(tds[7]).replace(/[^\d]/g, ''));
    if (!price) continue;
    out.push({ id: m[1], region: tds[0], time: tds[2], incl: tds[3], name: tds[4], holes: tds[5], price, caddie: tds[9], kind: tds[10] });
  }
  return out;
}

/** 골팡 "총 N 개 타임" */
export function golfpangTotal(html) {
  const m = /총\s*<strong>\s*([\d,]+)\s*<\/strong>/.exec(html);
  return m ? Number(m[1].replace(/,/g, '')) : 0;
}

/**
 * 1인 총비용 = 1인 그린피 + 카트비÷4 + 캐디피÷4 (카트·캐디피는 팀(4인) 요금을 4인 기준으로 나눈다).
 * 같은 기준으로 비교하려고, 카트비가 이미 포함된 상품(cartIncluded)이면 더하지 않고,
 * 골프장 카트·캐디피를 모르면 같은 지역 골프장들의 중간값(est*)으로 "예상 포함가"를 만든다(estimated 에 표시).
 * 노캐디 티타임이면 캐디피는 0원이다.
 */
export function perPersonCost(greenFee, cartFee, caddieFee, { noCaddie = false, cartIncluded = false, estCart = 0, estCaddie = 0 } = {}) {
  const g = Number(greenFee) || 0;
  const estimated = [];
  let cart = cartIncluded ? 0 : Number(cartFee) || 0;
  if (!cartIncluded && !cart && estCart) { cart = estCart; estimated.push('카트비'); }
  let caddie = noCaddie ? 0 : Number(caddieFee) || 0;
  if (!noCaddie && !caddie && estCaddie) { caddie = estCaddie; estimated.push('캐디피'); }
  const missing = [];
  if (!cartIncluded && !cart) missing.push('카트비');
  if (!noCaddie && !caddie) missing.push('캐디피');
  const total = Math.round(g + cart / 4 + caddie / 4);
  return { green: g, cart: cart ? Math.round(cart / 4) : null, caddie: caddie ? Math.round(caddie / 4) : null, noCaddie: noCaddie || undefined, cartIncluded: cartIncluded || undefined, estimated: estimated.length ? estimated : undefined, total, complete: missing.length === 0 && !estimated.length, missing };
}

/** 파3(숏게임) 골프장인지: 18홀 정규 코스와 비교되지 않아 검색에서 뺀다 */
export const isPar3 = (name) => /파\s*3|par\s*3|숏\s*코스|숏게임/i.test(String(name || ''));

/** 상품 설명에 카트비 포함이 적혀 있는지 */
export const cartIncludedText = (s) => /카트\s*(비|피)?\s*포함|카트포함|카캐비\s*포함|그린피\s*\+\s*카트/.test(String(s || ''));

/** 값 목록의 중간값 */
export function median(arr) {
  const a = arr.filter((x) => x > 0).sort((x, y) => x - y);
  if (!a.length) return 0;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
}

export function haversineKm(a, b) {
  const R = 6371;
  const toR = (d) => (d * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat);
  const dLng = toR(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** 다음 토요일 06:00(한국 시간)을 카카오 미래 길찾기 형식(YYYYMMDDHHMM)으로 */
export function nextSaturday0600(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 3600e3);
  const dow = kst.getUTCDay();
  let add = (6 - dow + 7) % 7;
  if (add === 0) add = 7;
  const d = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() + add));
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}0600`;
}

/** 해외 상품 제목·지역 → 도착 공항. 표에 없는 곳은 null(항공 정보 확인 불가로 표시). */
export const CITY_AIRPORTS = [
  { kw: ['미야코지마'], city: '미야코지마', country: '일본', iata: 'MMY', airport: null },
  { kw: ['남경', '난징'], city: '난징', country: '중국', iata: 'NKG', airport: null },
  { kw: ['오키나와'], city: '오키나와', country: '일본', iata: 'OKA', airport: null },
  { kw: ['하이난', '해남도', '하이커우'], city: '하이난', country: '중국', iata: 'HAK', airport: null },
  { kw: ['하이퐁', '하롱'], city: '하이퐁', country: '베트남', iata: 'HPH', airport: null },
  { kw: ['바탐'], city: '바탐', country: '인도네시아', iata: 'BTH', airport: null },
  { kw: ['후에'], city: '후에', country: '베트남', iata: 'HUI', airport: null },
  { kw: ['오카야마'], city: '오카야마', country: '일본', iata: 'OKJ', airport: null },
  { kw: ['푸저우', '복주', '푸조우'], city: '푸저우', country: '중국', iata: 'FOC', airport: null },
  { kw: ['자카르타'], city: '자카르타', country: '인도네시아', iata: 'CGK', airport: null },
  { kw: ['제남'], city: '지난(제남)', country: '중국', iata: 'TNA', airport: null },
  { kw: ['야마구치', '우베'], city: '야마구치', country: '일본', iata: 'UBJ', airport: null },
  { kw: ['다카마쓰', '다카마츠'], city: '다카마쓰', country: '일본', iata: 'TAK', airport: null },
  { kw: ['시즈오카'], city: '시즈오카', country: '일본', iata: 'FSZ', airport: null },
  { kw: ['뱃부', '벳부', '오이타'], city: '오이타', country: '일본', iata: 'OIT', airport: null },
  { kw: ['치앙마이'], city: '치앙마이', country: '태국', iata: 'CNX', airport: { lat: 18.7668, lng: 98.9626 } },
  { kw: ['방콕', '파타야', '후아힌', '아유타야', '카오야이'], city: '방콕', country: '태국', iata: 'BKK', airport: { lat: 13.69, lng: 100.7501 } },
  { kw: ['세부'], city: '세부', country: '필리핀', iata: 'CEB', airport: { lat: 10.3075, lng: 123.9794 } },
  { kw: ['클락'], city: '클락', country: '필리핀', iata: 'CRK', airport: { lat: 15.186, lng: 120.5603 } },
  { kw: ['마닐라'], city: '마닐라', country: '필리핀', iata: 'MNL', airport: { lat: 14.5086, lng: 121.0198 } },
  { kw: ['코타'], city: '코타키나발루', country: '말레이시아', iata: 'BKI', airport: { lat: 5.9372, lng: 116.0515 } },
  { kw: ['쿠알라룸푸르'], city: '쿠알라룸푸르', country: '말레이시아', iata: 'KUL', airport: { lat: 2.7456, lng: 101.7072 } },
  { kw: ['조호바루'], city: '조호바루', country: '말레이시아', iata: 'JHB', airport: { lat: 1.6413, lng: 103.6697 } },
  { kw: ['비엔티안', '라오스'], city: '비엔티안', country: '라오스', iata: 'VTE', airport: { lat: 17.9883, lng: 102.5633 } },
  { kw: ['하노이'], city: '하노이', country: '베트남', iata: 'HAN', airport: { lat: 21.2212, lng: 105.8072 } },
  { kw: ['나트랑', '나짱'], city: '나트랑', country: '베트남', iata: 'CXR', airport: { lat: 11.9982, lng: 109.2194 } },
  { kw: ['다낭', '호이안'], city: '다낭', country: '베트남', iata: 'DAD', airport: { lat: 16.0439, lng: 108.1992 } },
  { kw: ['호치민'], city: '호치민', country: '베트남', iata: 'SGN', airport: { lat: 10.8188, lng: 106.6519 } },
  { kw: ['가고시마'], city: '가고시마', country: '일본', iata: 'KOJ', airport: { lat: 31.8034, lng: 130.7194 } },
  { kw: ['미야자키'], city: '미야자키', country: '일본', iata: 'KMI', airport: { lat: 31.8772, lng: 131.4486 } },
  { kw: ['후쿠오카'], city: '후쿠오카', country: '일본', iata: 'FUK', airport: { lat: 33.5859, lng: 130.4507 } },
  { kw: ['사가'], city: '사가', country: '일본', iata: 'HSG', airport: { lat: 33.1497, lng: 130.3022 } },
  { kw: ['기타큐슈', '시모노세키', '간몬'], city: '기타큐슈', country: '일본', iata: 'KKJ', airport: { lat: 33.8459, lng: 131.035 } },
  { kw: ['구마모토'], city: '구마모토', country: '일본', iata: 'KMJ', airport: { lat: 32.8373, lng: 130.8551 } },
  { kw: ['나가사키'], city: '나가사키', country: '일본', iata: 'NGS', airport: { lat: 32.9169, lng: 129.9136 } },
  { kw: ['오사카', '간사이', '간사히'], city: '오사카', country: '일본', iata: 'KIX', airport: { lat: 34.4347, lng: 135.244 } },
  { kw: ['도쿄', '이타코', '나리타'], city: '도쿄', country: '일본', iata: 'NRT', airport: { lat: 35.772, lng: 140.3929 } },
  { kw: ['히로시마'], city: '히로시마', country: '일본', iata: 'HIJ', airport: { lat: 34.4361, lng: 132.9194 } },
  { kw: ['마쓰야마', '마츠야마'], city: '마쓰야마', country: '일본', iata: 'MYJ', airport: { lat: 33.8272, lng: 132.6997 } },
  { kw: ['광저우'], city: '광저우', country: '중국', iata: 'CAN', airport: { lat: 23.3924, lng: 113.2988 } },
  { kw: ['연태', '옌타이'], city: '연태', country: '중국', iata: 'YNT', airport: { lat: 37.6572, lng: 120.9872 } },
  { kw: ['샤먼'], city: '샤먼', country: '중국', iata: 'XMN', airport: { lat: 24.544, lng: 118.1277 } },
  { kw: ['괌'], city: '괌', country: '괌(미국)', iata: 'GUM', airport: { lat: 13.4834, lng: 144.7959 } },
  { kw: ['사이판'], city: '사이판', country: '사이판(미국)', iata: 'SPN', airport: { lat: 15.119, lng: 145.7294 } },
  { kw: ['마나도'], city: '마나도', country: '인도네시아', iata: 'MDC', airport: { lat: 1.5493, lng: 124.9259 } },
  { kw: ['큐슈'], city: '후쿠오카', country: '일본', iata: 'FUK', airport: { lat: 33.5859, lng: 130.4507 } },
];

export function cityOf(title) {
  const t = unescapeHtml(title);
  for (const c of CITY_AIRPORTS) if (c.kw.some((k) => t.includes(k))) return c;
  return null;
}

/** 상품 설명에서 항공 포함 여부를 읽는다. 글에 없으면 'unknown'(지어내지 않음). */
export function flightIncluded(text) {
  const t = unescapeHtml(text);
  if (/항공\s*불포함|항공권\s*불포함|항공\s*별도/.test(t)) return 'no';
  if (/항공\s*포함|왕복\s*항공/.test(t)) return 'yes';
  return 'unknown';
}

/** 구글 지도 주소(리다이렉트된 긴 주소)에서 좌표를 읽는다. !3d위도!4d경도 를 우선, 없으면 @위도,경도 */
export function coordsFromGoogleUrl(u) {
  const s = decodeURIComponent(String(u || ''));
  let m = /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/.exec(s);
  if (m) return { lat: Number(m[1]), lng: Number(m[2]) };
  m = /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(s);
  if (m) return { lat: Number(m[1]), lng: Number(m[2]) };
  return null;
}

/** 18홀 티타임인지(9홀·9홀+9홀 상품 제외) */
export function is18Tee(t) {
  return t && t.min_cost > 0 && t.is_9h !== 'Y' && t.is_9h2 !== 'Y' && !/9\s*홀/.test(t.course_name || '') && !/(^|[^0-9])9H/i.test(t.course_name || '');
}
