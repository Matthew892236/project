import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const FRONTEND_URL = "https://brassbandwidth.netlify.app";

Deno.serve(async (req) => {
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    const url = new URL(req.url);
    const player_id = url.searchParams.get('player_id') || url.searchParams.get('playerId');
    const concert_id = url.searchParams.get('concert_id') || url.searchParams.get('concertId');
    const action = url.searchParams.get('action');

    if (action === 'join-network' && player_id) {
      await supabase.from('players').update({ is_global_spare: true }).eq('id', player_id);
      return Response.redirect(`${FRONTEND_URL}/respond?status=welcome`, 302);
    }
    
    if (!player_id || !concert_id) return Response.redirect(`${FRONTEND_URL}/respond?status=invalid`, 302);

    // Smart Radar Lookup: Locate the true availability row that this dep/spare was shortlisted on
    const { data: allAvails } = await supabase.from('availability').select('*').eq('concert_id', concert_id);
    let currentAvail = allAvails?.find(a => a.player_id === player_id || a.approached_spares?.some((s: any) => s.id === player_id));
    
    const anchor_player_id = currentAvail ? currentAvail.player_id : player_id;

    // Handle Core Member Updates
    if (action === 'core-accept') {
      await supabase.from('availability').upsert({ player_id: anchor_player_id, concert_id, status: 'Available' }, { onConflict: 'player_id,concert_id' });
      return Response.redirect(`${FRONTEND_URL}/respond?status=accepted`, 302);
    }
    if (action === 'core-decline') {
      await supabase.from('availability').upsert({ player_id: anchor_player_id, concert_id, status: 'Not Available' }, { onConflict: 'player_id,concert_id' });
      return Response.redirect(`${FRONTEND_URL}/respond?status=declined`, 302);
    }

    // Handle Dep/Spare Responses
    if (action === 'dep-accept' || action === 'accept') {
      const { data: anchorPlayer } = await supabase.from('players').select('status').eq('id', anchor_player_id).single();
      const isVacantCascade = anchorPlayer?.status === 'Spare';

      if (isVacantCascade && player_id === anchor_player_id) {
        await supabase.from('availability').update({ status: 'Available' }).match({ player_id: anchor_player_id, concert_id });
      } else {
        await supabase.from('availability').update({ status: 'Spare Assigned', spare_player_id: player_id }).match({ player_id: anchor_player_id, concert_id });
      }
      return Response.redirect(`${FRONTEND_URL}/respond?status=accepted`, 302);
    }

    if (action === 'dep-decline' || action === 'decline') {
      if (currentAvail) {
        const currentIndex = currentAvail.current_approach_index || 0;
        const list = currentAvail.approached_spares || [];
        
        if (list[currentIndex] && list[currentIndex].id === player_id) {
          await supabase.from('availability').update({ 
            current_approach_index: currentIndex + 1, 
            approach_initiated_at: new Date().toISOString() 
          }).match({ player_id: anchor_player_id, concert_id });
        }
      }
      return Response.redirect(`${FRONTEND_URL}/respond?status=declined`, 302);
    }

    return Response.redirect(`${FRONTEND_URL}/respond?status=unknown`, 302);
  } catch (err: any) {
    return Response.redirect(`${FRONTEND_URL}/respond?status=error`, 302);
  }
});