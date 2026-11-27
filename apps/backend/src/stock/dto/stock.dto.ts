import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import {
  STOCK_ITEM_KINDS,
  STOCK_UNITS,
  type ManualMovementType,
  type StockItemKind,
  type StockUnit,
} from "@fuego/shared";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Quantities are integers in thousandths of the unit (1,5 kg → 1500). */
export class CreateStockItemDto {
  @IsString()
  @MinLength(1, { message: "Le nom est obligatoire" })
  @MaxLength(120)
  name!: string;

  @IsIn(STOCK_ITEM_KINDS, { message: "Type d'article invalide" })
  @IsOptional()
  kind?: StockItemKind;

  @IsString()
  @IsOptional()
  @MaxLength(60)
  category?: string;

  @IsIn(STOCK_UNITS, { message: "Unité de mesure invalide" })
  unit!: StockUnit;

  @IsInt({ message: "Le seuil minimum doit être un nombre" })
  @Min(0, { message: "Le seuil minimum ne peut pas être négatif" })
  @IsOptional()
  min_threshold?: number;

  @IsInt({ message: "La quantité initiale doit être un nombre" })
  @Min(0, { message: "La quantité initiale ne peut pas être négative" })
  @IsOptional()
  initial_quantity?: number;

  /** Millimes per unit for the starting quantity — it becomes a dépense. */
  @IsInt({ message: "Le prix doit être un entier en millimes" })
  @Min(0, { message: "Le prix ne peut pas être négatif" })
  @IsOptional()
  unit_price?: number;

  /** Starting quantity was owned before Fuego: initial stock, no dépense. */
  @IsBoolean()
  @IsOptional()
  already_owned?: boolean;

  @Matches(DATE_RE, { message: "Format de date invalide (YYYY-MM-DD)" })
  @IsOptional()
  purchase_date?: string;

  /** Supplier / invoice note, used as the dépense note. */
  @IsString()
  @IsOptional()
  @MaxLength(200)
  supplier?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  note?: string;
}

export class UpdateStockItemDto {
  @IsString()
  @MinLength(1, { message: "Le nom est obligatoire" })
  @MaxLength(120)
  @IsOptional()
  name?: string;

  @IsIn(STOCK_ITEM_KINDS, { message: "Type d'article invalide" })
  @IsOptional()
  kind?: StockItemKind;

  @IsString()
  @IsOptional()
  @MaxLength(60)
  category?: string;

  @IsIn(STOCK_UNITS, { message: "Unité de mesure invalide" })
  @IsOptional()
  unit?: StockUnit;

  @IsInt({ message: "Le seuil minimum doit être un nombre" })
  @Min(0, { message: "Le seuil minimum ne peut pas être négatif" })
  @IsOptional()
  min_threshold?: number;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  note?: string;
}

export class SetActiveDto {
  @IsBoolean()
  is_active!: boolean;
}

/** DELETE /stock/items/:id — also delete the purchase dépenses, or keep their amounts. */
export class DeleteStockItemDto {
  @IsOptional()
  @IsBoolean()
  delete_expenses?: boolean;
}

export class RecordMovementDto {
  /** entry / exit move by `quantity`; count sets the counted quantity. */
  @IsIn(["entry", "exit", "count"], { message: "Type de mouvement invalide" })
  type!: ManualMovementType;

  @IsInt({ message: "La quantité doit être un nombre" })
  @Min(0, { message: "La quantité ne peut pas être négative" })
  quantity!: number;

  @IsString()
  @IsOptional()
  @MaxLength(300)
  reason?: string;

  @Matches(DATE_RE, { message: "Format de date invalide (YYYY-MM-DD)" })
  @IsOptional()
  date?: string;
}

/** A material to create on the fly from the expense form. */
export class NewStockItemDto {
  @IsString()
  @MinLength(1, { message: "Le nom de la matière est obligatoire" })
  @MaxLength(120)
  name!: string;

  @IsIn(STOCK_UNITS, { message: "Unité de mesure invalide" })
  unit!: StockUnit;

  @IsIn(STOCK_ITEM_KINDS, { message: "Type d'article invalide" })
  @IsOptional()
  kind?: StockItemKind;

  @IsString()
  @IsOptional()
  @MaxLength(60)
  category?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  min_threshold?: number;
}
