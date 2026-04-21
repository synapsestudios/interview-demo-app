import { Controller, Get, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('score-distribution')
  scoreDistribution(
    @Query('agencyId') agencyId: string,
    @Query('templateId') templateId: string,
  ) {
    return this.service.scoreDistribution(agencyId, templateId);
  }

  @Get('band-counts')
  bandCounts(
    @Query('agencyId') agencyId: string,
    @Query('templateId') templateId: string,
  ) {
    return this.service.bandCountsOverTime(agencyId, templateId);
  }
}
