import type { NextFunction, Request, Response } from 'express';

export function apiIndexingMiddleware(
  _request: Request,
  response: Response,
  next: NextFunction,
): void {
  response.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
}
