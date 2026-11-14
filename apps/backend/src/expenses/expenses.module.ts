import { Module } from "@nestjs/common";
import { ExpensesController } from "./expenses.controller";
import { ExpensesService } from "./expenses.service";
import { DbModule } from "../db/db.module";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [DbModule, AuditModule],
  controllers: [ExpensesController],
  providers: [ExpensesService],
  exports: [ExpensesService],
})
export class ExpensesModule {}
