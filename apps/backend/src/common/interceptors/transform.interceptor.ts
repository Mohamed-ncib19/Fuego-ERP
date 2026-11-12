import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";

/**
 * Uniform response envelope — every endpoint answers { data, meta, error }.
 * shape: success → { data, meta?, error: null }, failures come from the
 * AllExceptionsFilter in the same shape.
 */
@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((body) => {
        if (body !== null && typeof body === "object" && "meta" in body && "data" in body) {
          // Already enveloped (paginated results pass both fields).
          return { ...body, error: null };
        }
        return { data: body ?? null, meta: undefined, error: null };
      }),
    );
  }
}
