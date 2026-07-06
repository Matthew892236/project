import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// 🌟 HARDCODED TO YOUR ACTUAL LIVE APP
const FRONTEND_URL = "https://brassbandwidth.netlify.app";

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const url = new URL(req.url);
    const player_id = url.searchParams.get('player_id') || url.searchParams.get('playerId');
    const concert_id = url.searchParams.get('concert_id') || url.searchParams.get('concertId');
    const spare_id = url.searchParams.get('spare_id') || url.searchParams.get('spareId');
    const action = url.searchParams.get('action');

    // 🌟 ACTION 1: Join Network
    if (action === 'join-network' && player_id) {
      await supabase.from('players').update({ status: 'Spare' }).eq('id', player_id);
      return Response.redirect(`${FRONTEND_URL}?status=welcome`, 302);
    }

    if (!player_id || !concert_id || !spare_id) {
      return Response.redirect(`${FRONTEND_URL}?status=invalid`, 302);
    }

    // Fetch the specific row in the matrix
    const { data: currentAvail } = await supabase
      .from('availability')
      .select('*')
      .match({ player_id, concert_id })
      .maybeSingle();

    if (!currentAvail) {
      return Response.redirect(`${FRONTEND_URL}?status=not-found`, 302);
    }

    // 🌟 ACTION 2: Accept Gig
    if (action === 'accept') {
      await supabase
        .from('availability')
        .update({ status: 'Spare Assigned', spare_player_id: spare_id })
        .match({ player_id, concert_id });
        
      return Response.redirect(`${FRONTEND_URL}?status=accepted`, 302);
    }

    // 🌟 ACTION 3: Decline Gig
    if (action === 'decline') {
      const currentIndex = currentAvail.current_approach_index || 0;
      const list = currentAvail.approached_spares || [];

      if (list[currentIndex] && list[currentIndex].id === spare_id) {
        await supabase
          .from('availability')
          .update({ 
            current_approach_index: currentIndex + 1, 
            approach_initiated_at: new Date().toISOString() 
          })
          .match({ player_id, concert_id });
      }
      
      return Response.redirect(`${FRONTEND_URL}?status=declined`, 302);
    }

    return Response.redirect(`${FRONTEND_URL}?status=unknown`, 302);

  } catch (err: any) {
    console.error("Function Crash:", err.message);
    return Response.redirect(`${FRONTEND_URL}?status=error`, 302);
  }
});