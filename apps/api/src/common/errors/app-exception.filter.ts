import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger
} from "@nestjs/common";
import type { Response } from "express";
import { ZodError } from "zod";
import { AppException } from "./app-exception";

@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AppExceptionFilter.name);

  public catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof AppException) {
      response.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    if (exception instanceof ZodError) {
      response.status(HttpStatus.UNPROCESSABLE_ENTITY).json(
        AppException.validation("Dati non validi.", {
          issues: exception.flatten()
        }).getResponse()
      );
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const rawResponse = exception.getResponse();
      const message =
        typeof rawResponse === "string"
          ? rawResponse
          : typeof rawResponse === "object" && rawResponse !== null && "message" in rawResponse
            ? String((rawResponse as { message: unknown }).message)
            : "Request failed.";

      const mapped =
        status === HttpStatus.NOT_FOUND
          ? AppException.notFound(message)
          : status === HttpStatus.UNAUTHORIZED
            ? AppException.unauthorized(message)
            : status === HttpStatus.FORBIDDEN
              ? AppException.forbidden(message)
              : AppException.badRequest(message);
      response.status(status).json(mapped.getResponse());
      return;
    }

    this.logger.error("Unhandled exception", exception instanceof Error ? exception.stack : undefined);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
      AppException.internal("Errore imprevisto.").getResponse()
    );
  }
}