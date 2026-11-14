import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { OrdersService } from "./orders.service";
import {
  CreateOrderDto,
  UpdateOrderDto,
  ConfirmOrderDto,
  TransitionDto,
  RecordPaymentDto,
  AddOrderNoteDto,
} from "./dto/orders.dto";

interface Actor {
  id: string;
  full_name: string;
  role: "super_admin" | "staff";
}

@Controller("orders")
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  async create(@Body() dto: CreateOrderDto, @CurrentUser() actor: Actor) {
    return this.ordersService.createOrder(dto, actor);
  }

  @Get()
  async list(
    @Query("status") status?: string,
    @Query("order_type") order_type?: string,
    @Query("search") search?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("overdue") overdue?: string,
    @Query("limit") limit?: string,
    @Query("page") page?: string,
  ) {
    return this.ordersService.listOrders({
      status,
      order_type,
      search,
      from,
      to,
      overdue: overdue === "1" || overdue === "true",
      limit: limit ? Number(limit) : undefined,
      page: page ? Number(page) : undefined,
    });
  }

  @Get(":id")
  async get(@Param("id") id: string) {
    return this.ordersService.getOrder(id);
  }

  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateOrderDto,
    @CurrentUser() actor: Actor,
  ) {
    return this.ordersService.updateOrder(id, dto, actor);
  }

  @Post(":id/confirm")
  async confirm(
    @Param("id") id: string,
    @Body() dto: ConfirmOrderDto,
    @CurrentUser() actor: Actor,
  ) {
    return this.ordersService.confirmOrder(id, dto, actor);
  }

  @Post(":id/start")
  async start(
    @Param("id") id: string,
    @Body() dto: TransitionDto,
    @CurrentUser() actor: Actor,
  ) {
    return this.ordersService.startOrder(id, dto, actor);
  }

  @Post(":id/ready")
  async ready(
    @Param("id") id: string,
    @Body() dto: TransitionDto,
    @CurrentUser() actor: Actor,
  ) {
    return this.ordersService.readyOrder(id, dto, actor);
  }

  @Post(":id/deliver")
  async deliver(
    @Param("id") id: string,
    @Body() dto: TransitionDto,
    @CurrentUser() actor: Actor,
  ) {
    return this.ordersService.deliverOrder(id, dto, actor);
  }

  @Post(":id/cancel")
  async cancel(
    @Param("id") id: string,
    @Body() dto: TransitionDto,
    @CurrentUser() actor: Actor,
  ) {
    return this.ordersService.cancelOrder(id, dto, actor);
  }

  @Post(":id/notes")
  async addNote(
    @Param("id") id: string,
    @Body() dto: AddOrderNoteDto,
    @CurrentUser() actor: Actor,
  ) {
    return this.ordersService.addNote(id, dto, actor);
  }

  @Post(":id/payments")
  async recordPayment(
    @Param("id") id: string,
    @Body() dto: RecordPaymentDto,
    @CurrentUser() actor: Actor,
  ) {
    return this.ordersService.recordPayment(id, dto, actor);
  }
}
