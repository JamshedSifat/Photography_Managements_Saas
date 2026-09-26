import type { NextRequest } from "next/server";
import { dispatch, type Method } from "@/server/router";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteParams = { params: Promise<{ path: string[] }> };

async function handle(method: Method, req: NextRequest, ctx: RouteParams) {
  const { path } = await ctx.params;
  return dispatch(method, req, path ?? []);
}

export function GET(req: NextRequest, ctx: RouteParams) {
  return handle("GET", req, ctx);
}

export function POST(req: NextRequest, ctx: RouteParams) {
  return handle("POST", req, ctx);
}

export function PATCH(req: NextRequest, ctx: RouteParams) {
  return handle("PATCH", req, ctx);
}

export function PUT(req: NextRequest, ctx: RouteParams) {
  return handle("PUT", req, ctx);
}

export function DELETE(req: NextRequest, ctx: RouteParams) {
  return handle("DELETE", req, ctx);
}
