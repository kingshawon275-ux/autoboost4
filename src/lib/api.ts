import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { auth } from "@/lib/auth";

export type SessionUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  role: "ADMIN" | "MODERATOR" | "USER";
};

/** Returns the authenticated user or throws a 401 response. */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user) {
    throw NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return session.user as SessionUser;
}

export async function requireRole(roles: Array<SessionUser["role"]>): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    throw NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return user;
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Wraps a handler to normalize thrown responses / zod / unknown errors. */
export function handle(
  fn: () => Promise<NextResponse>,
): Promise<NextResponse> {
  return fn().catch((err) => {
    if (err instanceof NextResponse) return err;
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation failed", issues: err.flatten() },
        { status: 422 },
      );
    }
    console.error("[api] unhandled error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  });
}
