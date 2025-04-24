import { Injectable } from '@nestjs/common';
import twilio from 'twilio';

@Injectable()
export class AuthService {
  async sendTwilioSMS(phoneNumber: string) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

    require('dotenv').config();
    const client = twilio(accountSid, authToken);

    try {
      const verifyCode = Math.floor(Math.random() * (999999 - 100000)) + 100000;
      await client.messages.create({
        body: `[뉴독] 인증번호[${verifyCode}] 타인에게 절대 알려주지 마세요.`,
        messagingServiceSid,
        to: `+82${phoneNumber}`,
      });
      return {
        code: verifyCode,
      };
    } catch (error) {
      console.error(error);
      throw new Error('SMS 요청 실패');
    }
  }
}
