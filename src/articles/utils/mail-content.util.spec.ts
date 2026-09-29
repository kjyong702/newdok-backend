import { buildArticleContent, unstuffPop3Response } from './mail-content.util';

describe('mail-content.util', () => {
  describe('unstuffPop3Response (RFC 1939 byte-stuffing 복원)', () => {
    it("'.'으로 시작하는 줄에서 점 하나만 제거한다", () => {
      expect(unstuffPop3Response('a\r\n..b\r\n...c\r\nd.e\r\n')).toBe(
        'a\r\n.b\r\n..c\r\nd.e\r\n',
      );
    });

    it('응답 첫 줄과 LF 줄바꿈에도 같은 규칙을 적용한다', () => {
      expect(unstuffPop3Response('..x\r\ny')).toBe('.x\r\ny');
      expect(unstuffPop3Response('a\n..b')).toBe('a\n.b');
    });

    it('줄 중간의 점은 건드리지 않는다', () => {
      const text = 'see..you\r\nend. cdn.sanity.io\r\n';
      expect(unstuffPop3Response(text)).toBe(text);
    });
  });

  describe('buildArticleContent', () => {
    it('본문/미리보기/순수텍스트를 수집기 규칙대로 만든다', () => {
      const html =
        '<style>@media (max-width:600px){.a{}}</style>' +
        '<p class="stb-bold">첫 번째 문장은 열 글자 이상입니다</p>' +
        '<p class="stb-bold">두 번째 문장도 열 글자 이상입니다</p>' +
        '<p class="stb-bold">세 번째 문장 역시 열 글자 이상</p>';

      const content = buildArticleContent(html);

      expect(content.body).toBe(html);
      expect(content.firstTwoBody).toBe(
        '두 번째 문장도 열 글자 이상입니다 세 번째 문장 역시 열 글자 이상',
      );
      expect(content.plainBody).toBe(
        '첫 번째 문장은 열 글자 이상입니다 두 번째 문장도 열 글자 이상입니다 세 번째 문장 역시 열 글자 이상',
      );
    });

    it('추출할 문장이 없으면 미리보기는 빈 문자열이다', () => {
      expect(buildArticleContent('').firstTwoBody).toBe('');
    });
  });
});
