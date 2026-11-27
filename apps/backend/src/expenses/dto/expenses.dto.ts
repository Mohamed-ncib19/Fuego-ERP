import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "@fuego/shared";
import { NewStockItemDto } from "../../stock/dto/stock.dto";

/**
 * One purchased material. Either `stock_item_id` (existing material) or
 * `new_item` (created in the same transaction as the expense).
 */
export class ExpenseLineDto {
  @IsString()
  @IsOptional()
  stock_item_id?: string;

  @ValidateNested()
  @Type(() => NewStockItemDto)
  @IsOptional()
  new_item?: NewStockItemDto;

  /** Thousandths of the item's unit (2,5 kg → 2500). */
  @IsInt({ message: "La quantité doit être un nombre" })
  @Min(1, { message: "La quantité doit être supérieure à 0" })
  quantity!: number;

  /** Millimes per whole unit. */
  @IsInt({ message: "Le prix unitaire doit être un entier en millimes" })
  @Min(0, { message: "Le prix unitaire ne peut pas être négatif" })
  unit_price!: number;
}

export class CreateExpenseDto {
  @IsIn(EXPENSE_CATEGORIES, { message: "Catégorie de dépense invalide" })
  category!: ExpenseCategory;

  /** Required without lines; with lines the server uses Σ line totals. */
  @ValidateIf((o: CreateExpenseDto) => !o.lines || o.lines.length === 0)
  @IsInt({ message: "Le montant doit être un entier en millimes" })
  @Min(1, { message: "Le montant doit être supérieur à 0" })
  amount?: number;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  note?: string;

  @IsString({ message: "Format de date invalide (YYYY-MM-DD)" })
  @IsOptional()
  date?: string;

  /** Purchased materials — only for the "materials" category. */
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ExpenseLineDto)
  @IsOptional()
  lines?: ExpenseLineDto[];

  /** Idempotency key: one per opened form, so a double submit books once. */
  @IsString()
  @MaxLength(64)
  @IsOptional()
  client_ref?: string;
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

  /** When present, replaces every line (an empty array removes them all). */
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ExpenseLineDto)
  @IsOptional()
  lines?: ExpenseLineDto[];
}
