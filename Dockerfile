FROM node:20

WORKDIR /usr/src/newdok-backend

COPY . .

RUN npm install
RUN npx prisma generate
RUN npm run build

CMD ["node", "dist/main.js"]