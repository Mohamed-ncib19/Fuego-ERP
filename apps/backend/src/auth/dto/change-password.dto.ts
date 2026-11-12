import { IsString, MinLength } from "class-validator";

export class ChangePasswordDto {
  @IsString()
  @MinLength(1, { message: "Mot de passe actuel requis" })
  current_password!: string;

  @IsString()
  @MinLength(8, { message: "Le nouveau mot de passe doit contenir au moins 8 caractères" })
  new_password!: string;
}
