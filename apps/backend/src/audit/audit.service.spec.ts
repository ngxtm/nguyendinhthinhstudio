import { AuditService } from './audit.service';

describe('AuditService', () => {
  it('redacts sensitive values and emits structured events', () => {
    const logger: any = { log: jest.fn(), error: jest.fn() };
    const service = new AuditService(logger);
    service.emit({ action: 'album.update', actorId: 'u', metadata: { token: 'secret', password: 'pw', title: 'ok' } });
    const payload = JSON.parse(logger.log.mock.calls[0][0]);
    expect(payload.metadata).toEqual({ title: 'ok' });
    expect(JSON.stringify(payload)).not.toContain('secret');
  });
});
