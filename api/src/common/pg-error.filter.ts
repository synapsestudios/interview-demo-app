import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';

/**
 * Turns raw Postgres errors into clean HTTP responses. Without this filter,
 * FK violations surface as opaque 500s, which is hostile to clients that
 * send IDs that may have been invalidated by a reseed or deletion.
 *
 * Postgres error codes handled:
 *   23503  foreign_key_violation   → 400 / 404
 *   23505  unique_violation        → 409
 *   22P02  invalid_text_representation (bad UUID etc.) → 400
 *   23502  not_null_violation      → 400
 */
@Catch()
export class PgErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('PgErrorFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    // Pass-through for clean Nest HttpExceptions.
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      res.status(status).json(exception.getResponse());
      return;
    }

    const pgCode =
      (exception as { code?: string } | null)?.code ??
      (exception as { cause?: { code?: string } } | null)?.cause?.code;

    if (pgCode === '23503') {
      const detail = (exception as { detail?: string })?.detail ?? '';
      const mapped = new NotFoundException({
        statusCode: 404,
        error: 'Not Found',
        message: 'Referenced record was not found. It may have been deleted or reseeded.',
        detail,
      });
      res.status(404).json(mapped.getResponse());
      return;
    }
    if (pgCode === '23505') {
      res.status(409).json({
        statusCode: 409,
        error: 'Conflict',
        message: 'A record with that unique value already exists.',
      });
      return;
    }
    if (pgCode === '22P02' || pgCode === '23502') {
      res.status(400).json({
        statusCode: 400,
        error: 'Bad Request',
        message: (exception as { message?: string })?.message ?? 'Bad input',
      });
      return;
    }

    // Unknown — log and return a generic 500.
    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    res.status(500).json({ statusCode: 500, message: 'Internal server error' });
  }
}
