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
