#!/usr/bin/env bash
# 한국 창구 한 번만 설정 (구글 클라우드 셸에서 실행)
# 1) 서울 서버(golfmon-collector)를 비밀 토큰과 함께 올린다
# 2) GitHub 이 키 파일 없이(Workload Identity) 이 서버를 자동으로 다시 올릴 수 있게 권한을 만든다
set -euo pipefail
PROJECT=project-8a98bd00-9abd-428d-9b0
REGION=asia-northeast3
REPO=holmes871217-hue/eodigaji
SA_NAME=kr-deployer
SA="$SA_NAME@$PROJECT.iam.gserviceaccount.com"
gcloud config set project "$PROJECT" >/dev/null
PNUM=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
echo "▶ 필요한 기능 켜기"
gcloud services enable iamcredentials.googleapis.com sts.googleapis.com run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com --quiet
echo "▶ GitHub 배포용 계정"
gcloud iam service-accounts describe "$SA" >/dev/null 2>&1 || gcloud iam service-accounts create "$SA_NAME" --display-name="GitHub 자동 배포(한국 창구)"
for r in roles/run.admin roles/cloudbuild.builds.editor roles/artifactregistry.admin roles/storage.admin roles/iam.serviceAccountUser roles/serviceusage.serviceUsageConsumer roles/logging.viewer; do
  gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$SA" --role="$r" --condition=None --quiet >/dev/null
done
echo "▶ GitHub 연결(키 파일 없음)"
gcloud iam workload-identity-pools describe github --location=global >/dev/null 2>&1 || gcloud iam workload-identity-pools create github --location=global --display-name="GitHub"
gcloud iam workload-identity-pools providers describe eodigaji --location=global --workload-identity-pool=github >/dev/null 2>&1 || \
  gcloud iam workload-identity-pools providers create-oidc eodigaji --location=global --workload-identity-pool=github \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
    --attribute-condition="assertion.repository=='$REPO'"
gcloud iam service-accounts add-iam-policy-binding "$SA" --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$PNUM/locations/global/workloadIdentityPools/github/attribute.repository/$REPO" --quiet >/dev/null
echo "▶ 서울 서버 올리기(5~10분)"
TOKEN=$(openssl rand -hex 24)
cd "$(dirname "$0")"
gcloud run deploy golfmon-collector --source . --region "$REGION" --allow-unauthenticated --memory 2Gi --cpu 1 --timeout 900 --concurrency 1 --max-instances 1 --update-env-vars "KR_BROWSER_TOKEN=$TOKEN" --quiet
echo
echo "================ 끝 ================"
echo "아래 토큰을 복사해 두세요(채팅에 붙이지 마세요):"
echo "$TOKEN"
echo "===================================="
