import type { NextFunction, Request, Response } from "express";
import { describeError, log } from "../logger";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** Wraps async handlers so rejected promises reach the error middleware. */
export function asyncRoute(
  handler: (req: Request, res: Response) => Promise<unknown>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    handler(req, res).catch(next);
  };
}

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: "not_found" });
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const status = err instanceof HttpError ? err.status : 502;
  const message = err instanceof HttpError ? err.message : describeError(err);

  if (status >= 500) log.error("request failed", { path: req.originalUrl, error: message });

  res.status(status).json({ error: status >= 500 ? "upstream_failure" : "bad_request", message });
}
