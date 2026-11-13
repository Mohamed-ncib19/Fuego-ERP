import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
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

  @IsString()
  @IsOptional()
  @MaxLength(30)
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

  @IsString()
  @IsOptional()
  @MaxLength(30)
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
