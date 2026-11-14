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
  ValidateNested,
} from "class-validator";
import { Transform, Type } from "class-transformer";
import { normalizePhone } from "@fuego/shared";
import {
  ORDER_TYPE_LABELS,
  PAYMENT_KINDS,
  type OrderType,
  type PaymentKind,
} from "@fuego/shared";

export class OrderItemDto {
  @IsString()
  @MinLength(1, { message: "Libellé obligatoire" })
  @MaxLength(200)
  label!: string;

  @IsInt({ message: "La quantité doit être un entier" })
  @Min(1, { message: "La quantité doit être d'au moins 1" })
  quantity!: number;

  @IsInt({ message: "Le prix unitaire doit être un entier en millimes" })
  @Min(0, { message: "Le prix unitaire doit être positif" })
  unit_price!: number;
}

export class CreateOrderDto {
  @IsString()
  @IsOptional()
  @MaxLength(120)
  customer_name?: string;

  @Transform(({ value }) =>
    typeof value === "string" ? normalizePhone(value) || undefined : value,
  )
  @IsOptional()
  @Matches(/^[0-9]{8}$/, { message: "Le téléphone doit contenir 8 chiffres (+216 xx xxx xxx)" })
  customer_phone?: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  description?: string;

  @IsIn(Object.keys(ORDER_TYPE_LABELS) as OrderType[], {
    message: "Type de commande invalide",
  })
  @IsOptional()
  order_type?: OrderType;

  @IsString()
  @IsOptional()
  @MaxLength(300)
  delivery_address?: string;

  @IsInt()
  @IsOptional()
  @Min(0)
  delivery_fee?: number;

  @IsString()
  @IsOptional()
  due_date?: string;

  @IsOptional()
  @Type(() => OrderItemDto)
  @ValidateNested({ each: true })
  items?: OrderItemDto[];
}

export class UpdateOrderDto {
  @IsString()
  @IsOptional()
  @MaxLength(120)
  customer_name?: string;

  @Transform(({ value }) =>
    typeof value === "string" ? normalizePhone(value) || undefined : value,
  )
  @IsOptional()
  @Matches(/^[0-9]{8}$/, { message: "Le téléphone doit contenir 8 chiffres (+216 xx xxx xxx)" })
  customer_phone?: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  description?: string;

  @IsIn(Object.keys(ORDER_TYPE_LABELS) as OrderType[], {
    message: "Type de commande invalide",
  })
  @IsOptional()
  order_type?: OrderType;

  @IsString()
  @IsOptional()
  @MaxLength(300)
  delivery_address?: string;

  @IsInt()
  @IsOptional()
  @Min(0)
  delivery_fee?: number;

  @IsString()
  @IsOptional()
  due_date?: string;

  @IsOptional()
  @Type(() => OrderItemDto)
  @ValidateNested({ each: true })
  items?: OrderItemDto[];
}

export class ConfirmOrderDto {
  @IsInt({ message: "Le montant de l'avance doit être un entier en millimes" })
  @Min(0, { message: "Le montant de l'avance doit être positif" })
  @IsOptional()
  advance_amount?: number;

  @IsString()
  @IsOptional()
  @MaxLength(300)
  note?: string;
}

export class TransitionDto {
  @IsBoolean()
  @IsOptional()
  force?: boolean;

  @IsString()
  @IsOptional()
  @MaxLength(300)
  note?: string;

  @IsString()
  @IsOptional()
  @MaxLength(300)
  reason?: string;
}

export class RecordPaymentDto {
  @IsIn(PAYMENT_KINDS, { message: "Type de paiement invalide" })
  kind!: PaymentKind;

  @IsInt({ message: "Le montant doit être un entier en millimes" })
  @Min(1, { message: "Le montant doit être supérieur à 0" })
  amount!: number;

  @IsString()
  @IsOptional()
  @MaxLength(300)
  note?: string;
}

export class AddOrderNoteDto {
  @IsString()
  @MinLength(1, { message: "Note obligatoire" })
  @MaxLength(2000)
  note!: string;
}
