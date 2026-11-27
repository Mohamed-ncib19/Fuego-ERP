import { Body, Controller, Post } from "@nestjs/common";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { CreateStockItemDto } from "../stock/dto/stock.dto";
import type { Actor } from "../stock/stock.service";
import { ExpensesService } from "./expenses.service";

/**
 * POST /stock/items lives here, not in StockController: creating an item
 * with a starting quantity books a dépense, and the expenses module already
 * depends on the stock module (the reverse import would be circular).
 */
@Controller("stock")
export class StockItemsController {
  constructor(private readonly expenses: ExpensesService) {}

  /** Returns the item, plus the dépense when the starting quantity was a purchase. */
  @Post("items")
  async create(@Body() dto: CreateStockItemDto, @CurrentUser() actor: Actor) {
    return this.expenses.createMaterial(dto, actor);
  }
}
