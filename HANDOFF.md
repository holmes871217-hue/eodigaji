# 인수인계 문서 (새 세션·다른 AI는 이 문서만 읽고 시작)

마지막 정리: 2026-11-14

## 사용자

- 코딩을 모르는 일반인. 한국어로, 쉬운 말 + 전문용어 괄호 병기.
- 결과물은 먼저 직접 검수해서 이상 없을 때만 보여 줄 것.
- 사무적·투박한 디자인을 싫어함. 사진이 있어야 함.
- 사용자에게 페이지를 열어 줄 때는 크롬(Claude in Chrome). 검수는 앱 안 브라우저.
- 키는 채팅에 붙이지 않고 `.env`에 직접 넣음(메모장으로 열어 줌). 키 값을 출력하지 말 것.

## 앱

"어디가지": 아빠가 주말·연차에 아이와 갈 곳을 고르는 안드로이드용 웹앱(PWA). 지인에게만 QR로 공유.

- 앱 주소: https://holmes871217-hue.github.io/eodigaji/
- 저장소: https://github.com/holmes871217-hue/eodigaji (공개)
- 기획서: https://claude.ai/artifact/1VHpiij1ATNAUP41ZPmQgt
- 디자인: https://claude.ai/artifact/7V2sXf3aW4nEsJ2hXtJMwm (3번 "소프트 플레이" 적용됨)

## 구조 (빌드 도구 없음, 순수 HTML/CSS/JS 모듈)

- `app/` 앱 본체. 이 폴더만 게시됨.
  - `css/tokens.css` 디자인 토큰, `css/app.css` 화면 스타일
  - `js/main.js` 상태 → 계산 → 그리기 → 누르는 동작(`data-action`)
  - `js/core/` scoring(추천 점수), geo(거리·이동시간 추정), store(localStorage `eodigaji.v1`), locate, search(위치 검색), dates, segments
  - `js/data/` places(직접 고른 60곳 + TIPS + 분류 기본값), places-local(자동 생성 179곳), events·deals(연습용), photos, live(실제 데이터 병합)
  - `js/ui/` home, events, deals, mypage, sheet(상세 창), map(Leaflet + OSM), util
  - `js/config.js` 카카오 JavaScript 키(웹 공개용, 도메인 제한). **다른 키는 절대 넣지 말 것**
  - `data/*.json` 수집기가 만든 실제 데이터(places, events, venues, details, spots)
  - `sw.js` 서비스 워커(네트워크 우선). **앱 파일을 바꾸면 `CACHE` 숫자를 올릴 것**, 새 파일은 목록에 추가
- `tools/collect.mjs` 데이터 수집기, `tools/check-keys.mjs` 키 동작 확인(값 출력 안 함)
- `tools/local-places-src.mjs` → `tools/build-local-places.mjs` → `app/js/data/places-local.js`
- `tools/serve.ps1` 로컬 미리보기(포트 5173, `.claude/launch.json`의 `eodigaji`)
- `.github/workflows/collect.yml` 매일 05:00 KST 수집 → `app/data` 커밋 → 게시

## 게시 방법

작업 전 `git pull`(Actions가 매일 자동 커밋함). 커밋 후:

```bash
git push origin main
git push origin "$(git subtree split --prefix app main)":refs/heads/gh-pages --force
```

푸시는 `gh auth git-credential`을 credential helper로 지정해서 한다(gh: `C:\Program Files\GitHub CLI\gh.exe`, node: `C:\Program Files\nodejs\node.exe`). 커밋 전 `.env`의 키 값이 추적 파일에 섞이지 않았는지 grep으로 확인(카카오 JS 키만 `app/js/config.js`에 허용).

## 키 (`.env`, GitHub Secrets)

| 변수 | 용도 | 상태 |
| --- | --- | --- |
| `DATA_GO_KR_KEY` | 공공데이터포털(관광공사 KorService2) | 동작. 하루 1,000회 한도 |
| `KAKAO_REST_KEY` | 카카오 로컬 검색·모빌리티 | 동작 |
| `KAKAO_JS_KEY` | 카카오 지도 SDK(앱 안 위치 검색) | github.io 도메인 등록됨(200). `http://localhost:5173`은 미등록이라 로컬에서는 OSM 검색으로 동작 |
| `NAVER_API_KEY_ID`, `NAVER_API_KEY` | NAVER API HUB(검색 트렌드·블로그). 종량제 | 동작. 하루 약 180회 |
| `KOPIS_KEY` | 공연 일정 | 동작. 2027-11 연장 신청 필요 |
| `GOOGLE_PLACES_KEY` | 구글 Places API (New) | 2026-11-14 사용자가 `.env`에 넣음. **아직 코드에서 안 씀, Secrets 미등록, 동작 미확인** |

키를 바꾸면 `gh secret set -f .env -R holmes871217-hue/eodigaji`.

주의: 네이버 검색·데이터랩은 NAVER API HUB(`https://naverapihub.apigw.ntruss.com`, 헤더 `X-NCP-APIGW-API-KEY-ID`/`X-NCP-APIGW-API-KEY`)에서만 제공. 카카오 주소에 광주는 "전남광주통합특별시", 인천 중구는 제물포구·영종구로 나옴(2026 행정구역 변경).

## 데이터 (수집기 `tools/collect.mjs`)

- 축제: 관광공사 `searchFestival2`. 공연: KOPIS 아동 공연 60일치 + 카카오로 공연장 좌표(`venues.json` 캐시). KOPIS가 가끔 400 → 3회 재시도, 실패 시 지난 자료 유지.
- 직접 고른 60곳: 네이버 성별·연령대별 인기, 1년 인기, 최근 4주 추세(기준어 '남이섬'), 블로그 수(7일 캐시).
- 전국 소소한 곳 179곳(`places-local.js`): 네이버 1년 인기·추세만. 성별·연령 모양은 분류 기본값(`CAT_DEFAULT`).
- 사진·소개: 관광공사 `searchKeyword2` + `detailCommon2` 개요 앞 2~3문장(`details.json`, 30일 캐시).
- 카카오 동네 장소 약 1,850곳(`spots.json`): 47개 거점 × 16개 검색어, 7일마다. 관광공사 등록 여부를 하루 400곳씩 확인(등록이면 점수 +15, 사진·소개). 앱에서는 직접 고른 곳보다 낮게(등록 ×0.75, 미등록 ×0.5).
- 아직 연습용: 혼잡 예측(crowd), 아이 단계별 적합도(kid), 이동시간(직선거리 + 도심 보정 추정), 특가 탭.

## 화면에서 확정된 것

- 마이 탭 순서: 언제·얼마나 → 어떤 곳 → 주요 검색 위치 → 함께 가는 사람.
- 주요 검색 위치: 검색칸(카카오 → OSM → 앱 안 이름), "현재 위치 사용", 지도에서 고르기. 고르면 지도 핀도 그 위치로 이동.
- 추천 탭: "가까운 소소한 곳 / 전체 / 큰 나들이". 지도 첫 화면은 가로 10km.
- 장소 상세: 볼거리 요약(`tip`), 관광공사 소개, 가는 날 근처 축제·공연(누르면 축제 탭에서 열림).

## 다음 할 일 (우선순위 순)

1. **구글 Places 연결 여부 결정·구현.** 키는 `.env`에 있음. 구글은 결과 저장을 제한하므로(장소 ID만 장기 저장 가능) 매일 수집해 게시하는 방식이 아니라 앱에서 그때그때 묻는 방식이 맞음. 무료 한도: Nearby Search Pro 월 5,000회, 평점 포함 Enterprise 월 1,000회. 키를 브라우저에서 쓰려면 HTTP 리퍼러 제한 필요.
2. **티맵 "기초지자체 중심 관광지 정보"**(`https://apis.data.go.kr/B551011/LocgoHubTarService1/areaBasedList1`, data.go.kr 15128559): 사용자 활용신청 대기. 승인되면 응답 필드를 확인해 시군구별 100위 순위를 장소 점수에 반영.
3. 카카오 콘솔에 `http://localhost:5173` 도메인 추가(로컬 검수용, 선택).
4. 마이 탭 지도는 한 번 눌러야 움직이게(스크롤 중 지도 건드림 방지). 제안만 했고 답 없음.
5. 이동시간을 카카오모빌리티 길찾기로(키를 숨길 중계 서버 필요).
6. 실제 안드로이드 폰에서 설치·현재 위치·검색 확인(아직 미검수).
