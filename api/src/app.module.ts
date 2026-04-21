import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DbModule } from './db/db.module';
import { TemplatesModule } from './modules/templates/templates.module';
import { AgenciesModule } from './modules/agencies/agencies.module';
import { ClientsModule } from './modules/clients/clients.module';
import { ScreeningsModule } from './modules/screenings/screenings.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DbModule,
    TemplatesModule,
    AgenciesModule,
    ClientsModule,
    ScreeningsModule,
    DashboardModule,
  ],
})
export class AppModule {}
