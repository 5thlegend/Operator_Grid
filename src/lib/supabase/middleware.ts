import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/db";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const url = request.nextUrl;
  const isCommand = url.pathname.startsWith("/command");
  const isOnboarding = url.pathname.startsWith("/onboarding");

  if (!user && (isCommand || isOnboarding)) {
    const redirect = url.clone();
    redirect.pathname = "/login";
    redirect.searchParams.set("next", url.pathname);
    return NextResponse.redirect(redirect);
  }

  if (user && isCommand) {
    // gate command deck behind a created operator dossier
    const { data: op } = await supabase
      .from("operators")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    if (!op) {
      const redirect = url.clone();
      redirect.pathname = "/onboarding";
      return NextResponse.redirect(redirect);
    }
  }

  return response;
}
