import { HttpException } from "@nestjs/common";
import {
  type ErrorCode,
  type ErrorResponse,
  ERROR_STATUS_BY_CODE
} from "@familywall/shared";

export class AppException extends HttpException {
  public readonly code: ErrorCode;
  public readonly details?: Record<string, unknown> | null;

  public constructor(code: ErrorCode, message: string, details?: Record<string, unknown> | null) {
    const body: ErrorResponse = {
      error: {
        code,
        message,
        ...(details === undefined ? {} : { details })
      }
    };

    super(body, ERROR_STATUS_BY_CODE[code]);
    this.message = message;
    this.code = code;
    this.details = details;
  }

  public static badRequest(message: string, details?: Record<string, unknown> | null): AppException {
    return new AppException("BAD_REQUEST", message, details);
  }

  public static validation(message: string, details?: Record<string, unknown> | null): AppException {
    return new AppException("VALIDATION_ERROR", message, details);
  }

  public static notFound(message: string): AppException {
    return new AppException("NOT_FOUND", message);
  }

  public static conflict(message: string, details?: Record<string, unknown> | null): AppException {
    return new AppException("CONFLICT", message, details);
  }

  public static unauthorized(message: string): AppException {
    return new AppException("UNAUTHORIZED", message);
  }

  public static forbidden(message: string): AppException {
    return new AppException("FORBIDDEN", message);
  }

  public static tooManyRequests(message: string): AppException {
    return new AppException("TOO_MANY_REQUESTS", message);
  }

  public static providerError(message: string): AppException {
    return new AppException("PROVIDER_ERROR", message);
  }

  public static internal(message: string, details?: Record<string, unknown> | null): AppException {
    return new AppException("INTERNAL_ERROR", message, details);
  }
}
