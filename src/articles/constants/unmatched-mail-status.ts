export const UNMATCHED_MAIL_STATUS = {
  // 발신자 등록 대기 중 (등록되면 다음 POP3 사이클에서 자동 회수)
  PENDING: 'PENDING',
  // 회수 불가 (메일함에서 원본이 사라졌거나 발신자 주소가 없는 메일)
  UNRECOVERABLE: 'UNRECOVERABLE',
} as const;

export type UnmatchedMailStatus =
  (typeof UNMATCHED_MAIL_STATUS)[keyof typeof UNMATCHED_MAIL_STATUS];
