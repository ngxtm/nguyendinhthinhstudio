import { Controller, Get, Header } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

@Controller()
export class AppController {
  @SkipThrottle()
  @Get('health')
  health(): { status: string } {
    return { status: 'ok' };
  }

  @SkipThrottle()
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @Get('robots.txt')
  robots(): string {
    return 'User-agent: *\nDisallow: /\n';
  }
}
