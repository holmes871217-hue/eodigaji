// 카카오 지도 JavaScript 키. 웹페이지에 공개되도록 만든 키이며, 카카오 콘솔에 등록한 도메인(github.io, localhost:5173)에서만 동작한다.
// REST 키·네이버·공공데이터 키는 절대 여기에 넣지 말 것(그 키들은 .env 와 GitHub Secrets 에만 둔다).
export const KAKAO_JS_KEY = "692660271ba36229a4da426adf2bf739";

// 구글 Places 키(장소 근처 맛집·카페의 평점). 비워 두면 평점 없이 카카오로 가까운 순만 보여 준다.
// 이 키는 웹페이지에 공개되므로, 구글 클라우드 콘솔에서 반드시 아래 세 가지를 걸어 둔 뒤에만 넣는다.
//  1) 웹사이트 제한: https://holmes871217-hue.github.io/*  2) API 제한: Places API (New)만  3) 하루 호출 한도
export const GOOGLE_PLACES_KEY = 'AIzaSyA0MJs6qJCxVoHm3ShGabQ1d5N09R91RV8';
