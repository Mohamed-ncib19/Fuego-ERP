import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: "Nom de commerce requis" })
  @MaxLength(80)
  business_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  ticket_footer?: string;
}

export class RestoreDbDto {
  @IsString()
  @MinLength(10, { message: "Données de sauvegarde invalides" })
  fileBase64: string;
}
