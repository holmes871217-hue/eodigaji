// ⚠ 연습용 데이터입니다. 축제 이름은 실제 있는 것을 참고했지만 날짜는 지어낸 값입니다.
// (화면을 시험할 수 있도록 "오늘부터 며칠 뒤" 방식으로 날짜를 만듭니다.)
// 3단계에서 한국관광공사 "행사정보조회" 결과가 이 파일을 대신합니다.

import { addDays, todayISO } from '../core/dates.js';

export const EVENT_TYPES = {
  festival: '축제',
  event: '행사',
  show: '전시·볼거리',
  hands: '체험',
  stage: '공연',
};

// off: 오늘부터 며칠 뒤 시작, len: 며칠 동안
const RAW = [
  { id: 'gimbap', title: '김천 김밥축제', type: 'festival', region: '경북 김천', lat: 36.139, lng: 128.113, off: 6, len: 2, kid: true, desc: '김밥을 주제로 한 먹거리 축제. 지역 김밥 부스와 가족 체험 프로그램.' },
  { id: 'bbq', title: '홍성 글로벌 바비큐 페스티벌', type: 'festival', region: '충남 홍성', lat: 36.601, lng: 126.661, off: 5, len: 4, kid: true, desc: '한우·한돈 바비큐를 한자리에서 즐기는 먹거리 축제.' },
  { id: 'rice', title: '이천 쌀문화축제', type: 'festival', region: '경기 이천', lat: 37.272, lng: 127.435, off: 1, len: 4, kid: true, desc: '가마솥밥 나눔, 떡 만들기 등 햅쌀 체험.' },
  { id: 'lantern', title: '서울빛초롱축제', type: 'show', region: '서울 종로', lat: 37.569, lng: 126.979, off: -3, len: 24, kid: true, desc: '청계천을 따라 이어지는 등불 전시. 저녁 산책 코스.' },
  { id: 'media-art', title: '수원화성 미디어아트', type: 'show', region: '경기 수원', lat: 37.287, lng: 127.012, off: -5, len: 30, kid: true, desc: '성곽에 비추는 야간 미디어아트 쇼.' },
  { id: 'special-exhibit', title: '국립중앙박물관 특별전', type: 'show', region: '서울 용산', lat: 37.5239, lng: 126.9804, off: -20, len: 60, kid: true, desc: '기획 특별전. 어린이박물관과 함께 둘러보기 좋음.' },
  { id: 'science-fest', title: '대전 사이언스 페스티벌', type: 'event', region: '대전 유성', lat: 36.376, lng: 127.376, off: 7, len: 3, kid: true, desc: '과학 체험 부스와 공연. 초등학생 추천.' },
  { id: 'bean', title: '파주 장단콩축제', type: 'festival', region: '경기 파주', lat: 37.889, lng: 126.74, off: 7, len: 2, kid: true, desc: '임진각에서 열리는 콩 요리·전통장 축제.' },
  { id: 'kimchi', title: '광주 김치축제', type: 'festival', region: '광주 서구', lat: 35.146, lng: 126.923, off: 6, len: 3, kid: true, desc: '김치 담그기 체험과 남도 음식 장터.' },
  { id: 'reed', title: '순천만 갈대축제', type: 'festival', region: '전남 순천', lat: 34.886, lng: 127.509, off: 0, len: 9, kid: true, desc: '갈대밭 산책과 생태 체험.' },
  { id: 'apple', title: '청송 사과축제', type: 'festival', region: '경북 청송', lat: 36.436, lng: 129.057, off: 12, len: 4, kid: true, desc: '사과 따기 체험과 사과 디저트 장터.' },
  { id: 'jara', title: '가평 자라섬 캠핑 페스티벌', type: 'event', region: '경기 가평', lat: 37.82, lng: 127.522, off: 13, len: 2, kid: true, desc: '캠핑과 공연을 함께 즐기는 주말 행사.' },
  { id: 'hanok-night', title: '전주 한옥마을 야간 문화행사', type: 'event', region: '전북 전주', lat: 35.815, lng: 127.153, off: 14, len: 2, kid: false, desc: '야간 해설 투어와 전통 공연.' },
  { id: 'coffee', title: '강릉 커피축제', type: 'festival', region: '강원 강릉', lat: 37.772, lng: 128.948, off: 20, len: 4, kid: false, desc: '로스터리 부스와 바리스타 시연.' },
  { id: 'light-busan', title: '해운대 빛축제', type: 'show', region: '부산 해운대', lat: 35.159, lng: 129.16, off: 10, len: 40, kid: true, desc: '해변과 구남로 일대 야간 조명 전시.' },
  { id: 'bluesquare-musical', title: '블루스퀘어 가족 뮤지컬', type: 'stage', region: '서울 용산 한남', lat: 37.5408, lng: 127.0026, off: -10, len: 60, kid: true, desc: '블루스퀘어 공연장의 장기 공연. 회차와 좌석은 예매처에서 확인.' },
  { id: 'daehakro-kids', title: '대학로 어린이 연극', type: 'stage', region: '서울 종로 혜화', lat: 37.5822, lng: 127.0019, off: -5, len: 45, kid: true, desc: '소극장에서 하는 1시간 안팎의 어린이 연극.' },
  { id: 'haebangchon-flea', title: '해방촌 신흥시장 주말 플리마켓', type: 'event', region: '서울 용산 해방촌', lat: 37.544, lng: 126.9855, off: 6, len: 2, kid: true, desc: '시장 골목에서 열리는 작은 수공예·빈티지 장터.' },
  { id: 'strawberry', title: '양평 딸기 따기 체험', type: 'hands', region: '경기 양평', lat: 37.49, lng: 127.49, off: 21, len: 60, kid: true, desc: '농장에서 직접 따서 먹는 딸기 체험. 예약제.' },
];

export function getEvents(today = todayISO()) {
  return RAW.map((e) => ({
    ...e,
    start: addDays(today, e.off),
    end: addDays(today, e.off + e.len - 1),
    sample: true,
  }));
}
