import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type z } from "zod";
import type { SessionUser } from "./shared";

/** Request context passed to every API view (DRF-style). */
export type PublicCtx = {
  req: NextRequest;
  params: Record<string, string>;
  query: URLSearchParams;
  user: SessionUser | null;
};
export type Ctx = PublicCtx & { user: SessionUser };

export class ApiError extends Error {
  status: number;
  fields?: Record<string, string>;
  constructor(status: number, message: string, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

export const notFound = (what = "Resource") => new ApiError(404, `${what} not found`);
export const forbidden = (message = "You do not have permission to perform this action.") => new ApiError(403, message);

export function zodFields(err: ZodError) {
  const fields: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.map(String).join(".") || "_";
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export function errorResponse(err: unknown) {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: err.message, fields: err.fields }, { status: err.status });
  }
  if (err instanceof ZodError) {
    const fields = zodFields(err);
    const [firstKey, firstMsg] = Object.entries(fields)[0] ?? [];
    const label = firstKey && firstKey !== "_" ? `${firstKey}: ` : "";
    return NextResponse.json({ error: firstMsg ? `${label}${firstMsg}` : "Validation failed", fields }, { status: 400 });
  }
  const code = (err as { code?: string } | null)?.code;
  if (code === "23505") return NextResponse.json({ error: "A record with these details already exists." }, { status: 409 });
  if (code === "23503") return NextResponse.json({ error: "This record is referenced by other data." }, { status: 409 });
  console.error("[api] unhandled error", err);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

export async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ApiError(400, "Request body must be valid JSON.");
  }
}

export async function parseBody<S extends z.ZodType>(req: NextRequest, schema: S): Promise<z.output<S>> {
  const body = await readJson(req);
  return schema.parse(body);
}

export function intParam(value: string | undefined | null, name = "id"): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new ApiError(400, `Invalid ${name}.`);
  return n;
}

export function optionalInt(value: string | null | undefined): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

export function pagination(query: URLSearchParams, defaults: { pageSize: number; max: number } = { pageSize: 20, max: 200 }) {
  const page = Math.max(1, Number(query.get("page")) || 1);
  const requested = Number(query.get("pageSize") || query.get("page_size")) || defaults.pageSize;
  const pageSize = Math.min(defaults.max, Math.max(1, requested));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function paginated<T>(results: T[], count: number, page: number, pageSize: number) {
  return { results, count, page, pageSize, totalPages: Math.max(1, Math.ceil(count / pageSize)) };
}

export function isHttps(req: NextRequest) {
  const forwarded = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return forwarded ? forwarded === "https" : req.nextUrl.protocol === "https:";
}

export function getOrigin(req: NextRequest) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || req.nextUrl.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || req.headers.get("host") || req.nextUrl.host;
  return `${proto}://${host}`;
}

export function created<T>(data: T) {
  return NextResponse.json(data, { status: 201 });
}
