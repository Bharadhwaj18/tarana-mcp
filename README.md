# tarana-mcp

A read-only [Model Context Protocol](https://modelcontextprotocol.io) server that
lets an AI assistant answer questions about my band's data - songs, setlists and
shows - straight from the Supabase project behind the
[Tarana Setlist Manager](https://github.com/Bharadhwaj18/tarana-setlist-manager)
app.

Ask things like:

- "What songs do we have in G that are over 120 BPM?"
- "Show me the setlist for Friday's gig, in order."
- "How many shows are coming up?"

## Why this exists

The setlist manager is a Next.js + Supabase app with row-level security on every
table. This server exposes that same data to agent tooling over MCP, with the
same RLS guardrails: it only ever runs `SELECT`s, and it can only read what the
credentials you give it are allowed to see.

## Tools

| Tool | What it does |
| --- | --- |
| `list_songs` | List repertoire, filter by search text, key, BPM range |
| `get_song` | One song with chord chart and notes |
| `list_setlists` | Recent setlists |
| `get_setlist` | A setlist with its songs in performance order |
| `list_shows` | Upcoming/past shows, filter by booking status |
| `get_show` | One show plus its setlist |
| `suggest_songs` | Set-builder helper: songs by key/BPM |
| `band_stats` | Counts: songs, setlists, total and upcoming shows |

## Setup

```bash
npm install
cp .env.example .env   # fill in SUPABASE_URL and SUPABASE_ANON_KEY
npm run build
```

### Claude Code

```bash
claude mcp add tarana -- node /path/to/tarana-mcp/dist/index.js
```

### Claude Desktop / any MCP client

```json
{
  "mcpServers": {
    "tarana": {
      "command": "node",
      "args": ["/path/to/tarana-mcp/dist/index.js"],
      "env": {
        "SUPABASE_URL": "https://your-project-ref.supabase.co",
        "SUPABASE_ANON_KEY": "your-anon-key"
      }
    }
  }
}
```

If your RLS policies scope rows to `auth.uid()`, also set
`SUPABASE_ACCESS_TOKEN` to a signed-in user's session token. Without it the
server reads whatever the `anon` role may see - which is the correct behaviour
for a public deployment.

## Safety

- Read-only: not one `insert`, `update`, `delete` or RPC in the code.
- No secrets in the repo: credentials come from `.env` or the client config.
- RLS is the enforcement layer; the anon key is safe to use because your
  policies already decide what it can read.

## Stack

TypeScript, `@modelcontextprotocol/sdk` (stdio transport), `@supabase/supabase-js`, zod.
