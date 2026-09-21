import type { ApiErrorCode } from "./types";

/**
 * One error type for the whole app. Data source failures (bad query, upstream
 * 5xx, network down) are normalised here so that route handlers can map them
 * to HTTP status codes and the UI can map them to a message + retry action.
 */
export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;

  constructor(code: ApiErrorCode, message: string, status = 500) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
  }
}

export function badRequest(message: string, status = 400) {
  return new AppError("BAD_REQUEST", message, status);
}

export function notFound(message: string) {
  return new AppError("NOT_FOUND", message, 404);
}

export function upstream(message: string) {
  return new AppError("UPSTREAM", message, 502);
}

export function rateLimited(message: string) {
  return new AppError("RATE_LIMITED", message, 429);
}

export const UNEXPECTED_MESSAGE = "服务暂时不可用，请稍后再试。";

/** Normalise anything thrown into an AppError, so no layer leaks raw errors. */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  // fetch() rejects with a TypeError when the network / DNS is unavailable.
  if (error instanceof TypeError) {
    return new AppError("NETWORK", "网络连接失败，请检查网络后重试。", 503);
  }

  if (error instanceof Error) {
    return new AppError("UNKNOWN", error.message || UNEXPECTED_MESSAGE, 500);
  }

  return new AppError("UNKNOWN", UNEXPECTED_MESSAGE, 500);
}
