// ⚠ 연습용 데이터입니다. 특가 내용은 지어낸 예시이고, 버튼은 각 서비스 첫 화면으로만 연결됩니다.
// NOL에는 공개된 데이터 창구(API)가 없어서, 5단계에서 "직접 고른 특가를 표(구글 시트)에 적으면 앱에 뜨는" 방식으로 바꿉니다.

export const DEAL_SHORTCUTS = [
  { title: 'NOL 특가 보러 가기', sub: '숙박·레저·교통', url: 'https://nol.yanolja.com/' },
  { title: 'NOL 티켓 보러 가기', sub: '공연·전시·키즈', url: 'https://nol.interpark.com/' },
];

export const DEALS = [
  { id: 'd1', provider: 'NOL', title: '주말 가족 호캉스 특가 모음', desc: '조식 포함 패밀리룸 위주. 금·토 체크인.', tag: '숙박', off: '최대 30%', url: 'https://nol.yanolja.com/' },
  { id: 'd2', provider: 'NOL', title: '테마파크 종일권 가족 패키지', desc: '어른 2 + 아이 1 묶음 할인.', tag: '입장권', off: '약 25%', url: 'https://nol.yanolja.com/' },
  { id: 'd3', provider: 'NOL 티켓', title: '어린이 뮤지컬·체험전 얼리버드', desc: '겨울방학 시즌 공연 사전 예매.', tag: '공연·전시', off: '최대 40%', url: 'https://nol.interpark.com/' },
  { id: 'd4', provider: 'NOL', title: '강원 리조트 1박 + 워터파크', desc: '주중·일요일 체크인 한정.', tag: '숙박+레저', off: '약 35%', url: 'https://nol.yanolja.com/' },
];
