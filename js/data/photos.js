// 장소 대표 사진. 위키미디어 공용(Wikimedia Commons)의 자유 이용 사진을 주소로 불러온다.
// 3단계에서 한국관광공사 관광정보 서비스가 주는 공식 사진으로 교체할 예정.
// 값: [저장소, 폴더, 파일이름]  → 500px 너비 썸네일 주소를 만든다.

const RAW = {
  'seoul-grandpark': ['commons', '9/94', '20150203%EC%84%9C%EC%9A%B8%EB%8C%80%EA%B3%B5%EC%9B%90183.jpg'],
  everland: ['commons', 'd/d3', '%EC%97%90%EB%B2%84%EB%9E%9C%EB%93%9C_%EA%B4%80%EB%9E%8C%EC%B0%A8_%EC%A0%95%EC%9B%90_2025.jpg'],
  'gwacheon-science': ['commons', '9/9c', '2015%EB%85%84_3%EC%9B%94_29%EC%9D%BC_%EA%B5%AD%EB%A6%BD%EA%B3%BC%ED%95%99%EA%B3%BC%EC%B2%9C%EA%B4%80228.jpg'],
  'seoul-forest': ['commons', '7/79', 'Seoul_Forest_%EC%84%9C%EC%9A%B8%EC%88%B2.jpg'],
  'lotte-world': ['en', 'b/be', 'Lotte_World_day_view_4_%28cropped%29.jpg'],
  'children-museum': ['commons', '2/24', 'National_Museum_of_Korea%2C_Seoul_%282%29_%2840236586235%29.jpg'],
  seongsu: ['commons', '1/19', 'Seoul%2C_Seongdong_District%2C_Seongsu_%28Yeonmujang-gil%29.jpg'],
  'gwangmyeong-cave': ['commons', '7/78', 'Gwangmyeong_Cave.jpg'],
  'morning-calm': ['commons', '1/14', 'Morning_Calm_Arboretum_Sign.jpg'],
  nami: ['commons', 'e/ed', 'Nami_island_winter.jpg'],
  legoland: ['commons', '2/29', '20231226_%EB%A0%88%EA%B3%A0%EB%9E%9C%EB%93%9C%EC%BD%94%EB%A6%AC%EC%95%84_%EC%A0%95%EB%AC%B8_%EC%A0%84%EA%B2%BD.jpg'],
  heyri: ['commons', 'd/d4', 'Art-Service_Studio%2C_Heyri.jpg'],
  imjingak: ['commons', '0/0e', 'Imjingak_001.jpg'],
  jebudo: ['commons', '7/72', 'Jebudo.png'],
  dumulmeori: ['commons', '5/54', 'Yangpyeong_Dumulmeori_2019-11-11.jpg'],
  wolmido: ['commons', 'f/fc', 'Walmido_promenade.jpg'],
  'songdo-park': ['commons', '9/90', 'Songdo_Central_Park_in_2021.jpg'],
  'ganghwa-luge': ['commons', 'f/f6', 'Luge_at_Ganghwa_Seaside_Resort_20200718_013.jpg'],
  anmok: ['commons', '0/0b', '%EC%95%88%EB%AA%A9%ED%95%B4%EB%B3%80%2C_AM_%EB%A3%A8%ED%94%84%ED%83%91%EC%97%90%EC%84%9C_%EB%B3%B8_%ED%92%8D%EA%B2%BD.jpg'],
  sokcho: ['commons', '7/7c', '%EC%86%8D%EC%B4%88%ED%95%B4%EC%88%98%EC%9A%95%EC%9E%A5.jpg'],
  sheep: ['commons', 'b/b5', 'Sheep_ranch.jpg'],
  oworld: ['commons', 'd/d5', 'Daejeon_Zooland.JPG'],
  'science-museum': ['commons', '4/40', 'National_Science_Museum_2021.jpg'],
  danyang: ['commons', '9/95', 'Panoramic_view_of_Danyang-eup.jpg'],
  kkotji: ['commons', 'b/b9', 'Kkotji_Beach_in_Buan.jpg'],
  gongju: ['commons', '5/55', '%EA%B3%B5%EC%82%B0%EC%84%B1_%EA%B8%88%EC%84%9C%EB%A3%A8.jpg'],
  jeonju: ['commons', 'f/f2', '%EC%A0%84%EC%A3%BC%ED%95%9C%EC%98%A5%EB%A7%88%EC%9D%84_%EC%A0%84%EA%B2%BD.JPG'],
  suncheon: ['commons', '4/43', 'Panorama_of_International_Garden_Exposition_Suncheon_Bay_Korea_2013.jpg'],
  yeosu: ['commons', '2/2a', 'Yeosu_Odongdo_20180929_002.jpg'],
  juknokwon: ['commons', '3/3f', 'Damyang_Jungnogwon_%281%29.jpg'],
  hwangnidan: ['commons', 'e/ef', '%EB%8C%80%EB%A6%89%EC%9B%90.jpg'],
  'gyeongju-world': ['commons', 'f/f2', 'Gyeongju_World.jpg'],
  haeundae: ['commons', 'a/a2', 'Haeundae_Beach_in_Busan.jpg'],
  'songdo-cable': ['commons', 'b/ba', 'Busan_-_Songdo_beach.jpg'],
  eworld: ['commons', 'f/fd', 'E_WORLD_in_Daegu_on_April_5th_2013.jpg'],
  jikjisa: ['commons', '1/16', '%EC%A7%81%EC%A7%80%EC%82%AC1.jpg'],
  tongyeong: ['commons', '3/31', 'Tongyeong_Cable_Car.jpg'],
  hahoe: ['commons', 'b/bc', 'Korea-Andong-Hahoe.Village-02.jpg'],
};

// 썸네일 규칙이 다른 사진(원본 그대로 쓰는 경우)
const DIRECT = {
  'folk-village': {
    src: 'https://upload.wikimedia.org/wikipedia/commons/e/e0/TightropewalkerKoreanFolkVillage.jpg',
    page: 'https://commons.wikimedia.org/wiki/File:TightropewalkerKoreanFolkVillage.jpg',
  },
};

// 한국관광공사 대표 사진(실제 데이터)이 있으면 그것을 먼저 쓴다.
let LIVE = {};
export function setLivePhotos(map) {
  LIVE = map || {};
}
export function addLivePhotos(map) {
  LIVE = { ...LIVE, ...(map || {}) };
}

// 관광공사가 아닌 곳에서 받은 사진의 출처(위키백과 등): id → { page, label }
let LIVE_SRC = {};
export function addLiveSources(map) {
  LIVE_SRC = { ...LIVE_SRC, ...(map || {}) };
}

// 한국관광공사 사진 여러 장(대표 사진이 맨 앞, 최대 10장)
let LIVE_LISTS = {};
export function setLivePhotoLists(map) {
  LIVE_LISTS = map || {};
}
export function addLivePhotoLists(map) {
  LIVE_LISTS = { ...LIVE_LISTS, ...(map || {}) };
}

/** 장소 id → 옆으로 넘겨 볼 사진 주소 목록(없으면 빈 목록, 최대 10장) */
export function photosOf(id) {
  const list = LIVE_LISTS[id];
  if (Array.isArray(list) && list.length) return list.slice(0, 10);
  const one = photoOf(id);
  return one ? [one.src] : [];
}

/** 장소 id → { src: 사진 주소, page: 출처 페이지, label: 출처 이름 } 또는 null */
export function photoOf(id) {
  if (LIVE[id]) return { src: LIVE[id], ...(LIVE_SRC[id] || { page: 'https://api.visitkorea.or.kr', label: '한국관광공사' }) };
  if (DIRECT[id]) return DIRECT[id];
  const r = RAW[id];
  if (!r) return null;
  const [repo, dir, name] = r;
  return {
    src: `https://thumb.wikimedia.org/wikipedia/${repo}/thumb/${dir}/${name}/500px-${name}`,
    page: repo === 'en' ? `https://en.wikipedia.org/wiki/File:${name}` : `https://commons.wikimedia.org/wiki/File:${name}`,
  };
}
