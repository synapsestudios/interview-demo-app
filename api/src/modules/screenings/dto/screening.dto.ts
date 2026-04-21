import { IsOptional, IsString, IsUUID, IsNumber, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateScreeningDto {
  @IsUUID() agencyId!: string;
  @IsUUID() clientId!: string;
  @IsUUID() templateId!: string;
}

export class AnswerDto {
  @IsUUID() questionId!: string;
  @IsOptional() @IsUUID() selectedOptionId?: string | null;
  @IsOptional() @IsNumber() numericValue?: number | null;
  @IsOptional() @IsString() note?: string | null;
}

export class UpsertAnswersDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => AnswerDto)
  answers!: AnswerDto[];
}
