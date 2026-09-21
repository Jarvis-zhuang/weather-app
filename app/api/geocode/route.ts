import { NextResponse } from "next/server";

import { toAppError } from "@/lib/errors";
import { searchLocations } from "@/lib/weather-source";
import type { ApiResult, GeoLocation } from "@/lib/types";

/**
 * GET /api/geocode?name=shenzhen
 *
 * Thin adapter in front of the upstream geocoding service:
 * validates input, normalises errors, defines the response contract.
 */
export async function GET(request: Request) {
  const name = new URL(request.url).searchParams.get("name") ?? "";

  try {
    const data = await searchLocations(name);
    return NextResponse.json<ApiResult<GeoLocation[]>>({ ok: true, data });
  } catch (error) {
    const appError = toAppError(error);
    return NextResponse.json<ApiResult<GeoLocation[]>>(
      { ok: false, error: { code: appError.code, message: appError.message } },
      { status: appError.status },
    );
  }
}
