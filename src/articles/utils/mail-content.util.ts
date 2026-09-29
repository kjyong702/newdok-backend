import { parse } from 'node-html-parser';

// POP3 멀티라인 응답(RETR/TOP)의 byte-stuffing을 되돌린다 (RFC 1939 §3).
// 서버는 '.'으로 시작하는 줄 앞에 '.'을 하나 더 붙여 보내고, 클라이언트가 떼어내야 한다.
// node-pop3(0.9.x)는 종결 표시(CRLF.CRLF)만 제거하고 이 복원을 하지 않으므로 여기서 수행한다.
// 복원하지 않으면 quoted-printable 메일의 줄바꿈 위치에 있던 점이 '..'으로 남아
// URL(cdn..sanity.io)과 CSS 선택자(..wrap{})가 깨진다.
// 주의: 응답 원문에 정확히 한 번만 적용한다. 두 번 적용하면 원래 '.'으로 시작하던 줄의 점까지 사라진다.
export function unstuffPop3Response(raw: string): string {
  return raw.replace(/(^|\n)\./g, '$1');
}

// 아티클 미리보기(두 문장) 추출. 수집기와 복구 스크립트가 같은 규칙을 쓰도록 공용화했다.
export function extractTwoSentenceOfArticle(
  articleBody: string,
): string | undefined {
  const root = parse(articleBody);

  const selectedElements = root.querySelectorAll(
    '.stb-fore-colored, .stb-bold',
  );
  const elements =
    selectedElements.length === 0
      ? root.getElementsByTagName('*')
      : selectedElements;

  const filteredElements = elements.filter((element) => {
    const style = element.getAttribute('style');
    const hasColorStyle = style && style.includes('color');
    const isBlackText = style && style.includes('color: #000000;');

    const hasHref = element.getAttribute('href');

    const isValidText =
      /[가-힣]/.test(element.text) && element.text.length > 10;

    return !hasHref && (!hasColorStyle || isBlackText) && isValidText;
  });

  return filteredElements.length > 2
    ? filteredElements[1].text + ' ' + filteredElements[2].text
    : filteredElements[0]?.text;
}

// 메일 HTML로부터 Article 저장 필드(body / firstTwoBody / plainBody)를 만든다.
export function buildArticleContent(html: string) {
  // 본문 미리보기 텍스트 생성
  const firstTwoBody = extractTwoSentenceOfArticle(html);
  // 아티클 본문에서 순수 텍스트 추출
  const plainBody = html
    .replace(/<style[^>]*>@media[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return { body: html, firstTwoBody: firstTwoBody || '', plainBody };
}
