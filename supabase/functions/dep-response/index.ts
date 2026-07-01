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
    // ----------------------------------------------------
    // 1. SPARE PLAYER ACTIONS (The Cascade System)
    // ----------------------------------------------------
    if (action === 'accept') {
      await supabase
        .from('availability')
        .update({ 
          status: 'Spare Assigned', // Matches your React Matrix!
          spare_player_id: spareId  // Saves who accepted the gig!
        }) 
        .match({ player_id: playerId, concert_id: concertId });

      return Response.redirect("https://brassbandwidth.netlify.app?status=accepted", 302);

    } else if (action === 'decline') {
      // Uses maybeSingle() so it never crashes!
      const { data } = await supabase
        .from('availability')
        .select('current_approach_index')
        .match({ player_id: playerId, concert_id: concertId })
        .maybeSingle();
        
      const nextIndex = (data?.current_approach_index || 0) + 1;
      
      await supabase
        .from('availability')
        .update({ current_approach_index: nextIndex, approach_initiated_at: new Date().toISOString() })
        .match({ player_id: playerId, concert_id: concertId });

      // Uses the working Netlify link!
      return Response.redirect("https://brassbandwidth.netlify.app?status=declined", 302);
    }

    // ----------------------------------------------------
    // 2. CORE PLAYER ACTIONS (The Roster Page Emails)
    // ----------------------------------------------------
    else if (action === 'core-accept') {
      await supabase
        .from('availability')
        .update({ status: 'Available' })
        .match({ player_id: playerId, concert_id: concertId });

      return Response.redirect("https://brassbandwidth.netlify.app?status=available", 302);

    } else if (action === 'core-decline') {
      await supabase
        .from('availability')
        .update({ status: 'Not Available' })
        .match({ player_id: playerId, concert_id: concertId });

      return Response.redirect("https://brassbandwidth.netlify.app?status=declined", 302);
    }

    return new Response("Invalid action.", { status: 400 });
  } catch (err: any) {
    return new Response(`Error: ${err.message}`, { status: 500 });
  }
});