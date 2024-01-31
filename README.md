<div align="center">

![image](https://kr.object.ncloudstorage.com/newdok-bucket/%EB%89%B4%EB%8F%85%20%EB%A1%9C%EA%B3%A0%28300x100%29.png)

## ✨ 2539 직장인을 위한 뉴스레터 큐레이팅 서비스, Newdok!

<br />

![image](https://kr.object.ncloudstorage.com/newdok-bucket/%EB%89%B4%EB%8F%85%20%ED%94%84%EB%A6%AC%EB%B7%B0%282000x1000%29.png)

</div>


## 💡 Description

뭘 구독해야 나한테 도움이 될지 모르겠어 많아도 너~무 많은 뉴스레터 브랜드들🤯

내게 필요한 뉴스레터가 맞는지 판단하기도 힘들고, 마음에 드는 뉴스레터를 찾기도 어렵죠?

이젠 뉴독이 내게 필요한 뉴스레터만 쏙쏙! 뽑아 큐레이션 해드릴게요.

내 관심사와 필요에 따라 도움이 될 수 있는 뉴스레터를 추천받고, 한 번에 구독 신청까지!

지금 바로 내게 필요한 뉴스레터를 추천 받아보세요.


## 👀 서비스 핵심 기능 소개

### 온보딩

첫 실행 시 맞춤형 서비스 제공을 위해 사용자의 취향을 파악합니다. <br/>

### 추천 뉴스레터

사용자가 고른 산업군과 관심사를 바탕으로 최적/차선 추천 뉴스레터 리스트를 메인화면에 반영합니다. <br/>

### 뉴스레터 둘러보기

산업별, 요일별로 분류된 모든 뉴스레터 미리보기, 지난 아티클 보기, 구독하기 등 상세페이지를 제공합니다. <br/>

### 개인 아티클 수신함

구독신청한 뉴스레터로부터 수신받은 아티클을 날짜별로 관리하는 개인 우편함을 제공합니다. <br/>

<br />


## 📐 Server Architecture

<img width="80%" src="https://kr.object.ncloudstorage.com/newdok-bucket/%EC%84%9C%EB%B2%84%20%EC%95%84%ED%82%A4%ED%85%8D%EC%B2%98%28%EC%8B%A0%EB%B2%84%EC%A0%84%29.png"/>

<br />


# ⚒️ ERD

![image](https://kr.object.ncloudstorage.com/newdok-bucket/%EB%89%B4%EB%8F%85%20ERD%28%EC%B5%9C%EC%A2%85%29.png)

<br />


# 🗃️ package.json

```
{
  "name": "newdok-backend",
  "version": "0.0.1",
  "description": "",
  "author": "",
  "private": true,
  "license": "UNLICENSED",
  "scripts": {
    "build": "nest build",
    "format": "prettier --write \"src/**/*.ts\" \"test/**/*.ts\"",
    "start": "cross-env NODE_ENV=development nest start --watch",
    "deploy:dev": "cross-env sudo NODE_ENV=development PORT=80 pm2 start dist/main.js",
    "deploy:prod": "cross-env sudo NODE_ENV=production PORT=80 node dist/main.js",
    "db-push:dev": "dotenv -e .development.env -- npx prisma db push",
    "db-pull:dev": "dotenv -e .devleopment.env -- npx prisma db pull",
    "db-pull:prod": "dotenv -e .production.env -- npx prisma db pull",
    "db-studio:dev": "dotenv -e .development.env -- npx prisma studio",
    "db-studio:prod": "dotenv -e .production.env -- npx prisma studio"
  },
  "dependencies": {
    "@nestjs/common": "^9.0.0",
    "@nestjs/config": "^3.1.1",
    "@nestjs/core": "^9.0.0",
    "@nestjs/platform-express": "^9.0.0",
    "@nestjs/schedule": "^3.0.2",
    "@nestjs/swagger": "^6.3.0",
    "@prisma/client": "^5.8.1",
    "bcrypt": "^5.1.0",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.14.0",
    "cross-env": "^7.0.3",
    "dotenv-cli": "^7.3.0",
    "mailparser": "^3.6.4",
    "node-pop3": "^0.9.0",
    "reflect-metadata": "^0.1.13",
    "rxjs": "^7.2.0"
  },
  "devDependencies": {
    "@nestjs/cli": "^9.0.0",
    "@nestjs/jwt": "^10.1.0",
    "@nestjs/schematics": "^9.0.0",
    "@nestjs/testing": "^9.0.0",
    "@types/bcrypt": "^5.0.0",
    "@types/crypto-js": "^4.1.1",
    "@types/express": "^4.17.13",
    "@types/jest": "29.2.4",
    "@types/mailparser": "^3.4.0",
    "@types/node": "18.11.18",
    "@types/supertest": "^2.0.11",
    "@typescript-eslint/eslint-plugin": "^5.0.0",
    "@typescript-eslint/parser": "^5.0.0",
    "crypto-js": "^4.1.1",
    "eslint": "^8.0.1",
    "eslint-config-prettier": "^8.3.0",
    "eslint-plugin-prettier": "^4.0.0",
    "jest": "29.3.1",
    "prettier": "^2.3.2",
    "prisma": "^5.8.1",
    "source-map-support": "^0.5.20",
    "supertest": "^6.1.3",
    "ts-jest": "29.0.3",
    "ts-loader": "^9.2.3",
    "ts-node": "^10.0.0",
    "tsconfig-paths": "4.1.1",
    "typescript": "^4.7.4"
  },
  "jest": {
    "moduleFileExtensions": [
      "js",
      "json",
      "ts"
    ],
    "rootDir": "src",
    "testRegex": ".*\\.spec\\.ts$",
    "transform": {
      "^.+\\.(t|j)s$": "ts-jest"
    },
    "collectCoverageFrom": [
      "**/*.(t|j)s"
    ],
    "coverageDirectory": "../coverage",
    "testEnvironment": "node"
  }
}



```
