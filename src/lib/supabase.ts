import { createClient, SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (typeof window === "undefined") return null;
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;

  client = createClient(url, anon, {
    realtime: { params: { eventsPerSecond: 10 } },
  });
  return client;
}

export function randomUserId(): string {
  return Math.random().toString(36).slice(2, 10);
}
