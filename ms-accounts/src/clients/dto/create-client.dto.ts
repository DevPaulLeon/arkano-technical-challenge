import { IsString, IsNotEmpty, IsEnum } from 'class-validator';

export enum IdType {
  DNI = 'DNI',
  PASSPORT = 'PASSPORT',
  RUC = 'RUC',
}

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
