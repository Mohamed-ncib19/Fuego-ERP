import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";

/**
 * Every failure leaves the API in the same { data, meta, error } envelope —
 * the renderer's axios client can then unwrap exactly one shape.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("Exceptions");

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = "Erreur interne du serveur";
    let code: string | undefined;
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === "string") {
        message = body;
      } else if (body && typeof body === "object") {
        const b = body as any;
        // ValidationPipe arrays → first readable message + details.
        if (Array.isArray(b.message)) {
          message = b.message[0] ?? message;
          details = b.message;
        } else {
          message = b.message ?? message;
        }
        code = b.error ?? undefined;
        if (!details && b.details) details = b.details;
      }
    } else {
      this.logger.error(
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({
      data: null,
      meta: undefined,
      error: { message, code, details },
    });
  }
}
