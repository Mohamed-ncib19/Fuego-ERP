import { Module } from "@nestjs/common";
import { FinanceController } from "./finance.controller";
import { FinanceService } from "./finance.service";
import { DbModule } from "../db/db.module";

@Module({
  imports: [DbModule],
  controllers: [FinanceController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
