import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { DB_TOKEN } from '../../db/db.module';
import type { Db } from '../../db';
import { clients } from '../../db/schema';
import { eq } from 'drizzle-orm';

class CreateClientDto {
  @IsUUID() agencyId!: string;
  @IsString() name!: string;
}

@Controller('clients')
export class ClientsController {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  @Get()
  async list(@Query('agencyId') agencyId?: string) {
    if (agencyId) {
      return this.db.select().from(clients).where(eq(clients.agencyId, agencyId));
    }
    return this.db.select().from(clients);
  }

  @Post()
  async create(@Body() dto: CreateClientDto) {
    const [row] = await this.db.insert(clients).values(dto).returning();
    return row;
  }
}
