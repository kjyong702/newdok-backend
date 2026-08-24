// 운영용 API(미등록 발신자 조회, 발신자 등록 등)에 접근 가능한 master 계정의 userId.
// dev/prod 모두 master(kjyong702)가 id=1이며, 환경변수 ADMIN_USER_ID로 재정의할 수 있다.
export const ADMIN_USER_ID = Number(process.env.ADMIN_USER_ID ?? 1);
