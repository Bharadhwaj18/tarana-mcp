#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getDb, SetlistEntry } from "./db.js";

const server = new McpServer({
  name: "tarana-mcp",
  version: "1.0.0",
});

const SONG_COLS =
  "id, title, artist, song_key, bpm, time_signature, chord_chart, notes, created_at";

function text(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

server.registerTool(
  "list_songs",
  {
    title: "List songs",
    description:
      "List songs in the band's repertoire, optionally filtered by a title/artist search, musical key, or minimum/maximum BPM.",
    inputSchema: {
      search: z
        .string()
        .optional()
        .describe("Case-insensitive match on title or artist"),
      song_key: z
        .string()
        .optional()
        .describe("Exact musical key, e.g. 'Am' or 'C#'"),
      bpm_min: z.number().int().optional(),
      bpm_max: z.number().int().optional(),
      limit: z.number().int().min(1).max(200).default(50),
    },
  },
  async ({ search, song_key, bpm_min, bpm_max, limit }) => {
    let q = getDb()
      .from("songs")
      .select(SONG_COLS)
      .order("title", { ascending: true })
      .limit(limit);
    if (search) q = q.or(`title.ilike.%${search}%,artist.ilike.%${search}%`);
    if (song_key) q = q.eq("song_key", song_key);
    if (bpm_min !== undefined) q = q.gte("bpm", bpm_min);
    if (bpm_max !== undefined) q = q.lte("bpm", bpm_max);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return text({ count: data.length, songs: data });
  }
);

server.registerTool(
  "get_song",
  {
    title: "Get a song",
    description:
      "Get one song by id, including its chord chart and rehearsal notes.",
    inputSchema: { song_id: z.string().uuid() },
  },
  async ({ song_id }) => {
    const { data, error } = await getDb()
      .from("songs")
      .select(SONG_COLS)
      .eq("id", song_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return text({ error: "song not found" });
    return text(data);
  }
);

server.registerTool(
  "list_setlists",
  {
    title: "List setlists",
    description: "List setlists, newest first.",
    inputSchema: {
      limit: z.number().int().min(1).max(100).default(20),
    },
  },
  async ({ limit }) => {
    const { data, error } = await getDb()
      .from("setlists")
      .select("id, title, show_id, show_date, venue, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return text({ count: data.length, setlists: data });
  }
);

server.registerTool(
  "get_setlist",
  {
    title: "Get a setlist",
    description:
      "Get one setlist by id with its songs in performance order, grouped by section when sections are used.",
    inputSchema: { setlist_id: z.string().uuid() },
  },
  async ({ setlist_id }) => {
    const db = getDb();
    const { data: setlist, error: e1 } = await db
      .from("setlists")
      .select("id, title, show_id, show_date, venue, created_at")
      .eq("id", setlist_id)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!setlist) return text({ error: "setlist not found" });

    const { data: rows, error: e2 } = await db
      .from("setlist_songs")
      .select(`position, section, song:songs(${SONG_COLS})`)
      .eq("setlist_id", setlist_id)
      .order("position", { ascending: true });
    if (e2) throw new Error(e2.message);

    const entries = (rows ?? []) as unknown as SetlistEntry[];
    return text({ ...setlist, songs: entries });
  }
);

server.registerTool(
  "list_shows",
  {
    title: "List shows",
    description:
      "List shows (gigs). Filter upcoming/past and by booking status (e.g. Enquiry, Confirmed, Advance Received, Completed).",
    inputSchema: {
      when: z.enum(["upcoming", "past", "all"]).default("upcoming"),
      booking_status: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(20),
    },
  },
  async ({ when, booking_status, limit }) => {
    const today = new Date().toISOString().slice(0, 10);
    let q = getDb()
      .from("shows")
      .select("id, title, show_date, venue, booking_status, created_at")
      .limit(limit);
    if (when === "upcoming")
      q = q.gte("show_date", today).order("show_date", { ascending: true });
    else if (when === "past")
      q = q.lt("show_date", today).order("show_date", { ascending: false });
    else q = q.order("show_date", { ascending: false, nullsFirst: false });
    if (booking_status) q = q.eq("booking_status", booking_status);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return text({ count: data.length, shows: data });
  }
);

server.registerTool(
  "get_show",
  {
    title: "Get a show",
    description: "Get one show by id, plus its setlist when one exists.",
    inputSchema: { show_id: z.string().uuid() },
  },
  async ({ show_id }) => {
    const db = getDb();
    const { data: show, error: e1 } = await db
      .from("shows")
      .select("id, title, show_date, venue, booking_status, created_at")
      .eq("id", show_id)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!show) return text({ error: "show not found" });

    const { data: setlist } = await db
      .from("setlists")
      .select("id, title, show_date, venue")
      .eq("show_id", show_id)
      .maybeSingle();
    return text({ ...show, setlist: setlist ?? null });
  }
);

server.registerTool(
  "suggest_songs",
  {
    title: "Suggest songs for a set",
    description:
      "Suggest songs for building a set, filtered by key and/or BPM range. Useful for 'give me upbeat songs in G' style requests.",
    inputSchema: {
      song_key: z.string().optional(),
      bpm_min: z.number().int().optional(),
      bpm_max: z.number().int().optional(),
      limit: z.number().int().min(1).max(50).default(10),
    },
  },
  async ({ song_key, bpm_min, bpm_max, limit }) => {
    let q = getDb()
      .from("songs")
      .select("id, title, artist, song_key, bpm, time_signature")
      .limit(limit);
    if (song_key) q = q.eq("song_key", song_key);
    if (bpm_min !== undefined) q = q.gte("bpm", bpm_min);
    if (bpm_max !== undefined) q = q.lte("bpm", bpm_max);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return text({ count: data.length, suggestions: data });
  }
);

server.registerTool(
  "band_stats",
  {
    title: "Band stats",
    description:
      "Quick overview: total songs, setlists, shows, and how many shows are coming up.",
    inputSchema: {},
  },
  async () => {
    const db = getDb();
    const today = new Date().toISOString().slice(0, 10);
    const count = async (table: string, filter?: (q: any) => any) => {
      let q = db.from(table).select("*", { count: "exact", head: true });
      if (filter) q = filter(q);
      const { count: c, error } = await q;
      if (error) throw new Error(error.message);
      return c ?? 0;
    };
    return text({
      songs: await count("songs"),
      setlists: await count("setlists"),
      shows_total: await count("shows"),
      shows_upcoming: await count("shows", (q) => q.gte("show_date", today)),
    });
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
