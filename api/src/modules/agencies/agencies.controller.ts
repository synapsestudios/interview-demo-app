import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import { IsString } from 'class-validator';
import { DB_TOKEN } from '../../db/db.module';
import type { Db } from '../../db';
import { agencies } from '../../db/schema';

class CreateAgencyDto {
  @IsString() name!: string;
}

@Controller('agencies')
export class AgenciesController {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  @Get()
  list() {
    return this.db.select().from(agencies).orderBy(agencies.name);
  }

  @Post()
  async create(@Body() dto: CreateAgencyDto) {
    const [row] = await this.db.insert(agencies).values({ name: dto.name }).returning();
    return row;
  }
}
