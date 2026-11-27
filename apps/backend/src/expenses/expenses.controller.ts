import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ExpensesService } from "./expenses.service";
import { CreateExpenseDto, UpdateExpenseDto } from "./dto/expenses.dto";

interface Actor {
  id: string;
  full_name: string;
  role: "super_admin" | "staff";
}

@Controller("expenses")
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
  async create(@Body() dto: CreateExpenseDto, @CurrentUser() actor: Actor) {
    return this.expensesService.create(dto, actor);
  }

  @Get()
  async list(
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("category") category?: string,
    @Query("limit") limit?: string,
    @Query("page") page?: string,
  ) {
    return this.expensesService.list({
      from,
      to,
      category,
      limit: limit ? Number(limit) : undefined,
      page: page ? Number(page) : undefined,
    });
  }

  @Get(":id")
  async get(@Param("id") id: string) {
    return this.expensesService.get(id);
  }

  /** Owner or admin. Line changes re-book only the stock difference. */
  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateExpenseDto,
    @CurrentUser() actor: Actor,
  ) {
    return this.expensesService.update(id, dto, actor);
  }

  @Delete(":id")
  async delete(@Param("id") id: string, @CurrentUser() actor: Actor) {
    return this.expensesService.delete(id, actor);
  }
}
