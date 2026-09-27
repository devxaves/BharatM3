import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response | unknown>;

/** Uniform JSON error envelope for every route handler. */
export function route<C = { params: Record<string, string> }>(fn: Handler<C>) {
  return async (req: Request, ctx: C) => {
    try {
      const out = await fn(req, ctx);
      return out instanceof Response ? out : NextResponse.json(out);
    } catch (err) {
      if (err instanceof ApiError) return NextResponse.json({ error: err.message, details: err.details }, { status: err.status });
      if (err instanceof ZodError) return NextResponse.json({ error: 'Validation failed', details: err.flatten() }, { status: 400 });
      console.error('[api]', err);
      return NextResponse.json({ error: (err as Error).message ?? 'Internal error' }, { status: 500 });
    }
  };
}
