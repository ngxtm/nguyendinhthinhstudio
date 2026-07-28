import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('search indexing boundaries', () => {
    it('does not expose a successful root document', () => {
      expect((appController as any).getHello).toBeUndefined();
    });

    it('keeps the health endpoint available', () => {
      expect(appController.health()).toEqual({ status: 'ok' });
    });

    it('disallows crawling the API host', () => {
      expect((appController as any).robots()).toBe(
        'User-agent: *\nDisallow: /\n',
      );
    });
  });
});
