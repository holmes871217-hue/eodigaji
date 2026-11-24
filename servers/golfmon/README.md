# 골프몬 수집 서버 (서울)

골프몬은 한국 밖 접속을 막아서, 매일 수집(GitHub, 미국)은 이 서버(구글 클라우드 런 서울)에 물어 골프몬 양도 목록 글자를 받는다.
- `GET /golfmon?day=YYYY-MM-DD&regions=9,1,8` → 지역별 화면 글자. 수집기 `tools/golf/collect.mjs` 가 `GOLFMON_SERVER` 주소로 부른다.
- 이 서버가 안 되면 수집기는 Firecrawl(한국 위치)로 받는다.

## 배포 (구글 클라우드 셸에서)
```
gcloud config set project project-8a98bd00-9abd-428d-9b0
cd ~ && rm -rf eodigaji-gm && git clone --depth 1 https://github.com/holmes871217-hue/eodigaji.git eodigaji-gm && cd eodigaji-gm/servers/golfmon && gcloud run deploy golfmon-collector --source . --region asia-northeast3 --allow-unauthenticated --memory 2Gi --cpu 1 --timeout 300 --concurrency 1 --max-instances 1 --quiet
```
