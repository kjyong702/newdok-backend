import { Injectable } from '@nestjs/common';
import CryptoJS from 'crypto-js';

@Injectable()
export class AuthService {
  async sendSMS(phoneNumber: string) {
    const SERVICE_ID = process.env.NCP_SERVICE_ID || '';
    const ACCESS_KEY = process.env.NCP_ACCESS_KEY || '';
    const SECRET_KEY = process.env.NCP_SECRET_KEY || '';
    const FROM_NUMBER = process.env.NCP_FROM_NUMBER || '';

    const timestamp = Date.now().toString();
    const signature = this.getSMSSignature(
      SERVICE_ID,
      ACCESS_KEY,
      SECRET_KEY,
      timestamp,
    );

    const url = `https://sens.apigw.ntruss.com/sms/v2/services/${SERVICE_ID}/messages`;
    const verifyCode = Math.floor(Math.random() * (999999 - 100000)) + 100000;

    const body = JSON.stringify({
      type: 'SMS',
      contentType: 'COMM',
      countryCode: '82',
      from: FROM_NUMBER,
      content: `인증번호 [${verifyCode}]를 입력해주세요.`,
      messages: [
        {
          to: phoneNumber,
        },
      ],
    });
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ncp-iam-access-key': ACCESS_KEY,
        'x-ncp-apigw-timestamp': timestamp,
        'x-ncp-apigw-signature-v2': signature,
      },
      body,
    });

    const result = await response.json();
    if (result.statusCode === '202') {
      return {
        code: verifyCode,
      };
    } else {
      console.log(result);
      throw new Error('SMS 요청 실패');
    }
  }

  getSMSSignature(
    serviceId: string,
    accessKey: string,
    secretKey: string,
    timestamp: string,
  ) {
    const space = ' ';
    const newLine = '\n';
    const method = 'POST';
    const url = `/sms/v2/services/${serviceId}/messages`;

    const hmac = CryptoJS.algo.HMAC.create(CryptoJS.algo.SHA256, secretKey);

    hmac.update(method);
    hmac.update(space);
    hmac.update(url);
    hmac.update(newLine);
    hmac.update(timestamp);
    hmac.update(newLine);
    hmac.update(accessKey);

    const hash = hmac.finalize();

    return hash.toString(CryptoJS.enc.Base64);
  }
}
