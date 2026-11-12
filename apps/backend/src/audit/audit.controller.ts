import { Controller, Get, Query } from "@nestjs/common";
import { AuditService } from "./audit.service";
import { Roles } from "../common/decorators/roles.decorator";

@Roles("super_admin")
@Controller("audit")
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  list(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("action") action?: string,
    @Query("entityType") entityType?: string,
    @Query("actorId") actorId?: string,
  ) {
    return this.auditService.list({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      action,
      entityType,
      actorId,
    });
  }
}
