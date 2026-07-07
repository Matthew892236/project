import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const FRONTEND_URL = "https://brassbandwidth.netlify.app";

Deno.serve(async (req) => {
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    const url = new URL(req.url);
    const player_id = url.searchParams.get('player_id') || url.searchParams.get('playerId');
    const concert_id = url.searchParams.get('concert_id') || url.searchParams.get('concertId');
    const spare_id = url.searchParams.get('spare_id') || url.searchParams.get('spareId');
    const action = url.searchParams.get('action');

if (action === 'join-network' && player_id) {
      await supabase.from('players').update({ is_global_spare: true }).eq('id', player_id);
      return Response.redirect(`${FRONTEND_URL}?status=welcome`, 302);
    }
    if (!player_id || !concert_id) return Response.redirect(`${FRONTEND_URL}?status=invalid`, 302);

    const { data: currentAvail } = await supabase.from('availability').select('*').match({ player_id, concert_id }).maybeSingle();

    if (action === 'core-decline' || action === 'decline') {
      if (currentAvail && (currentAvail.status === 'Available' || currentAvail.status === 'Spare Assigned')) {
        return Response.redirect(`${FRONTEND_URL}?status=contact-manager`, 302);
      }
    }

    if (action === 'core-accept') {
      await supabase.from('availability').upsert({ player_id, concert_id, status: 'Available' });
      return Response.redirect(`${FRONTEND_URL}?status=accepted`, 302);
    }
    if (action === 'core-decline') {
      await supabase.from('availability').upsert({ player_id, concert_id, status: 'Not Available' });
      return Response.redirect(`${FRONTEND_URL}?status=declined`, 302);
    }

    if (action === 'accept' && spare_id) {
      const { data: anchorPlayer } = await supabase.from('players').select('status').eq('id', player_id).single();
      const isVacantCascade = anchorPlayer?.status === 'Spare';

      if (isVacantCascade) {
        if (spare_id === player_id) {
          await supabase.from('availability').update({ status: 'Available' }).match({ player_id, concert_id });
        } else {
          await supabase.from('availability').update({ status: 'Spare Assigned', spare_player_id: spare_id }).match({ player_id, concert_id });
        }
      } else {
        await supabase.from('availability').update({ status: 'Spare Assigned', spare_player_id: spare_id }).match({ player_id, concert_id });
      }
      return Response.redirect(`${FRONTEND_URL}?status=accepted`, 302);
    }

    if (action === 'decline' && spare_id) {
      const currentIndex = currentAvail?.current_approach_index || 0;
      const list = currentAvail?.approached_spares || [];
      if (list[currentIndex] && list[currentIndex].id === spare_id) {
        await supabase.from('availability').update({ current_approach_index: currentIndex + 1, approach_initiated_at: new Date().toISOString() }).match({ player_id, concert_id });
      }
      return Response.redirect(`${FRONTEND_URL}?status=declined`, 302);
    }

    return Response.redirect(`${FRONTEND_URL}?status=unknown`, 302);
  } catch (err: any) {
    return Response.redirect(`${FRONTEND_URL}?status=error`, 302);
  }
});