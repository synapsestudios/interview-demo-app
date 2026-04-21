import {
  IsArray,
  IsBoolean,
  IsHexColor,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AnswerOptionDto {
  @IsOptional() @IsString() id?: string;
  @IsString() label!: string;
  @IsNumber() score!: number;
  @IsInt() @Min(0) order!: number;
}

export class ConditionalDto {
  @IsOptional() @IsString() id?: string;
  @IsString() dependsOnQuestionId!: string;
  @IsOptional() @IsString() dependsOnAnswerOptionId?: string | null;
  @IsOptional() @IsNumber() dependsOnNumericMin?: number | null;
  @IsOptional() @IsNumber() dependsOnNumericMax?: number | null;
  @IsOptional() @IsBoolean() visible?: boolean;
}

export class QuestionDto {
  @IsOptional() @IsString() id?: string;
  @IsString() prompt!: string;
  @IsIn(['true_false', 'multiple_choice', 'likert'])
  type!: 'true_false' | 'multiple_choice' | 'likert';
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsNumber() weight?: number;
  @IsInt() @Min(0) order!: number;
  @IsArray() @ValidateNested({ each: true }) @Type(() => AnswerOptionDto)
  options!: AnswerOptionDto[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ConditionalDto)
  conditionals?: ConditionalDto[];
}

export class SectionDto {
  @IsOptional() @IsString() id?: string;
  @IsString() title!: string;
  @IsInt() @Min(0) order!: number;
  @IsOptional() @IsNumber() weight?: number;
  @IsArray() @ValidateNested({ each: true }) @Type(() => QuestionDto)
  questions!: QuestionDto[];
}

export class ScoringBandDto {
  @IsOptional() @IsString() id?: string;
  @IsString() label!: string;
  @IsNumber() minScore!: number;
  @IsNumber() maxScore!: number;
  @IsOptional() @IsHexColor() color?: string;
}

export class CreateTemplateDto {
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => SectionDto)
  sections?: SectionDto[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ScoringBandDto)
  bands?: ScoringBandDto[];
}

export class UpdateTemplateDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => SectionDto)
  sections?: SectionDto[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ScoringBandDto)
  bands?: ScoringBandDto[];
}

export class PublishResult {
  id!: string;
  status!: string;
  version!: number;
}
