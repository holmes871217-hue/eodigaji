// 성별·연령대 구분(세그먼트).
// 연령대 코드는 네이버 데이터랩 검색어 트렌드 API의 ages 값(1~11)과 똑같이 맞춰 두었다.
// → 3단계에서 실제 데이터를 붙일 때 변환 없이 그대로 쓸 수 있다.

export const AGE_BANDS = [
  { code: '1', min: 0, max: 12, mid: 8, label: '12세 이하' },
  { code: '2', min: 13, max: 18, mid: 15.5, label: '10대' },
  { code: '3', min: 19, max: 24, mid: 21.5, label: '20대 초반' },
  { code: '4', min: 25, max: 29, mid: 27, label: '20대 후반' },
  { code: '5', min: 30, max: 34, mid: 32, label: '30대 초반' },
  { code: '6', min: 35, max: 39, mid: 37, label: '30대 후반' },
  { code: '7', min: 40, max: 44, mid: 42, label: '40대 초반' },
  { code: '8', min: 45, max: 49, mid: 47, label: '40대 후반' },
  { code: '9', min: 50, max: 54, mid: 52, label: '50대 초반' },
  { code: '10', min: 55, max: 59, mid: 57, label: '50대 후반' },
  { code: '11', min: 60, max: 200, mid: 66, label: '60대 이상' },
];

export function bandOf(age) {
  return AGE_BANDS.find((b) => age >= b.min && age <= b.max) || AGE_BANDS[AGE_BANDS.length - 1];
}

/** 예: 남성 38세 → 'm6' */
export function segKey(gender, age) {
  return `${gender === 'f' ? 'f' : 'm'}${bandOf(age).code}`;
}

/** 12세 이하 아이는 검색 데이터가 빈약해서 "아이 단계에 맞는 장소인지"로 점수를 낸다. */
export function kidStage(age) {
  if (age <= 6) return 'toddler'; // 영유아·미취학
  if (age <= 9) return 'lower'; // 초등 저학년
  if (age <= 12) return 'upper'; // 초등 고학년
  return null;
}

export const KID_STAGE_LABEL = {
  toddler: '영유아·미취학',
  lower: '초등 저학년',
  upper: '초등 고학년',
};

export const GENDER_LABEL = { m: '남성', f: '여성' };

export function memberLabel(m, index) {
  const t = (m.label || '').trim();
  if (t) return t;
  return index === 0 ? '나' : `동행 ${index}`;
}
