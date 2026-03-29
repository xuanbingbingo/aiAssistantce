FROM node:20-alpine

WORKDIR /app

# 只复制依赖文件，利用缓存层
COPY package.json ./
RUN npm install --omit=dev

# 复制源码
COPY src/ ./src/

EXPOSE 3000

CMD ["node", "src/app.js"]
