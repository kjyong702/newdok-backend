import { Injectable } from '@nestjs/common';
import CryptoJS from 'crypto-js';
import { TwilioService } from 'nestjs-twilio';

@Injectable()
export class AuthService {
  public constructor(private readonly twilioService: TwilioService) {}

  async sendTwilioSMS(phoneNumber: string) {
    const fromNumber = process.env.TWILIO_FROM_NUMBER || '';

    try {
      const verifyCode = Math.floor(Math.random() * (999999 - 100000)) + 100000;
      await this.twilioService.client.messages.create({
        body: `인증번호 [${verifyCode}]를 입력해주세요.`,
        from: fromNumber,
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
