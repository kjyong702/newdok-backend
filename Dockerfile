FROM node:22.12.0

WORKDIR /usr/src/newdok-backend
ENV NODE_ENV=production

COPY . .

RUN npm ci
RUN npx prisma generate
RUN npm run build

CMD ["node", "dist/src/main.js"]
