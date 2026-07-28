import { USER_CONSENT_POLICY } from './user-consent-policy';
import { USER_CONSENT_TYPE } from './user-consent-type';

describe('USER_CONSENT_POLICY', () => {
  it('마케팅 정보 수신 동의만 선택 항목으로 관리한다', () => {
    expect(
      USER_CONSENT_POLICY[
        USER_CONSENT_TYPE.MARKETING_INFORMATION_RECEIPT
      ].isRequired,
    ).toBe(false);

    expect(
      USER_CONSENT_POLICY[USER_CONSENT_TYPE.AGE_CONFIRMATION_OVER_14]
        .isRequired,
    ).toBe(true);
    expect(
      USER_CONSENT_POLICY[USER_CONSENT_TYPE.TERMS_OF_SERVICE].isRequired,
    ).toBe(true);
    expect(
      USER_CONSENT_POLICY[
        USER_CONSENT_TYPE.PERSONAL_INFORMATION_COLLECTION_AND_USE
      ].isRequired,
    ).toBe(true);
  });
});
