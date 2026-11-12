import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import { USER_ROLES, type UserRole } from "@fuego/shared";

export class CreateUserDto {
  @IsString()
  @MinLength(2, { message: "Le nom complet doit contenir au moins 2 caractères" })
  @MaxLength(120)
  full_name!: string;

  @IsEmail({}, { message: "Adresse e-mail invalide" })
  email!: string;

  @IsString()
  @MinLength(8, { message: "Le mot de passe doit contenir au moins 8 caractères" })
  password!: string;

  @IsIn(USER_ROLES, { message: "Rôle invalide" })
  role!: UserRole;

  /** Required by the API only when creating another super_admin — the acting
   * admin proves identity with their own password (reference pattern). */
  @IsOptional()
  @IsString()
  admin_password?: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: "Le nom complet doit contenir au moins 2 caractères" })
  @MaxLength(120)
  full_name?: string;

  @IsOptional()
  @IsEmail({}, { message: "Adresse e-mail invalide" })
  email?: string;

  @IsOptional()
  @IsIn(USER_ROLES, { message: "Rôle invalide" })
  role?: UserRole;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsString()
  admin_password?: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(8, { message: "Le mot de passe doit contenir au moins 8 caractères" })
  new_password!: string;
}
