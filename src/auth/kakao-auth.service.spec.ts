import {
  InternalServerErrorException,
  ServiceUnavailableException,
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
});
