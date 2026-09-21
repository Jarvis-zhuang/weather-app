"use client";

import { AppError, toAppError, UNEXPECTED_MESSAGE } from "./errors";
import type { ApiResult } from "./types";

/**
 * Browser-side client for our own API routes. It unwraps the ApiResult
 * envelope and always throws an AppError, so React Query (and the UI) deal
 * with exactly one error shape.
 */
export async function apiGet<T>(
  path: string,
  params?: URLSearchParams,
  signal?: AbortSignal,
): Promise<T> {
  const query = params?.toString();
  const url = query ? `${path}?${query}` : path;

  let response: Response;
  try {
    response = await fetch(url, {
      signal,
      headers: { accept: "application/json" },
    });
  } catch (error) {
    throw toAppError(error);
  }

  const body = (await response.json().catch(() => null)) as ApiResult<T> | null;

  if (!body || typeof body !== "object" || !("ok" in body)) {
    throw new AppError("UNKNOWN", UNEXPECTED_MESSAGE, 500);
  }
  if (!body.ok) {
    throw new AppError(body.error.code, body.error.message, response.status);
  }

  return body.data;
}
