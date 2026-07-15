import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';

const SENSITIVE = /token|password|secret|authorization|credential|presign|uploadurl|objectkey|body|query/i;

@Injectable()
export class AuditService {
  constructor(private readonly logger: Logger = new Logger(AuditService.name)) {}

  emit(input: { action: string; actorId?: string; result?: 'success' | 'denied' | 'failed'; resourceType?: string; resourceId?: string; requestId?: string; metadata?: Record<string, unknown> }) {
    const metadata = Object.fromEntries(Object.entries(input.metadata ?? {}).filter(([key]) => !SENSITIVE.test(key)));
    const event = { eventId: randomUUID(), timestamp: new Date().toISOString(), requestId: input.requestId ?? randomUUID(), actorKind: input.actorId ? 'user' : 'system', actorId: input.actorId ?? null, action: input.action, resourceType: input.resourceType ?? null, resourceId: input.resourceId ?? null, result: input.result ?? 'success', metadata };
    try { this.logger.log(JSON.stringify(event)); } catch { this.logger.error('audit emission failed'); }
    return event;
  }
}
