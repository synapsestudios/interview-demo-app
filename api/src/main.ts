import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { PgErrorFilter } from './common/pg-error.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new PgErrorFilter());
  app.setGlobalPrefix('api');

  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  await app.listen(port);
  Logger.log(`Survey prototype API listening on :${port}`, 'Bootstrap');
}

bootstrap();
