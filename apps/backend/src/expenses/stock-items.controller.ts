import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { CreateStockItemDto, DeleteStockItemDto } from "../stock/dto/stock.dto";
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

  /** What a delete would remove — shown in the confirmation. */
  @Get("items/:id/usage")
  @Roles("super_admin")
  async usage(@Param("id") id: string) {
    return this.expenses.materialUsage(id);
  }

  /** Permanent delete (frees the name). Admin only. */
  @Delete("items/:id")
  @Roles("super_admin")
  async remove(@Param("id") id: string, @Body() dto: DeleteStockItemDto, @CurrentUser() actor: Actor) {
    return this.expenses.deleteMaterial(id, dto.delete_expenses ?? false, actor);
  }
}
