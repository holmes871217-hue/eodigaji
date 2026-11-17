// 장소 이름이 "일반 단어"와 겹치는지 판단(A 항목: 장소가 아닌 일반 단어가 인기 장소로 잡히지 않게).
// 예) 키즈카페 "육아휴직"을 이름만으로 네이버 검색량을 재면 일반 단어 검색량이 섞여 1년 인기가 부풀려진다.
// 업종 장소(키즈·카페·소품샵·액티비티·트렌드)의 짧은 이름(4글자 이하)이 장소 종류 말(공원·박물관·…)로 끝나지 않으면 모호하다고 본다.
// 모호한 이름은 검색량을 잴 때 "지역 + 이름 + 장소 종류"로 좁혀서 잰다(tools/collect.mjs spotKeywords).
const BUSINESS = new Set(['kids', 'cafe', 'shop', 'activity', 'trend']);
const PLACE_SUFFIX = /(공원|박물관|미술관|시장|마을|해수욕장|해변|산|섬|숲|정원|길|거리|골목|궁|사|암|폭포|호수|계곡|랜드|파크|센터|관|원|촌|터|루|각|정|교|항|포구|역|농장|목장|식물원|수목원|전망대|케이블카|스카이워크|리조트|온천|동굴|성|탑|굴|강|천|호|못|재|릉|밭|타운|월드|몰)$/;

export function isAmbiguousName(s) {
  const n = String(s.name || '').replace(/\s/g, '');
  return BUSINESS.has(s.cat) && n.length > 0 && n.length <= 4 && !PLACE_SUFFIX.test(n);
}

/** 모호한 이름을 좁혀 잰 검색어: "아산 육아휴직 키즈카페" */
export function narrowedKeyword(s) {
  const city = String(s.region || '').split(' ')[1] || '';
  const town = city.replace(/(시|군|구)$/, '');
  return [town, String(s.name).trim(), s.sub || ''].filter(Boolean).join(' ');
}
