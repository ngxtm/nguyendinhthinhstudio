import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
    private readonly logger = new Logger(PrismaService.name);

    async onModuleInit() {
        try {
            await this.$connect();
            this.logger.log('Database connected successfully');
        } catch (error) {
            this.logger.error('Failed to connect to database:', error);
            // Don't crash the app - let it start and retry on first query
        }
    }

    async onModuleDestroy() {
        await this.$disconnect();
    }
}
