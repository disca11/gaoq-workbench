# 高全的工作台 —— Hugging Face Spaces (Docker) 部署
# Spaces 会自动注入 PORT（默认 7860）和 HOST，server.js 已读取，无需改动。
FROM node:18-alpine
WORKDIR /app
COPY . .
EXPOSE 7860
CMD ["node", "server.js"]
