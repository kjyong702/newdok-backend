import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SocialAuthDto } from './social-auth.dto';

describe('SocialAuthDto', () => {
  const validateBody = async (body: Record<string, unknown>) => {
    const errors = await validate(plainToInstance(SocialAuthDto, body), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    return errors.map((error) => error.property);
  };

  it('앱 로그인은 idToken만으로 통과한다', async () => {
    await expect(
      validateBody({ provider: 'KAKAO', platform: 'IOS', idToken: 'id-token' }),
    ).resolves.toEqual([]);
  });

  it('앱 로그인에서 idToken이 없으면 실패한다', async () => {
    await expect(
      validateBody({ provider: 'KAKAO', platform: 'IOS' }),
    ).resolves.toEqual(['idToken']);
  });

  it('카카오 웹은 idToken 없이 authorizationCode와 localhost redirectUri로 통과한다', async () => {
    await expect(
      validateBody({
        provider: 'KAKAO',
        platform: 'WEB',
        authorizationCode: 'auth-code',
        redirectUri: 'http://localhost:3000/login',
      }),
    ).resolves.toEqual([]);
  });

  it('카카오 웹에서 authorizationCode와 redirectUri가 없으면 실패한다', async () => {
    await expect(
      validateBody({ provider: 'KAKAO', platform: 'WEB' }),
    ).resolves.toEqual(['authorizationCode', 'redirectUri']);
  });

  it('redirectUri가 URL 형식이 아니면 실패한다', async () => {
    await expect(
      validateBody({
        provider: 'KAKAO',
        platform: 'WEB',
        authorizationCode: 'auth-code',
        redirectUri: 'localhost:3000/login',
      }),
    ).resolves.toEqual(['redirectUri']);
  });

  it('애플 웹은 idToken이 필수이고 redirectUri는 선택이다', async () => {
    await expect(
      validateBody({
        provider: 'APPLE',
        platform: 'WEB',
        authorizationCode: 'code',
      }),
    ).resolves.toEqual(['idToken']);
    await expect(
      validateBody({
        provider: 'APPLE',
        platform: 'WEB',
        idToken: 'id-token',
        authorizationCode: 'code',
        redirectUri: 'https://newdok.vercel.app/login',
      }),
    ).resolves.toEqual([]);
  });
});
