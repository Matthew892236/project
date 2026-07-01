import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const playerId = url.searchParams.get("player_id");
  const concertId = url.searchParams.get("concert_id");
  const spareId = url.searchParams.get("spare_id");
  const action = url.searchParams.get("action");

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    if (action === 'accept') {
      await supabase
        .from('availability')
        .update({ status: 'Green' })
        .match({ player_id: playerId, concert_id: concertId });

      // 🌟 UPDATED: Sends them to your site with a success flag
      return Response.redirect("https://brassbandwidth.com?status=accepted", 302);

    } else if (action === 'decline') {
      const { data } = await supabase
        .from('availability')
        .select('current_approach_index')
        .match({ player_id: playerId, concert_id: concertId })
        .single();
        
      const nextIndex = (data?.current_approach_index || 0) + 1;
      
      await supabase
        .from('availability')
        .update({ current_approach_index: nextIndex, approach_initiated_at: new Date().toISOString() })
        .match({ player_id: playerId, concert_id: concertId });

      // 🌟 UPDATED: Sends them to your site with a declined flag
      return Response.redirect("https://brassbandwidth.com?status=declined", 302);
    }

    return new Response("Invalid action.", { status: 400 });
  } catch (err: any) {
    return new Response(`Error: ${err.message}`, { status: 500 });
  }
});