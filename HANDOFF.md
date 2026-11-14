# 인수인계 문서 (다른 AI·개발자가 이어서 작업할 때 먼저 읽을 것)

작성일: 2026-11-14

## 사용자

- 코딩을 모르는 일반인. 한국어로, 쉬운 말로 설명하고 전문용어를 괄호로 함께 알려 달라고 함.
- 결과물은 먼저 직접 검수해서 이상 없을 때만 보여 달라고 함.
- 사무적·투박한 디자인을 싫어함. 사진이 있어야 눌러 보고 싶어진다고 함.

## 앱

"어디가지": 아빠가 주말·연차에 아이와 갈 곳을 고르는 안드로이드용 웹앱(PWA). 지인에게만 QR로 공유.

- 앱 주소: https://holmes871217-hue.github.io/eodigaji/
- 저장소: https://github.com/holmes871217-hue/eodigaji (공개)
- 기획서: https://claude.ai/artifact/1VHpiij1ATNAUP41ZPmQgt
- 디자인 예시: https://claude.ai/artifact/7V2sXf3aW4nEsJ2hXtJMwm (3번 "소프트 플레이" 확정·적용됨)

## 구조 (빌드 도구 없음, 순수 HTML/CSS/JS 모듈)

- `app/` 앱 본체. 이 폴더만 게시됨.
  - `css/tokens.css` 색·글꼴 등 디자인 토큰, `css/app.css` 화면 스타일
  - `js/core/scoring.js` 추천 점수 계산, `geo.js` 거리·이동시간 추정, `store.js` 설정 저장(localStorage), `locate.js` 좌표→이름
  - `js/data/places.js`·`events.js`·`deals.js` **연습용 데이터(mock)**, `photos.js` 위키미디어 공용 썸네일 주소
  - `js/ui/` 화면(home, events, deals, mypage, sheet, map)
  - `sw.js` 서비스 워커(네트워크 우선, 파일 목록 바뀌면 CACHE 이름 숫자 올릴 것), `manifest.webmanifest`
- `tools/serve.ps1`, `start.bat` 로컬 미리보기(포트 5173)

## 게시 방법

`main`에 커밋·푸시한 뒤, `app` 폴더만 `gh-pages` 가지에 올리면 GitHub Pages가 게시함.

```bash
git push origin main
git push origin "$(git subtree split --prefix app main)":refs/heads/gh-pages --force
```

GitHub Actions 워크플로 파일은 올리지 못했음. gh 토큰에 `workflow` 권한이 없기 때문. 필요해지면 `gh auth refresh -s workflow`로 사용자 승인을 다시 받을 것.

## 확정된 결정

- 설치 파일(APK)이 아니라 웹앱(PWA)
- "출발 위치"가 아니라 "주요 검색 위치". 지도에서 직접 고르고, "현재 위치 사용" 버튼은 따로 둠
- 지도 첫 화면은 가로 10km 축척
- 추천 카드에 대표 사진
- 인스타그램 해시태그는 공식 API 제약으로 쓰지 않고 네이버 블로그 언급 수로 대체(제안 상태)
- NOL 특가는 공개 API가 없어 바로가기 + 수동 목록(제안 상태)

## 소소한 방문지 추천 (2026-11-14 구현 완료)

사용자 의견: 추천이 크고 먼 유명 장소 위주였다. 검색 위치 근처의 시장, 소품샵, 소규모 공연, 작은 전시도 추천해야 한다(예: 해방촌 → 신흥시장, 블루스퀘어 뮤지컬).

- `places.js`: 장소마다 `scale: 'big' | 'small'`. 작은 장소 19곳(`SMALL`, 해방촌·용산·종로·마포 위주)과 분류 5개(시장, 소품샵·골목, 공연장, 미술관·전시, 산책·골목길) 추가.
- `scoring.js`: `rankPlaces(..., scope)`의 scope는 `near`(작은 곳만, 차로 45분 안) | `all` | `big`. 작은 곳은 `SMALL_BOOST`(1.35) × 거리 계수(5분이면 덧점, 40분 넘으면 거의 0)로 계산.
- 홈 화면에 "가까운 소소한 곳 / 전체 / 큰 나들이" 선택이 있으며, 고른 값은 저장됨. 1.5km 안은 "걸어서 약 N분"으로 표시(`geo.js tripLabel`).
- `events.js`에 "공연" 종류와 예시 3건 추가.
- 남은 일: 작은 장소에는 아직 사진이 없음(분류 그림으로 대신 표시). 작은 장소 목록이 서울 일부에만 있어, 실제 데이터 연결이 필수. 출처 후보: 카카오 로컬(좌표 주변 분류·키워드 검색), 한국관광공사 위치기반 관광정보, KOPIS 공연예술통합전산망(공연 일정).

### 전국 소소한 곳 (2026-11-14 추가)

사용자 의견: 서울 밖에는 가까운 소소한 곳이 거의 없다. 관광명소·놀거리를 더 넣어 달라.

- 원본 목록 `tools/local-places-src.mjs` (179곳, 이름·지역·분류·볼거리 요약·검색어). `node tools/build-local-places.mjs`가 카카오 장소 검색으로 좌표를 찾아 `app/js/data/places-local.js`를 만든다. 목록을 고치면 다시 실행.
- 2026년 행정구역 변경 주의: 카카오 주소에 광주는 "전남광주통합특별시", 인천 중구는 제물포구·영종구로 나온다.
- 성별·연령대 모양은 분류별 기본값(`places.js CAT_DEFAULT`), 크기는 네이버 1년 인기로 맞춘다(`live.js`). 네이버 성별·연령 조회는 호출 수 때문에 하지 않음.

### 장소 상세 창 (2026-11-14)

- "이런 걸 볼 수 있어요": 장소별 볼거리 요약(`tip`, 직접 작성). 기존 60곳은 `places.js TIPS`.
- 소개 글: 관광공사 공통정보 개요를 앞 2~3문장으로 줄여 표시(출처 표시). `app/data/details.json`에 캐시, 30일마다 갱신.
- "가는 날 근처 축제·공연": 장소 20km 안 행사 최대 5개. 누르면 축제 탭으로 옮겨 그 행사 상세를 열고 카드에 테두리 표시(`goto-event`, `ui.focusEvent`). 이동시간 필터 밖이면 축제 탭 맨 위에 따로 보여 줌.

## API 키 (2026-11-14 모두 발급·동작 확인)

키는 사용자 컴퓨터의 `.env`에만 있고 GitHub에는 없다(`.env.example`이 견본). `node tools/check-keys.mjs`로 키 값을 출력하지 않고 동작만 확인할 수 있다.

| 변수 | 출처 | 확인 결과 |
| --- | --- | --- |
| `DATA_GO_KR_KEY` | 공공데이터포털 일반 인증키(Decoding). 국문 관광정보·관광지 집중률 예측 공용 | 행사정보조회 정상 |
| `KAKAO_REST_KEY` | 카카오 디벨로퍼스 [플랫폼 키] | 로컬 키워드 검색, 모빌리티 자동차 길찾기 정상 |
| `KAKAO_JS_KEY` | 같은 곳. JavaScript SDK 도메인에 github.io와 localhost:5173 등록 | 지도 화면에서 확인 필요 |
| `NAVER_API_KEY_ID`, `NAVER_API_KEY` | NAVER API HUB(네이버 클라우드)의 Client ID / Client Secret | 블로그 검색, 검색어 트렌드 정상 |

주의:
- 네이버 검색·데이터랩은 2026-06-25부터 개발자센터가 아니라 **NAVER API HUB**에서만 제공된다. 호출 주소는 `https://naverapihub.apigw.ntruss.com` (`/search-trend/v1/search`, `/search/v1/blog`), 헤더는 `X-NCP-APIGW-API-KEY-ID`, `X-NCP-APIGW-API-KEY`. 종량제라 호출 수를 적게 유지할 것.
- 카카오맵 무료 쿼터는 개발자 계정의 첫 번째 활성화 앱에만 적용된다(2026-07-21 변경). [카카오맵] > [사용 설정] ON 필요.
- 관광지 집중률 예측 API는 호출 주소를 아직 확인하지 않아 검사하지 않았다.

## 실제 데이터 (2026-11-14 연결)

- `node tools/collect.mjs` → `app/data/places.json`, `app/data/events.json` 생성(키 없음). 앱은 `js/data/live.js`로 이 파일을 읽어 연습용 숫자를 덮어쓰고, 못 읽으면 연습용 데이터로 동작.
- 행사: 한국관광공사 행사정보조회(최근 120일 시작 + 아직 안 끝난 것). 모두 type 'festival'이라 축제 화면의 행사·전시·체험·공연 칩은 지금 비어 있음.
- 장소: 네이버 검색어 트렌드. 매 요청에 기준어 '남이섬'을 넣어 요청 간 비교. 성별 2 × 연령 묶음 4(19~29, 30대, 40대, 50+)를 앱의 연령 코드 1~11에 펼침. 1년 인기·최근 4주 추세는 주 단위(덜 찬 이번 주 제외). 블로그 수는 블로그 검색 total.
- 사진: 관광공사 키워드 검색의 대표 이미지(좌표 5km 이내만). 60곳 중 44곳, 나머지는 위키미디어 또는 분류 그림.
- 한 번 수집에 관광공사 약 10회(사진·소개는 30일 캐시), 네이버 약 180회(1년 인기 전체 + 성별·연령은 기존 60곳만 + 블로그 수는 7일 캐시) 호출. 네이버는 종량제.
- KOPIS가 가끔 400을 돌려줌: 3번 다시 시도하고, 그래도 안 되면 지난 공연 자료를 유지.
- 공연: KOPIS 아동 공연(kidstate=Y) 오늘~60일, 공연장 좌표는 카카오 로컬 키워드 검색으로 찾아 `app/data/venues.json`에 캐시. type 'stage', source 'kopis'. 출처 표기 의무 있음(앱 상세 창에 표시 중). 키는 3개월 미사용 시 취소되므로 매일 갱신이 사실상 유지 역할.
- **자동 갱신(2026-11-14 설정):** `.github/workflows/collect.yml`이 매일 한국 시간 05:00에 수집 → `app/data` 커밋 → gh-pages 게시. 키는 저장소 Secrets(DATA_GO_KR_KEY, NAVER_API_KEY_ID, NAVER_API_KEY, KOPIS_KEY, KAKAO_REST_KEY, KAKAO_JS_KEY)에 있음. Actions 화면에서 수동 실행 가능. 키를 바꾸면 `gh secret set -f .env -R holmes871217-hue/eodigaji`.
- 아직 연습용: 혼잡 예측(crowd), 아이 단계별 적합도(kid), 작은 장소 목록(19곳 수기), 이동시간(추정).

## 그다음 할 일

1. 실제 데이터 연결. 사용자가 받아야 할 키: 공공데이터포털(국문 관광정보 서비스_GW, 관광지 집중률 예측), 네이버 개발자센터(데이터랩 검색어트렌드, 검색), 카카오(지도, 로컬, 모빌리티 길찾기). 키는 `.env`에만 두고 절대 커밋하지 말 것(`.gitignore`에 등록됨). 키가 앱에 들어가지 않도록 수집은 GitHub Actions에서 하고 결과 JSON만 게시하는 구조를 계획함.
2. 이동시간을 카카오모빌리티 길찾기로 교체(현재는 직선거리 + 도심 혼잡 보정 추정).
3. 장소 사진을 한국관광공사 공식 사진으로 교체. 현재 사진 중 단양·양떼목장·꽃지해수욕장은 정확성이 불확실함.
4. 지도를 카카오맵으로 교체(현재 Leaflet + OpenStreetMap).

## 아직 검수하지 못한 것

- 실제 안드로이드 폰에서의 설치(홈 화면에 추가)와 "현재 위치 사용" 버튼
- 게시된 주소에서의 서비스 워커 동작(로컬에서는 서버를 끈 상태로 열리는 것 확인)
