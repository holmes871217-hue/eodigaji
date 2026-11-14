# 인수인계 문서 (새 세션·다른 AI는 이 문서만 읽고 시작)

마지막 정리: 2026-11-14

## 사용자

- 코딩을 모르는 일반인. 한국어로, 쉬운 말 + 전문용어 괄호 병기.
- 결과물은 먼저 직접 검수해서 이상 없을 때만 보여 줄 것.
- 사무적·투박한 디자인을 싫어함. 사진이 있어야 함.
- 사용자에게 페이지를 열어 줄 때는 크롬(Claude in Chrome). 검수는 앱 안 브라우저.
- 키는 채팅에 붙이지 않고 `.env`에 직접 넣음(메모장으로 열어 줌). 키 값을 출력하지 말 것.

## 앱

"놀픽"(2026-11-14에 "어디가지"에서 이름 변경): 아빠가 주말·연차에 아이와 갈 곳을 고르는 안드로이드용 웹앱(PWA). 지인에게만 QR로 공유.
화면에 보이는 이름만 바꿨다. 주소·저장소 이름(`eodigaji`), 저장 키(`eodigaji.v1`), 캐시 이름은 그대로 둔다(바꾸면 QR·사용자 설정이 끊긴다).

- 앱 주소: https://holmes871217-hue.github.io/eodigaji/
- 저장소: https://github.com/holmes871217-hue/eodigaji (공개)
- 기획서: https://claude.ai/artifact/1VHpiij1ATNAUP41ZPmQgt
- 디자인: https://claude.ai/artifact/7V2sXf3aW4nEsJ2hXtJMwm (3번 "소프트 플레이" 적용됨)

## 구조 (빌드 도구 없음, 순수 HTML/CSS/JS 모듈)

- `app/` 앱 본체. 이 폴더만 게시됨.
  - `css/tokens.css` 디자인 토큰, `css/app.css` 화면 스타일
  - `js/main.js` 상태 → 계산 → 그리기 → 누르는 동작(`data-action`)
  - `js/core/` scoring(추천 점수), geo(거리·이동시간 추정), store(localStorage `eodigaji.v1`), locate, search(위치 검색), nearby(근처 맛집·카페), favs(찜 목록), dates, segments
  - `js/data/` places(직접 고른 60곳 + TIPS + 분류 기본값), places-local(자동 생성 179곳), events·deals(연습용), photos, live(실제 데이터 병합)
  - `js/ui/` home, events, favs(찜 탭), deals, mypage, sheet(상세 창), map(Leaflet + OSM), sortable(끌어서 순서 바꾸기), util
  - `js/config.js` 웹에 공개되는 키 두 개만: 카카오 JavaScript 키(도메인 제한), 구글 Places 키(웹사이트·API 제한을 건 뒤 2026-11-15에 넣음). **다른 키는 절대 넣지 말 것**
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

푸시는 `gh auth git-credential`을 credential helper로 지정해서 한다(gh: `C:\Program Files\GitHub CLI\gh.exe`, node: `C:\Program Files\nodejs\node.exe`). 커밋 전 `.env`의 키 값이 추적 파일에 섞이지 않았는지 grep으로 확인(카카오 JS 키와 구글 Places 키만 `app/js/config.js`에 허용).

## 키 (`.env`, GitHub Secrets)

| 변수 | 용도 | 상태 |
| --- | --- | --- |
| `DATA_GO_KR_KEY` | 공공데이터포털(관광공사 KorService2) | 동작. 하루 1,000회 한도 |
| `KAKAO_REST_KEY` | 카카오 로컬 검색·모빌리티 | 동작 |
| `KAKAO_JS_KEY` | 카카오 지도 SDK(앱 안 위치 검색) | github.io 도메인 등록됨(200). `http://localhost:5173`은 미등록이라 로컬에서는 OSM 검색으로 동작 |
| `NAVER_API_KEY_ID`, `NAVER_API_KEY` | NAVER API HUB(검색 트렌드·블로그). 종량제 | 동작. 하루 약 180회 |
| `KOPIS_KEY` | 공연 일정 | 동작. 2027-11 연장 신청 필요 |
| `GOOGLE_PLACES_KEY` | 구글 Places API (New), 근처 맛집·카페 평점 | 2026-11-15 사용자가 콘솔에서 제한을 걸었고(확인: 출처 없이·다른 사이트에서는 403, `https://holmes871217-hue.github.io/*`에서만 200, 다른 API는 거부), `app/js/config.js`에 넣음. 하루 한도 설정 여부는 내가 확인 못 함. 로컬(localhost)에서는 거부되므로 평점은 게시된 주소에서만 확인 가능. node로 시험할 때는 `Referer` 헤더를 앱 주소로 보내야 함 |

키를 바꾸면 `gh secret set -f .env -R holmes871217-hue/eodigaji`.

주의: 네이버 검색·데이터랩은 NAVER API HUB(`https://naverapihub.apigw.ntruss.com`, 헤더 `X-NCP-APIGW-API-KEY-ID`/`X-NCP-APIGW-API-KEY`)에서만 제공. 카카오 주소에 광주는 "전남광주통합특별시", 인천 중구는 제물포구·영종구로 나옴(2026 행정구역 변경).

## 데이터 (수집기 `tools/collect.mjs`)

- 축제: 관광공사 `searchFestival2`. 공연: KOPIS 아동 공연 60일치 + 카카오로 공연장 좌표(`venues.json` 캐시). KOPIS가 가끔 400 → 3회 재시도, 실패 시 지난 자료 유지.
- 직접 고른 60곳: 네이버 성별·연령대별 인기, 1년 인기, 최근 4주 추세(기준어 '남이섬'), 블로그 수(7일 캐시).
- 전국 소소한 곳 179곳(`places-local.js`): 네이버 1년 인기·추세만. 성별·연령 모양은 분류 기본값(`CAT_DEFAULT`).
- 사진·소개: 관광공사 `searchKeyword2` + `detailCommon2` 개요 앞 2~3문장(`details.json`, 30일 캐시).
- 사진 여러 장: 관광공사 `detailImage2`(대표 사진 + 최대 9장 → `photos` 배열, `places.json`·`spots.json`에 저장). 한 번 실행에 300곳까지. 직접 고른 239곳 중 197곳 완료. 카카오 동네 장소는 등록 155곳 중 29곳만 받았고 나머지는 매일 자동으로 이어받음(번호 `cid`를 다시 찾느라 하루 150곳). 사진만 받기: `node tools/collect.mjs --photos`(네이버·축제는 안 건드림).
- 주차 안내: 관광공사 `detailIntro2`(종류 번호 `ctype`이 필요해서 없으면 `detailCommon2`로 먼저 찾음) → `parking`, `parkingFee`. 한 번 실행에 300곳까지. 2026-11-15 기준 직접 고른 239곳 중 167곳, 카카오 동네 장소 115곳에 안내 있음. `--photos` 실행에 함께 들어 있음.
- 관광공사 호출 한도는 기능(오퍼레이션)별로 따로 센다(2026-11-14 확인: `searchKeyword2`가 429여도 `detailImage2`는 동작).
- 카카오 동네 장소 약 1,850곳(`spots.json`): 47개 거점 × 16개 검색어, 7일마다. 관광공사 등록 여부를 하루 400곳씩 확인(등록이면 점수 +15, 사진·소개). 앱에서는 직접 고른 곳보다 낮게(등록 ×0.75, 미등록 ×0.5).
- 아직 연습용: 혼잡 예측(crowd), 아이 단계별 적합도(kid), 이동시간(직선거리 + 도심 보정 추정), 특가 탭.

## 화면에서 확정된 것

- 마이 탭 순서: 언제·얼마나 → 어떤 곳 → 주요 검색 위치 → 함께 가는 사람.
- 주요 검색 위치: 검색칸(카카오 → OSM → 앱 안 이름), "현재 위치 사용", 지도에서 고르기. 고르면 지도 핀도 그 위치로 이동.
- 추천 탭: "가까운 소소한 곳 / 전체 / 큰 나들이". 지도 첫 화면은 가로 10km.
- 장소 상세: 사진 옆으로 넘겨 보기(최대 10장, 왼쪽 아래 "3 / 10" 표시), 볼거리 요약(`tip`), 관광공사 소개, 가는 날 근처 축제·공연.
- 추천 카드의 "근처 …" 축제 표시는 상세 창 "가는 날 근처 축제·공연" 목록(20km 안, 가까운 순 5개)의 1번과 항상 같다. 둘 다 `scoring.js`의 `nearbyEvents()` 하나를 쓴다(예전엔 카드가 검색 위치에서 가까운 행사를 골라 서로 달랐음, 2026-11-15 수정).
- 근처 축제·공연을 누르면 탭을 옮기지 않고 장소 창 위에 행사 창이 열린다(버튼이 "닫기" 대신 "뒤로"). 뒤로 가면 보던 위치 그대로 장소 창으로 돌아온다.
- 주차: 장소 상세에 주차 안내(가능/불가/무료, 요금, "근처 주차장" 네이버 지도 버튼), 추천 카드에 "주차 가능/무료/불가" 표시. 자료는 관광공사 `detailIntro2`(이름이 `parking…`인 칸). 글 다듬기는 `sheet.js`의 `parkingInfo()`.
- 근처 맛집·카페: 장소 상세의 두 버튼 → 5곳 목록 창(`{ type: 'shops', id, kind }`) → 가게를 누르면 네이버 지도 검색. 찾기는 `js/core/nearby.js`. 구글 Places(New) `searchNearby`로 반경 3km(가게가 적으면 10km) 20곳을 받아 "평점(리뷰 20개 분량의 4.0점을 섞어 보정) − 1km당 0.15점"으로 5곳을 고름. 구글 키가 없거나 실패하면 카카오 분류 검색(FD6·CE7)으로 가까운 순 5곳(평점 없음). 결과는 앱을 켜 둔 동안만 기억(구글 약관상 저장 금지).
- 구글 키는 `config.js`의 `GOOGLE_PLACES_KEY`. 구글이 실패하면(한도 초과·로컬) 자동으로 카카오 가까운 순으로 나온다. 평점 계산은 node로 `viaGoogle(place, kind, key)` 확인.
- 찜 탭(축제와 특가 사이): 추천 카드·축제 카드·장소/행사 상세 창·맛집/카페 목록의 ♥로 담는다. `state.favs`(담은 순서 = 동선 순서, 최대 30곳, localStorage 저장, 이름·좌표를 같이 적어 둠 — 가게는 평점을 저장하지 않음).
  - 위: 지도(`map.js`의 `mountRoute`, 번호 핀 + 순서대로 이은 점선 + 검색 위치). 아래: 순서 목록. 오른쪽 손잡이(≡)를 끌거나 손잡이에서 위·아래 화살표로 순서 변경(`sortable.js`, 포인터 이벤트라 터치·마우스 모두). "가까운 순으로 정리"는 검색 위치에서 출발하는 가장 가까운 곳 잇기.
  - 네이버 평점은 가져올 수 없음(네이버 지역검색 API·API HUB·지도 API 모두 평점 필드가 없고, 지도 페이지를 긁어 오는 건 약관 위반·불안정). 그래서 평점은 구글, 가게 링크는 네이버로 하되 이름 불일치를 줄이려고 `nearby.js`의 `matchNaverNames`가 구글 가게를 같은 자리(200m) 카카오 장소와 이어 카카오(=네이버와 거의 같은) 이름 `nq`로 네이버 지도를 검색한다. 못 찾으면 `cleanShopName`으로 "/ English"·영문 꼬리를 뗀 이름. 구글 지도 정확 링크(`gid`, query_place_id)는 가게 줄 오른쪽 아래 "구글 지도" 칩. 시험(2026-11-15, 4개 관광지 39곳): 카카오가 32곳 찾음, 12곳은 이름이 구글과 달랐음. 네이버 지도 쪽 실제 검색 결과는 내장 브라우저가 map.naver.com을 막아 직접 확인 못 함.
  - 주차 박스의 "근처 주차장" 버튼은 처음엔 네이버에 "장소이름 주차장"을 검색하게 했는데 "찾을 수 없음"이 나와서(2026-11-15 사용자 제보), 카카오 분류 검색 PK6으로 실제 주차장 5곳을 찾아 맛집·카페와 같은 목록 창(`kind: 'park'`)에 보여 주고 누르면 그 이름으로 네이버 지도를 연다. 평점이 없어 구글은 안 씀. "전용·아파트·교회·학교" 등과 이름이 그냥 "주차장"인 곳은 제외, 공영이거나 이름에 장소 이름이 든 곳은 500m 가까운 것처럼 앞에 둠. 시험: 한국민속촌·남이섬·서울숲·전주한옥마을·대관령 모두 5곳씩 나옴.
  - 목록을 누르면 장소·행사는 상세 창, 가게와 지금 날짜 목록에 없는 행사는 네이버 지도. 하트를 누를 때는 화면을 다시 그리지 않고 하트 모양만 바꾼다(상세 창 스크롤 유지). 찜 탭에서만 다시 그림.
- 뒤로 가기: 상세 창을 열 때마다 `history.pushState({ sheets })`로 방문 기록을 쌓고 `popstate`에서 닫는다(`main.js`의 openSheet/closeSheet). 닫기 버튼·바깥 누르기·Esc 도 뒤로 가기 한 번과 같다. 창이 없을 때 뒤로 가기는 앱 종료(기본 동작).

## 다음 할 일 (우선순위 순)

1. (2026-11-15 확인 완료: 게시된 주소에서 구글 평점·리뷰 수가 뜨고, 찜·끌어서 순서 바꾸기·새로고침 후 유지 모두 동작) 남은 일: **구글 콘솔 하루 한도**를 사용자가 걸었는지 확인(SearchNearby 30회/일 권장). 구글 콘솔의 하루 한도(SearchNearby 30회/일 권장, 평점 포함 무료는 월 1,000회)를 사용자가 걸었는지 물어볼 것. 구글은 결과 저장을 제한하므로(장소 ID만 장기 저장 가능) 수집기에서 모으지 말 것.
2. **티맵 "기초지자체 중심 관광지 정보"**(`https://apis.data.go.kr/B551011/LocgoHubTarService1/areaBasedList1`, data.go.kr 15128559): 사용자 활용신청 대기. 승인되면 응답 필드를 확인해 시군구별 100위 순위를 장소 점수에 반영.
3. 카카오 콘솔에 `http://localhost:5173` 도메인 추가(로컬 검수용, 선택).
4. 마이 탭 지도는 한 번 눌러야 움직이게(스크롤 중 지도 건드림 방지). 제안만 했고 답 없음.
5. 이동시간을 카카오모빌리티 길찾기로(키를 숨길 중계 서버 필요).
6. 실제 안드로이드 폰에서 설치·현재 위치·검색·뒤로 가기·사진 넘기기 확인(아직 미검수. 뒤로 가기와 사진은 앱 안 브라우저에서만 확인).
7. 관광공사에 없는 곳(롯데월드 등 42곳 + 카카오 미등록 장소)은 사진이 1장이거나 없음. 더 채우려면 구글 Places 사진(1번)이 후보.
