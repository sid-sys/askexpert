import { NextRequest, NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Create a new ratelimiter, that allows 10 requests per 10 seconds
// for general API routes, and 3 requests per 10 seconds for sensitive ones.
const redis = (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) 
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

const generalRateLimit = redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "10 s"),
  analytics: true,
}) : null;

const sensitiveRateLimit = redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, "10 s"),
  analytics: true,
}) : null;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only rate limit API routes
  if (pathname.startsWith("/api")) {
    // Skip webhooks (Stripe handles retries and we verify signatures inside the route)
    if (pathname.includes("/webhook")) {
      return NextResponse.next();
    }

    // Identify the user by IP or a unique identifier
    const identifier = request.headers.get("x-forwarded-for") || "anonymous";

    // Use sensitive limits for admin and stripe creation routes
    const isSensitive = pathname.startsWith("/api/admin") || 
                       pathname.includes("/checkout") || 
                       pathname.includes("/session");

    const limit = isSensitive ? sensitiveRateLimit : generalRateLimit;

    if (limit) {
      const { success, limit: _limit, reset, remaining } = await limit.limit(identifier);

      if (!success) {
        return new NextResponse("Too Many Requests", {
          status: 429,
          headers: {
            "X-RateLimit-Limit": _limit.toString(),
            "X-RateLimit-Remaining": remaining.toString(),
            "X-RateLimit-Reset": reset.toString(),
          },
        });
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
