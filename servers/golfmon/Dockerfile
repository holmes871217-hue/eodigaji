# 플레이라이트 공식 이미지(크롬·가상 화면 xvfb 포함). package.json 의 playwright 버전과 같아야 한다.
FROM mcr.microsoft.com/playwright:v1.58.2-noble
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 NODE_ENV=production
# 화면 있는 크롬용 가상 화면(Xvfb). 서버는 바로 켜지고, 필요할 때만 Xvfb 를 띄운다
RUN apt-get update && apt-get install -y --no-install-recommends xvfb && rm -rf /var/lib/apt/lists/*
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server.mjs homepages.json ./
CMD ["node", "server.mjs"]
