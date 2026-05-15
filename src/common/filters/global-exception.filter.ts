import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import {
  getPrismaUniqueTargets,
  hasUniqueTarget,
  isPrismaKnownRequestError,
} from '../utils/prisma-error.util';

const SENSITIVE_FILE_SCAN_PATTERNS = [
  /\/\.env(?:\.|$)/i,
  /\/config\.env$/i,
  /\/\.pypirc$/i,
  /\/\.ssh(?:\/|$)/i,
  /\/\.git(?:\/|$)/i,
  /\/id_(?:rsa|ed25519)$/i,
];

const SUSPICIOUS_SCAN_METHODS = new Set([
  'PROPFIND',
  'PROPPATCH',
  'MKCOL',
  'COPY',
  'MOVE',
  'LOCK',
  'UNLOCK',
  'SEARCH',
  'TRACE',
  'CONNECT',
]);

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const { statusCode, message, error } = this.mapException(exception);

    this.logException(request, exception, statusCode, message);

    response.status(statusCode).json({
      statusCode,
      message,
      error,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }

  private logException(
    request: Request,
    exception: unknown,
    statusCode: number,
    message: string,
  ) {
    const clientIp =
      request.ip || request.headers['x-forwarded-for'] || 'unknown';
    const logMessage = `[${request.method}] ${request.url} -> ${statusCode} ${message} (${clientIp})`;

    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        logMessage,
        exception instanceof Error ? exception.stack : String(exception),
      );
      return;
    }

    if (statusCode === HttpStatus.NOT_FOUND) {
      if (this.isScanLikeRequest(request)) {
        this.logger.log(`[SCAN] ${logMessage}`);
        return;
      }

      this.logger.warn(logMessage);
      return;
    }

    if (statusCode >= HttpStatus.BAD_REQUEST) {
      this.logger.warn(logMessage);
    }
  }

  private isSensitiveFileScan(url: string) {
    return SENSITIVE_FILE_SCAN_PATTERNS.some((pattern) => pattern.test(url));
  }

  private isSuspiciousScanMethod(method: string) {
    return SUSPICIOUS_SCAN_METHODS.has(method.toUpperCase());
  }

  private isScanLikeRequest(request: Request) {
    return (
      this.isSensitiveFileScan(request.url) ||
      this.isSuspiciousScanMethod(request.method)
    );
  }

  private mapException(exception: unknown) {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const response = exception.getResponse();

      if (typeof response === 'string') {
        return {
          statusCode,
          message: response,
          error: exception.name,
        };
      }

      const responseMessage = Array.isArray(response['message'])
        ? response['message'].join(', ')
        : (response['message'] as string) || exception.message;

      return {
        statusCode,
        message: responseMessage,
        error: (response['error'] as string) || exception.name,
      };
    }

    if (isPrismaKnownRequestError(exception)) {
      return this.mapPrismaException(exception);
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        message: '잘못된 데이터 요청입니다.',
        error: exception.name,
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: '서버 내부 오류가 발생했습니다.',
      error: 'InternalServerError',
    };
  }

  private mapPrismaException(exception: Prisma.PrismaClientKnownRequestError) {
    if (exception.code === 'P2002') {
      if (hasUniqueTarget(exception, 'loginid')) {
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          message: '이미 사용 중인 아이디입니다.',
          error: 'BadRequest',
        };
      }

      if (hasUniqueTarget(exception, 'subscribeemail', 'emailindex')) {
        return {
          statusCode: HttpStatus.CONFLICT,
          message:
            '회원가입용 구독 계정 생성 중 충돌이 발생했습니다. 다시 시도해주세요.',
          error: 'Conflict',
        };
      }

      const targets = getPrismaUniqueTargets(exception);

      return {
        statusCode: HttpStatus.CONFLICT,
        message: `중복된 데이터가 존재합니다${
          targets.length ? `: ${targets.join(', ')}` : '.'
        }`,
        error: 'Conflict',
      };
    }

    if (exception.code === 'P2025') {
      return {
        statusCode: HttpStatus.NOT_FOUND,
        message: '요청한 데이터를 찾을 수 없습니다.',
        error: 'NotFound',
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: '데이터베이스 요청 처리 중 오류가 발생했습니다.',
      error: exception.name,
    };
  }
}
