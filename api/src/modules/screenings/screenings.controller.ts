import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ScreeningsService } from './screenings.service';
import {
  CreateScreeningDto,
  UpsertAnswersDto,
} from './dto/screening.dto';

@Controller('screenings')
export class ScreeningsController {
  constructor(private readonly service: ScreeningsService) {}

  @Get()
  list(
    @Query('agencyId') agencyId?: string,
    @Query('status') status?: 'draft' | 'in_progress' | 'submitted',
    @Query('templateId') templateId?: string,
  ) {
    return this.service.list({ agencyId, status, templateId });
  }

  @Get('export.csv')
  async exportCsv(
    @Res() res: Response,
    @Query('agencyId') agencyId?: string,
    @Query('templateId') templateId?: string,
  ) {
    const csv = await this.service.exportCsv({ agencyId, templateId });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="screenings.csv"',
    );
    res.send(csv);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post()
  create(@Body() dto: CreateScreeningDto) {
    return this.service.create(dto);
  }

  @Put(':id/answers')
  upsertAnswers(@Param('id') id: string, @Body() dto: UpsertAnswersDto) {
    return this.service.upsertAnswers(id, dto.answers);
  }

  @Post(':id/submit')
  submit(@Param('id') id: string) {
    return this.service.submit(id);
  }
}
