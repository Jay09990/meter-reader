import { NextRequest } from "next/server";
import { handleLogin } from "@/app/api/auth/login-handler";

// This endpoint grants the same session only to accounts with an ADMIN role.
export function POST(request: NextRequest) {
  return handleLogin(request, true);
}
