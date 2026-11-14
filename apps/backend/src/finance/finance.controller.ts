import { Controller, Get, Query } from "@nestjs/common";
import { FinanceService } from "./finance.service";

@Controller("finance")
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Get("stats")
  async getStats() {
    return this.financeService.getStats();
  }

  @Get("payments")
  async listPayments(
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("kind") kind?: string,
    @Query("limit") limit?: string,
    @Query("page") page?: string,
  ) {
    return this.financeService.listPayments({
      from,
      to,
      kind,
      limit: limit ? Number(limit) : undefined,
      page: page ? Number(page) : undefined,
    });
  }
}
