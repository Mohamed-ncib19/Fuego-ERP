import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import type { StockItemKind, StockLevel, StockMovementKind } from "@fuego/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { StockService, type Actor } from "./stock.service";
import {
  CreateStockItemDto,
  RecordMovementDto,
  SetActiveDto,
  UpdateStockItemDto,
} from "./dto/stock.dto";

/**
 * Stock endpoints. Every signed-in user can look at the stock, create and
 * edit items, and record entries/exits (the counter staff receives and uses
 * materials). Archiving and inventory corrections are admin-only.
 */
@Controller("stock")
export class StockController {
  constructor(private readonly stock: StockService) {}

  @Get("items")
  async listItems(
    @Query("search") search?: string,
    @Query("kind") kind?: StockItemKind,
    @Query("scope") scope?: "all" | "materials",
    @Query("level") level?: StockLevel,
    @Query("include_archived") includeArchived?: string,
  ) {
    const res = await this.stock.listItems({
      search,
      kind,
      scope,
      level,
      includeArchived: includeArchived === "true" || includeArchived === "1",
    });
    return { data: res.data, meta: { summary: res.summary } };
  }

  @Get("categories")
  async categories() {
    return this.stock.categories();
  }

  @Get("items/:id")
  async getItem(@Param("id") id: string) {
    return this.stock.getItem(id);
  }

  @Post("items")
  async createItem(@Body() dto: CreateStockItemDto, @CurrentUser() actor: Actor) {
    return this.stock.createItem(dto, actor);
  }

  @Patch("items/:id")
  async updateItem(
    @Param("id") id: string,
    @Body() dto: UpdateStockItemDto,
    @CurrentUser() actor: Actor,
  ) {
    return this.stock.updateItem(id, dto, actor);
  }

  @Post("items/:id/active")
  @Roles("super_admin")
  async setActive(
    @Param("id") id: string,
    @Body() dto: SetActiveDto,
    @CurrentUser() actor: Actor,
  ) {
    return this.stock.setActive(id, dto.is_active, actor);
  }

  @Post("items/:id/movements")
  async recordMovement(
    @Param("id") id: string,
    @Body() dto: RecordMovementDto,
    @CurrentUser() actor: Actor,
  ) {
    return this.stock.recordMovement(id, dto, actor);
  }

  @Get("movements")
  async listMovements(
    @Query("item_id") itemId?: string,
    @Query("kind") kind?: StockMovementKind,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("expense_id") expenseId?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.stock.listMovements({
      itemId,
      kind,
      from,
      to,
      expenseId,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }
}
