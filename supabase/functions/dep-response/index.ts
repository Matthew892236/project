import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    const { pid: player_id, cid: concert_id, act: action } = await req.json();

    if (action === 'join-network' && player_id) {
      await supabase.from('players').update({ is_global_spare: true }).eq('id', player_id);
      return new Response(JSON.stringify({ status: 'welcome' }), { headers: corsHeaders });
    }
    
    if (!player_id || !concert_id) return new Response(JSON.stringify({ status: 'invalid' }), { headers: corsHeaders });

    const { data: allAvails } = await supabase.from('availability').select('*').eq('concert_id', concert_id);
    
    let targetedAvail = allAvails?.find(a => a.approached_spares?.some((s: any) => s.id === player_id));
    let anchor_player_id = targetedAvail ? targetedAvail.player_id : player_id;
    let currentAvail = targetedAvail || allAvails?.find(a => a.player_id === player_id);

    // 🌟 THE BLOCKER: Prevent players from changing their minds without contacting the manager!
    if (currentAvail && currentAvail.status && currentAvail.status !== 'Not Responded') {
        const isAccepting = action === 'core-accept' || action === 'dep-accept' || action === 'accept';
        const isDeclining = action === 'core-decline' || action === 'dep-decline' || action === 'decline';

        // 1. If the seat was already taken by someone else
        if ((currentAvail.status === 'Available' && currentAvail.player_id !== player_id) || 
            (currentAvail.status === 'Spare Assigned' && currentAvail.spare_player_id !== player_id && currentAvail.player_id !== player_id)) {
            return new Response(JSON.stringify({ status: 'contact-manager' }), { headers: corsHeaders });
        }

        // 2. If they already Accepted, but now clicked Decline
        if (isDeclining && (currentAvail.status === 'Available' || currentAvail.status === 'Spare Assigned')) {
            return new Response(JSON.stringify({ status: 'contact-manager' }), { headers: corsHeaders });
        }

        // 3. If they already Declined, but now clicked Accept
        if (isAccepting && currentAvail.status === 'Not Available') {
            return new Response(JSON.stringify({ status: 'contact-manager' }), { headers: corsHeaders });
        }
    }

    if (action === 'core-accept') {
      await supabase.from('availability').upsert({ player_id: anchor_player_id, concert_id, status: 'Available' }, { onConflict: 'player_id,concert_id' });
      return new Response(JSON.stringify({ status: 'accepted' }), { headers: corsHeaders });
    }
    
    if (action === 'core-decline') {
      await supabase.from('availability').upsert({ player_id: anchor_player_id, concert_id, status: 'Not Available' }, { onConflict: 'player_id,concert_id' });
      return new Response(JSON.stringify({ status: 'declined' }), { headers: corsHeaders });
    }

    if (action === 'dep-accept' || action === 'accept') {
      if (targetedAvail) {
        await supabase.from('availability').update({ status: 'Spare Assigned', spare_player_id: player_id }).match({ player_id: anchor_player_id, concert_id });
      } else {
        await supabase.from('availability').upsert({ player_id: player_id, concert_id, status: 'Available' }, { onConflict: 'player_id,concert_id' });
      }
      return new Response(JSON.stringify({ status: 'accepted' }), { headers: corsHeaders });
    }

    if (action === 'dep-decline' || action === 'decline') {
      if (targetedAvail) {
        const currentIndex = targetedAvail.current_approach_index || 0;
        const list = targetedAvail.approached_spares || [];
        
        if (list[currentIndex] && list[currentIndex].id === player_id) {
          const nextIndex = currentIndex + 1;
          
          const { data } = await supabase.from('availability')
            .update({ current_approach_index: nextIndex, approach_initiated_at: new Date().toISOString() })
            .eq('player_id', anchor_player_id).eq('concert_id', concert_id).eq('current_approach_index', currentIndex)
            .select();

          if (data && data.length > 0 && list[nextIndex]) {
             await supabase.functions.invoke('send-concert-emails', {
               body: { concert_id, player_ids: [list[nextIndex].id], message: targetedAvail.custom_message }
             });
          }
        }
      }
      return new Response(JSON.stringify({ status: 'declined' }), { headers: corsHeaders });
    }

    return new Response(JSON.stringify({ status: 'unknown' }), { headers: corsHeaders });
  } catch (err: any) {
    return new Response(JSON.stringify({ status: 'error', error: err.message }), { headers: corsHeaders });
  }
});