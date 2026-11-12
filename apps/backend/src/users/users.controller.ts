import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { UsersService } from "./users.service";
import { CreateUserDto, ResetPasswordDto, UpdateUserDto } from "./dto/users.dto";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";

interface Actor {
  id: string;
  full_name: string;
  role: "super_admin" | "staff";
}

/** Administration — super_admin only (enforced at the controller gate). */
@Roles("super_admin")
@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  listUsers(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("search") search?: string,
  ) {
    return this.usersService.listUsers({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      search,
    });
  }

  @Get(":id")
  getUser(@Param("id") id: string) {
    return this.usersService.getUser(id);
  }

  @Post()
  createUser(@Body() dto: CreateUserDto, @CurrentUser() actor: Actor) {
    return this.usersService.createUser(dto, actor);
  }

  @Patch(":id")
  updateUser(@Param("id") id: string, @Body() dto: UpdateUserDto, @CurrentUser() actor: Actor) {
    return this.usersService.updateUser(id, dto, actor);
  }

  @HttpCode(HttpStatus.OK)
  @Post(":id/reset-password")
  resetPassword(
    @Param("id") id: string,
    @Body() dto: ResetPasswordDto,
    @CurrentUser() actor: Actor,
  ) {
    return this.usersService.resetUserPassword(id, dto.new_password, actor);
  }
}
