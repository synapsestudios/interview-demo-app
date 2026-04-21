import { Global, Module } from '@nestjs/common';
import { db } from './index';

export const DB_TOKEN = 'DB';

@Global()
@Module({
  providers: [{ provide: DB_TOKEN, useValue: db }],
  exports: [DB_TOKEN],
})
export class DbModule {}
