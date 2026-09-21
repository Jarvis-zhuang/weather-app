import { NextResponse } from "next/server";

import { toAppError } from "@/lib/errors";
import { placeFromSearchParams } from "@/lib/place";
import { getWeather } from "@/lib/weather-source";
import type { ApiResult, WeatherPayload } from "@/lib/types";

/**
 * GET /api/weather?lat=22.54&lon=114.06&name=Shenzhen&country=China&tz=Asia/Shanghai
 *
 * Responses are cached for 10 minutes: weather data does not need second-level
 * freshness and this keeps us well inside the upstream free-tier limits.
 */
export const revalidate = 600;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const place = placeFromSearchParams(searchParams);

  if (!place) {
    return NextResponse.json<ApiResult<WeatherPayload>>(
      {
        ok: false,
        error: { code: "BAD_REQUEST", message: "缺少地点参数（lat / lon / name）。" },
      },
      { status: 400 },
    );
  }

  try {
    const data = await getWeather(place);
    return NextResponse.json<ApiResult<WeatherPayload>>({ ok: true, data });
  } catch (error) {
    const appError = toAppError(error);
    return NextResponse.json<ApiResult<WeatherPayload>>(
      { ok: false, error: { code: appError.code, message: appError.message } },
      { status: appError.status },
    );
  }
}
