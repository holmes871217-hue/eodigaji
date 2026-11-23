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

/** 골프몬 해외투어 목록 화면(마크다운) → 상품 목록. 제목 [도시] …, 출발 기간, "N원~", 항공사, 사진(s3 주소만) */
export function parseGolfmonOverseas(md) {
  const start = md.indexOf('골프몬 해외 투어 NEW');
  const m = start >= 0 ? md.slice(start) : md;
  const parts = m.split(/\n!\[\]\((https:\/\/[^)]+)\)\n/);
  const items = [];
  for (let k = 1; k < parts.length - 1; k += 2) {
    const img = parts[k], body = parts[k + 1];
    const t = /\\\[([^\]]+?)\\\]\s*(.+)/.exec(body);
    const p = /([\d,]+)원~/.exec(body);
    if (!t || !p) continue;
    const dr = /(\d\d\.\d\d)\([^)]\)\s*~\s*(\d\d\.\d\d)\([^)]\)/.exec(body);
    const air = /ic_airplane\.svg\)\s*(.+)/.exec(body);
    items.push({ city: t[1], title: `[${t[1]}] ${t[2].replace(/\\/g, '').trim()}`, price: Number(p[1].replace(/,/g, '')), from: dr?.[1] || null, to: dr?.[2] || null, air: air ? air[1].trim() : null, img: img.includes('amazonaws') ? img : '' });
  }
  return items;
}

/** 골프몬 양도 달력 칸 선택자: 지역 번호와 날짜로 그 칸을 누른다 */
export const GOLFMON_REGIONS = [['9', '인천경인'], ['1', '경기북부'], ['8', '경기동부'], ['2', '경기남부'], ['3', '충청'], ['4', '강원'], ['5', '전라'], ['6', '경상'], ['7', '제주']];
export const golfmonCell = (regionId, day) => `.schedule-count[data-gtm-meta*='"region_id":"${regionId}","date":"${day}"']`;

/**
 * 골프몬 양도 목록(마크다운) → 행. 한 건은 "골프장명 / (거리Km) / 11/28(토)13:00 / 18홀 / (골프몬) / 판매자 / 230,000원" 순서로 나온다.
 * 날짜·시간 줄을 기준으로 앞쪽에서 골프장명, 뒤쪽에서 홀 수와 가격을 찾는다.
 */
export function parseGolfmonDomestic(md) {
  const lines = String(md || '').split('\n').map((s) => s.replace(/\\/g, '').trim()).filter(Boolean);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const d = /^(\d{1,2})\/(\d{1,2})\([^)]\)\s*(\d{1,2}):?(\d{2})?/.exec(lines[i]);
    if (!d) continue;
    let j = i - 1;
    if (j >= 0 && /^\d+(\.\d+)?\s*Km$/i.test(lines[j])) j--;
    const name = j >= 0 ? lines[j] : '';
    let holes = '', price = 0;
    for (let k = i + 1; k < Math.min(lines.length, i + 6); k++) {
      if (!holes && /^\d+\s*홀/.test(lines[k])) holes = lines[k];
      const p = /^([\d,]+)\s*원$/.exec(lines[k]);
      if (p) { price = Number(p[1].replace(/,/g, '')); break; }
    }
    if (!name || !price || /원$|Km$|^\d+\s*홀/.test(name)) continue;
    out.push({ name, md: `${d[1]}/${d[2]}`, time: `${d[3]}:${d[4] || '00'}`, holes, price });
  }
  return out;
}

/** 해외 골프장 → 가까운 공항(인천에서 가는 공항 위주). 좌표는 공항 위치(대략) — 공항을 고르는 데만 쓴다. */
export const AIRPORTS = [
  ['BKK', '방콕', 13.690, 100.750], ['CNX', '치앙마이', 18.767, 98.963], ['HKT', '푸켓', 8.113, 98.317], ['CEI', '치앙라이', 19.952, 99.883], ['USM', '코사무이', 9.548, 100.062], ['KBV', '끄라비', 8.099, 98.986],
  ['HAN', '하노이', 21.221, 105.807], ['SGN', '호치민', 10.819, 106.652], ['DAD', '다낭', 16.044, 108.199], ['CXR', '나트랑', 11.998, 109.219], ['PQC', '푸꾸옥', 10.170, 103.993], ['HPH', '하이퐁', 20.819, 106.725], ['DLI', '달랏', 11.750, 108.367], ['UIH', '꾸이년', 13.955, 109.042], ['VDO', '하롱(번돈)', 21.118, 107.414],
  ['MNL', '마닐라', 14.509, 121.020], ['CRK', '클락', 15.186, 120.560], ['CEB', '세부', 10.308, 123.979], ['KLO', '칼리보(보라카이)', 11.679, 122.376],
  ['TPE', '타이베이', 25.080, 121.233], ['KHH', '가오슝', 22.577, 120.350], ['RMQ', '타이중', 24.265, 120.621],
  ['GUM', '괌', 13.484, 144.796], ['SPN', '사이판', 15.119, 145.729],
  ['CTS', '삿포로', 42.775, 141.692], ['HKD', '하코다테', 41.770, 140.822], ['AKJ', '아사히카와', 43.671, 142.447], ['AOJ', '아오모리', 40.734, 140.691], ['SDJ', '센다이', 38.140, 140.917], ['KIJ', '니가타', 37.956, 139.121],
  ['IBR', '이바라키', 36.181, 140.415], ['NRT', '도쿄(나리타)', 35.772, 140.393], ['HND', '도쿄(하네다)', 35.549, 139.780], ['FSZ', '시즈오카', 34.796, 138.189], ['NGO', '나고야', 34.858, 136.805], ['KMQ', '고마쓰', 36.395, 136.408],
  ['KIX', '오사카(간사이)', 34.434, 135.244], ['OKJ', '오카야마', 34.757, 133.855], ['HIJ', '히로시마', 34.436, 132.919], ['YGJ', '요나고', 35.492, 133.236], ['UBJ', '야마구치우베', 33.930, 131.279], ['TAK', '다카마쓰', 34.214, 134.016],
  ['MYJ', '마쓰야마', 33.827, 132.700], ['FUK', '후쿠오카', 33.586, 130.451], ['KKJ', '기타큐슈', 33.846, 131.035], ['HSG', '사가', 33.150, 130.302], ['NGS', '나가사키', 32.917, 129.914], ['KMJ', '구마모토', 32.837, 130.855],
  ['OIT', '오이타', 33.479, 131.737], ['KMI', '미야자키', 31.877, 131.449], ['KOJ', '가고시마', 31.803, 130.719], ['OKA', '오키나와', 26.196, 127.646], ['MMY', '미야코지마', 24.783, 125.295],
].map(([iata, name, lat, lng]) => ({ iata, name, lat, lng }));

/**
 * 골프장에서 쓸 공항: 가장 가까운 공항, 단 인천 직항이 있는 공항이 그보다 80km 안쪽으로 더 멀 뿐이면 직항 공항을 고른다.
 * flights 는 flights.json 의 airports(직항·요금 정보).
 */
export function pickAirport(course, flights = {}) {
  if (!Number.isFinite(course.lat) || !Number.isFinite(course.lng)) return null;
  const list = AIRPORTS.map((a) => ({ ...a, km: haversineKm(course, a) })).sort((x, y) => x.km - y.km);
  const near = list[0];
  if (!near || near.km > 400) return null;
  const direct = list.find((a) => flights[a.iata]?.direct && a.km <= near.km + 80);
  return direct || near;
}

/**
 * 골프장 근처 숙소 5곳: 도시별로 받아 둔 평점 높은 숙소(시내 숙소) 중 골프장에서 가까운 10곳을 고르고, 그중 평점 높은 순 5곳.
 * 리뷰 30개 미만은 평점이 흔들려서 뺀다. 60km 안에 5곳이 안 되면 120km까지 넓힌다.
 */
export function pickStays(course, hotels, n = 5) {
  if (!Number.isFinite(course.lat) || !Number.isFinite(course.lng)) return [];
  const all = Object.entries(hotels).filter(([, h]) => h.c >= 30).map(([id, h]) => ({ id, km: haversineKm(course, h), s: h.s }));
  for (const lim of [60, 120]) {
    const near = all.filter((x) => x.km <= lim).sort((a, b) => a.km - b.km).slice(0, n * 2);
    if (near.length >= n || lim === 120) return near.sort((a, b) => b.s - a.s || a.km - b.km).slice(0, n).map((x) => [x.id, Math.round(x.km)]);
  }
  return [];
}
