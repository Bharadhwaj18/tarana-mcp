import { createClient, SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/**
 * Lazy Supabase client. Read-only by construction: the tools below only ever
 * call .select(). The anon key plus your RLS policies are the guardrails -
 * the server can read exactly what the signed-in user (or anon role) may see.
 */
export function getDb(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

  if (!url || !anonKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_ANON_KEY. Copy .env.example to .env and fill them in."
    );
  }

  client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: accessToken
      ? { headers: { Authorization: `Bearer ${accessToken}` } }
      : undefined,
  });
  return client;
}

export interface Song {
  id: string;
  title: string;
  artist: string | null;
  song_key: string | null;
  bpm: number | null;
  time_signature: string | null;
  chord_chart: string | null;
  notes: string | null;
  created_at: string;
}

export interface Setlist {
  id: string;
  title: string;
  show_id: string | null;
  show_date: string | null;
  venue: string | null;
  created_at: string;
}

export interface SetlistEntry {
  position: number;
  section: string | null;
  song: Song;
}

export interface Show {
  id: string;
  title: string;
  show_date: string | null;
  venue: string | null;
  booking_status: string | null;
  created_at: string;
}
