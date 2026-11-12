import { Module } from "@nestjs/common";
import { SetupController } from "./setup.controller";
import { SetupService } from "./setup.service";
import { DbModule } from "../db/db.module";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [DbModule, AuthModule, AuditModule],
  controllers: [SetupController],
  providers: [SetupService],
})
export class SetupModule {}
