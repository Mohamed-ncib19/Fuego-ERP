import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";

export class SetupStatusDto {
  needs_setup!: boolean;
}

export class SetupAdminDto {
  /** Shown on the login screen and on tickets. */
  @IsString()
  @MinLength(2, { message: "Nom de commerce requis" })
  @MaxLength(80)
  business_name!: string;

  @IsString()
  @MinLength(2, { message: "Nom complet requis" })
  @MaxLength(120)
  full_name!: string;

  @IsEmail({}, { message: "Adresse e-mail invalide" })
  email!: string;

  @IsString()
  @MinLength(8, { message: "Le mot de passe doit contenir au moins 8 caractères" })
  password!: string;
}
