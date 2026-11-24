# 골프몬 수집 서버 (서울, 플레이라이트)

골프몬은 한국 밖 접속을 막아서, 골프몬 작업(`.github/workflows/golfmon.yml`, 매일 03:30)이 이 서버(구글 클라우드 런 서울)에 물어 골프몬 화면을 받는다. Firecrawl 은 쓰지 않는다(2026-11-24 운영자 지시).
- `GET /golfmon/calendar` 양도 달력(지역·날짜별 매물 수) → 매물 있는 칸만 연다
- `GET /golfmon?day=YYYY-MM-DD&regions=9,1` 지역별 양도 목록 글
- `GET /golfmon/abroad` 해외 투어 목록
- 브라우저: 화면 없는 크롬 → 막히면 화면 있는 크롬(xvfb). 한 번에 한 요청, 천천히.

## 배포 (구글 클라우드 셸)
```
gcloud config set project project-8a98bd00-9abd-428d-9b0
cd ~ && rm -rf eodigaji-gm && git clone --depth 1 https://github.com/holmes871217-hue/eodigaji.git eodigaji-gm && cd eodigaji-gm/servers/golfmon && gcloud run deploy golfmon-collector --source . --region asia-northeast3 --allow-unauthenticated --memory 2Gi --cpu 1 --timeout 900 --concurrency 1 --max-instances 1 --quiet
```

## 한국 창구 (2026-11-24)
- `POST /browse` (헤더 `Authorization: Bearer <KR_BROWSER_TOKEN>`): 아무 공개 화면이나 한국(서울)에서 플레이라이트로 열어 글·HTML·링크·그림·JSON 응답·화면 사진을 돌려준다. 토큰 없는 요청은 거절.
  - 몸통: `{ "url": "...", "actions": [{"type":"wait","ms":2000},{"type":"click","selector":"..."},{"type":"scroll"}], "want": ["text","links","xhr"] }`
- 처음 한 번: 구글 클라우드 셸에서 `bash ~/eodigaji-gm/servers/golfmon/setup-kr.sh` → 토큰이 화면에 나온다. GitHub 비밀값 `KR_BROWSER_TOKEN` 에 넣는다.
- 그 뒤로는 `servers/golfmon/` 을 고쳐 main 에 올리면 GitHub(`.github/workflows/kr-browser-deploy.yml`)가 키 파일 없이(Workload Identity) 자동으로 다시 올린다. 클라우드 셸에 다시 들어갈 필요 없음.
