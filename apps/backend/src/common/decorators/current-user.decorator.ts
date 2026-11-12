import { createParamDecorator, ExecutionContext } from "@nestjs/common";

/**
 * Request actor attached by JwtStrategy — { id, email, full_name, role }.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
