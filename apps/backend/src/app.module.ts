import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { DbModule } from "./db/db.module";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { SetupModule } from "./setup/setup.module";
import { SettingsModule } from "./settings/settings.module";
import { HealthController } from "./health/health.controller";
import { OrdersModule } from "./orders/orders.module";
import { ApiKeyGuard } from "./common/guards/api-key.guard";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { RolesGuard } from "./common/guards/roles.guard";

@Module({
  imports: [
    DbModule,
    AuditModule,
    AuthModule,
    UsersModule,
    SetupModule,
    SettingsModule,
    OrdersModule,
  ],
  controllers: [HealthController],
  // Guard order = registration order: API key first (blocks non-app callers),
  // then the session, then role gates.
  providers: [
    { provide: APP_GUARD, useClass: ApiKeyGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
