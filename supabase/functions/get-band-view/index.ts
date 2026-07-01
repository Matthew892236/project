import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { uid } = await req.json();
    if (!uid) return json({ error: "uid required" }, 400);

    const today = new Date().toISOString().split("T")[0];

    const [concertsRes, playersRes, availRes, profileRes] = await Promise.all([
      supabase.from("concerts").select("id, name, concert_date, start_time, end_time, location").eq("user_id", uid).eq("status", "live").gte("concert_date", today).order("concert_date"),
      supabase.from("players").select("id, name, instrument, status, sort_order").eq("user_id", uid).order("instrument").order("sort_order").order("name"),
      supabase.from("availability").select("player_id, concert_id, status, spare_player_id").eq("user_id", uid),
      supabase.from("profiles").select("band_name").eq("id", uid).maybeSingle(),
    ]);

    return json({
      concerts: concertsRes.data ?? [],
      players: playersRes.data ?? [],
      availability: availRes.data ?? [],
      bandName: profileRes.data?.band_name ?? "Band Schedule",
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
