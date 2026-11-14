import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "@fuego/shared";

export class CreateExpenseDto {
  @IsIn(EXPENSE_CATEGORIES, { message: "Catégorie de dépense invalide" })
  category!: ExpenseCategory;

  @IsInt({ message: "Le montant doit être un entier en millimes" })
  @Min(1, { message: "Le montant doit être supérieur à 0" })
  amount!: number;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  note?: string;

  @IsString({ message: "Format de date invalide (YYYY-MM-DD)" })
  @IsOptional()
  date?: string;
}

export class UpdateExpenseDto {
  @IsIn(EXPENSE_CATEGORIES, { message: "Catégorie de dépense invalide" })
  @IsOptional()
  category?: ExpenseCategory;

  @IsInt({ message: "Le montant doit être un entier en millimes" })
  @Min(1, { message: "Le montant doit être supérieur à 0" })
  @IsOptional()
  amount?: number;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  note?: string;

  @IsString({ message: "Format de date invalide (YYYY-MM-DD)" })
  @IsOptional()
  date?: string;
}
