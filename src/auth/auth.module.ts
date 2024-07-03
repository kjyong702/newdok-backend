import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { ConfigService } from '@nestjs/config';
import { TwilioModule } from 'nestjs-twilio';

@Module({
  imports: [
    TwilioModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        accountSid: config.get<string>('TWILIO_ACCOUNT_SID'),
        authToken: config.get<string>('TWILIO_AUTH_TOKEN'),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
