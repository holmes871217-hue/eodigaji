# 플레이라이트 공식 이미지(크롬 포함). package.json 의 playwright 버전과 같아야 한다.
FROM mcr.microsoft.com/playwright:v1.58.2-noble
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server.mjs ./
CMD ["node", "server.mjs"]
