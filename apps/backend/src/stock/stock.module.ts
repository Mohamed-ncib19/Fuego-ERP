import { Module } from "@nestjs/common";
import { DbModule } from "../db/db.module";
import { AuditModule } from "../audit/audit.module";
import { StockController } from "./stock.controller";
import { StockService } from "./stock.service";

@Module({
  imports: [DbModule, AuditModule],
  controllers: [StockController],
  providers: [StockService],
  exports: [StockService],
})
export class StockModule {}
