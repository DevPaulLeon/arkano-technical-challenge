import { IsString, IsNotEmpty, IsEnum } from 'class-validator';

import { IdType } from '@shared/types/id-type.enum';

export class CreateClientDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  lastname: string;

  @IsEnum(IdType)
  idType: IdType;

  @IsString()
  @IsNotEmpty()
  idNumber: string;
}
