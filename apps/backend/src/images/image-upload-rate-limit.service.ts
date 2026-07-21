import {
  HttpException,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type ImageUploadRouteScope =
  | 'upload_url'
  | 'confirm_upload'
  | 'upload_status'
  | 'abandon_upload';

export const IMAGE_UPLOAD_ROUTE_LIMITS = Object.freeze({
  upload_url: Object.freeze({ limit: 20, windowMs: 10 * 60 * 1000 }),
  confirm_upload: Object.freeze({ limit: 60, windowMs: 10 * 60 * 1000 }),
  upload_status: Object.freeze({ limit: 120, windowMs: 60 * 1000 }),
  abandon_upload: Object.freeze({ limit: 30, windowMs: 10 * 60 * 1000 }),
}) satisfies Record<
  ImageUploadRouteScope,
  Readonly<{ limit: number; windowMs: number }>
>;

type Clock = () => Date;
type WindowRow = { count: bigint | number; oldest: Date | null };

export class UploadRateLimitedException extends HttpException {
  constructor(retryAfter: string) {
    super(
      {
        statusCode: 429,
        code: 'upload_rate_limited',
        message: 'Too many upload attempts',
        retryAfter,
      },
      429,
    );
  }
}

function rateStoreUnavailable(): ServiceUnavailableException {
  return new ServiceUnavailableException({
    statusCode: 503,
    code: 'upload_rate_limit_unavailable',
    message: 'Upload rate limit store is unavailable',
  });
}

function isSerializationFailure(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const candidate = error as {
    code?: unknown;
    message?: unknown;
    meta?: { message?: unknown };
  };
  if (candidate.code === 'P2034') {
    return true;
  }
  const databaseMessage =
    typeof candidate.meta?.message === 'string'
      ? candidate.meta.message
      : typeof candidate.message === 'string'
        ? candidate.message
        : '';
  return (
    candidate.code === 'P2010' &&
    /could not serialize access|serialization failure/i.test(databaseMessage)
  );
}

@Injectable()
export class ImageUploadRateLimitService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly clock: Clock = () => new Date(),
    @Optional()
    private readonly cleanupBatch = Number(
      process.env.IMAGE_UPLOAD_RATE_LIMIT_CLEANUP_BATCH ?? '1000',
    ),
  ) {}

  async admit(
    createdByAdminId: string,
    routeScope: ImageUploadRouteScope,
  ): Promise<{ admitted: true }> {
    const now = this.clock();
    const { limit, windowMs } = IMAGE_UPLOAD_ROUTE_LIMITS[routeScope];
    const windowStart = new Date(now.getTime() - windowMs);

    for (let attempt = 0; attempt < 64; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            await tx.$executeRawUnsafe(
              `SELECT pg_advisory_xact_lock(hashtextextended($1 || ':' || $2, 0))`,
              createdByAdminId,
              routeScope,
            );
            const [window] = await tx.$queryRawUnsafe<WindowRow[]>(
              `SELECT COUNT(*)::bigint AS "count", MIN("occurredAt") AS "oldest"
               FROM "ImageUploadRateLimitEvent"
               WHERE "createdByAdminId" = $1
                 AND "routeScope" = $2
                 AND "occurredAt" > $3`,
              createdByAdminId,
              routeScope,
              windowStart,
            );
            if (Number(window?.count ?? 0) >= limit && window?.oldest) {
              throw new UploadRateLimitedException(
                new Date(window.oldest.getTime() + windowMs).toISOString(),
              );
            }
            await tx.$executeRawUnsafe(
              `INSERT INTO "ImageUploadRateLimitEvent"
                 ("createdByAdminId", "routeScope", "occurredAt")
               VALUES ($1, $2, $3)`,
              createdByAdminId,
              routeScope,
              now,
            );
            return { admitted: true as const };
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 60_000,
            timeout: 60_000,
          },
        );
      } catch (error) {
        if (error instanceof UploadRateLimitedException) {
          throw error;
        }
        if (isSerializationFailure(error) && attempt < 63) {
          await new Promise((resolve) =>
            setTimeout(
              resolve,
              Math.min(50, 2 ** Math.min(attempt, 5) + Math.random() * 5),
            ),
          );
          continue;
        }
        throw rateStoreUnavailable();
      }
    }
    throw rateStoreUnavailable();
  }

  async cleanupExpired(): Promise<number> {
    const cutoff = new Date(this.clock().getTime() - 10 * 60 * 1000);
    try {
      return await this.prisma.$executeRawUnsafe(
        `DELETE FROM "ImageUploadRateLimitEvent"
         WHERE ctid IN (
           SELECT ctid
           FROM "ImageUploadRateLimitEvent"
           WHERE "occurredAt" < $1
           ORDER BY "occurredAt", "id"
           LIMIT $2
         )`,
        cutoff,
        this.cleanupBatch,
      );
    } catch {
      throw rateStoreUnavailable();
    }
  }
}
