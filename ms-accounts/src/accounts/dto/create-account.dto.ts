import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsEnum,
  IsOptional,
  Min,
} from 'class-validator';

import { AccountType } from '@shared/types/account-type.enum';

export class CreateAccountDto {
  @IsString()
  @IsNotEmpty()
  clientId: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  initialBalance: number = 0;

  @IsString()
  @IsNotEmpty()
  alias: string;

  @IsEnum(AccountType)
  @IsNotEmpty()
  type: AccountType;
}
