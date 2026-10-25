import { NextResponse } from "next/server";
import { COOKIE_NAME } from "@/server/auth";
import { noStore } from "@/server/http";

/** PROTECTED (security). See AGENTS.project.md. */
export async function POST() {
  const res = NextResponse.json({ ok: true }, { headers: noStore });
  res.cookies.set(COOKIE_NAME, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 0 });
  return res;
}
