import {
  InternalServerErrorException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KakaoAuthService } from './kakao-auth.service';

describe('KakaoAuthService', () => {
  const createService = (config: Record<string, string>) => {
    const configService = {
      get: jest.fn((key: string) => config[key]),
    } as unknown as ConfigService;

    return new KakaoAuthService(configService);
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('Admin Key와 회원번호로 카카오 unlink API를 호출한다', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ id: 123456789 }),
    } as Response);
    const service = createService({ KAKAO_ADMIN_KEY: 'test-admin-key' });

    await service.unlinkUser('123456789');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    const params = init.body as URLSearchParams;

    expect(url).toBe('https://kapi.kakao.com/v1/user/unlink');
    expect(headers.Authorization).toBe('KakaoAK test-admin-key');
    expect(params.get('target_id_type')).toBe('user_id');
    expect(params.get('target_id')).toBe('123456789');
  });

  it('unlink 요청이 실패하면 ServiceUnavailableException을 던진다', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      text: async () => '{"msg":"NotRegisteredUserException","code":-102}',
    } as Response);
    const service = createService({ KAKAO_ADMIN_KEY: 'test-admin-key' });

    await expect(service.unlinkUser('123456789')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('KAKAO_ADMIN_KEY가 없으면 InternalServerErrorException을 던진다', async () => {
    const service = createService({});

    await expect(service.unlinkUser('123456789')).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  describe('exchangeAuthorizationCode', () => {
    it('REST API 키와 Client Secret으로 인가 코드를 교환해 idToken을 반환한다', async () => {
      const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'access',
          id_token: 'kakao-id-token',
        }),
      } as Response);
      const service = createService({
        KAKAO_REST_API_KEY: 'test-rest-key',
        KAKAO_CLIENT_SECRET: 'test-client-secret',
      });

      await expect(
        service.exchangeAuthorizationCode(
          'auth-code',
          'http://localhost:3000/login',
        ),
      ).resolves.toBe('kakao-id-token');

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const params = init.body as URLSearchParams;

      expect(url).toBe('https://kauth.kakao.com/oauth/token');
      expect(params.get('grant_type')).toBe('authorization_code');
      expect(params.get('client_id')).toBe('test-rest-key');
      expect(params.get('client_secret')).toBe('test-client-secret');
      expect(params.get('redirect_uri')).toBe('http://localhost:3000/login');
      expect(params.get('code')).toBe('auth-code');
    });

    it('Client Secret이 없으면 client_secret 없이 요청한다', async () => {
      const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ id_token: 'kakao-id-token' }),
      } as Response);
      const service = createService({ KAKAO_REST_API_KEY: 'test-rest-key' });

      await service.exchangeAuthorizationCode(
        'auth-code',
        'http://localhost:3000/login',
      );

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect((init.body as URLSearchParams).has('client_secret')).toBe(false);
    });

    it('카카오가 에러를 반환하면 에러 본문을 담아 UnauthorizedException을 던진다', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        text: async () => '{"error":"invalid_grant","error_code":"KOE320"}',
      } as Response);
      const service = createService({ KAKAO_REST_API_KEY: 'test-rest-key' });

      await expect(
        service.exchangeAuthorizationCode(
          'used-code',
          'http://localhost:3000/login',
        ),
      ).rejects.toThrow(/KOE320/);
    });

    it('토큰 응답에 id_token이 없으면 UnauthorizedException을 던진다', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: 'access' }),
      } as Response);
      const service = createService({ KAKAO_REST_API_KEY: 'test-rest-key' });

      await expect(
        service.exchangeAuthorizationCode(
          'auth-code',
          'http://localhost:3000/login',
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('KAKAO_REST_API_KEY가 없으면 InternalServerErrorException을 던진다', async () => {
      const service = createService({});

      await expect(
        service.exchangeAuthorizationCode(
          'auth-code',
          'http://localhost:3000/login',
        ),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });
});
