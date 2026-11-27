import { Module } from "@nestjs/common";
import { ExpensesController } from "./expenses.controller";
import { ExpensesService } from "./expenses.service";
import { DbModule } from "../db/db.module";
import { AuditModule } from "../audit/audit.module";
import { StockModule } from "../stock/stock.module";

@Module({
  imports: [DbModule, AuditModule, StockModule],
  controllers: [ExpensesController],
  providers: [ExpensesService],
  exports: [ExpensesService],
})
export class ExpensesModule {}
