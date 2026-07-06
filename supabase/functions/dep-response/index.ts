import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const url = new URL(req.url);
    const playerId = url.searchParams.get("player_id");
    const concertId = url.searchParams.get("concert_id");
    const action = url.searchParams.get("action");

    if (!playerId || !action || !concertId) {
      return new Response("Missing tracking loop parameters.", { status: 400 });
    }

    let pageTitle = "Response Recorded";
    let messageHeading = "Thank You!";
    let messageBody = "Your availability options have been safely synced.";
    let primaryColor = "#1e3a5f"; 

    // 🌟 FAILPROOF LOOKUP: Fetch active cascades for this gig, then match in memory
    const { data: activeCascades } = await supabase
      .from('availability')
      .select('*, concerts(name)')
      .eq('concert_id', concertId)
      .eq('status', 'Spares Contacted');

    const activeCascade = activeCascades?.find((a: any) => 
      a.approached_spares && Array.isArray(a.approached_spares) && 
      a.approached_spares.some((s: any) => s.id === playerId)
    );

    // 🟢 CASE A: THE DEP ACCEPTS THE GIG
    if (action === "core-accept") {
      pageTitle = "Booking Confirmed";
      messageHeading = "See You There!";
      messageBody = "Your confirmation has been saved. The Band Manager has been updated and you have been locked into the lineup grid.";
      primaryColor = "#16a34a";

      // 1. Set the individual spare player row status to Available
      await supabase.from('availability').upsert({
        player_id: playerId,
        concert_id: concertId,
        status: 'Available'
      }, { onConflict: 'player_id,concert_id' });

      // 2. 🌟 FIX: Target the Core Musician row using the composite key tracking metrics
      if (activeCascade) {
        await supabase.from('availability')
          .update({
            status: 'Spare Assigned',
            spare_player_id: playerId
          })
          .eq('player_id', activeCascade.player_id)
          .eq('concert_id', activeCascade.concert_id);
      }
    } 
    
    // 🔴 CASE B: THE DEP DECLINES THE GIG (ADVANCE CASCADE ENGINE LINK)
    else if (action === "core-decline") {
      pageTitle = "Declined Successfully";
      messageHeading = "Notice Received";
      messageBody = "You have marked yourself as unavailable. The system will now automatically dispatch a radar request to the next spare in line.";
      primaryColor = "#dc2626";

      // 1. Set the individual spare player row status to Not Available
      await supabase.from('availability').upsert({
        player_id: playerId,
        concert_id: concertId,
        status: 'Not Available'
      }, { onConflict: 'player_id,concert_id' });

      // 2. 🌟 FIX: Calculate index steps and update Core Musician row via composite key
      if (activeCascade) {
        const currentIdx = activeCascade.current_approach_index ?? 0;
        const nextIdx = currentIdx + 1;
        const shortlist = activeCascade.approached_spares || [];

        if (nextIdx < shortlist.length) {
          const nextSpare = shortlist[nextIdx];
          
          await supabase.from('availability')
            .update({
              current_approach_index: nextIdx,
              approach_initiated_at: new Date().toISOString()
            })
            .eq('player_id', activeCascade.player_id)
            .eq('concert_id', activeCascade.concert_id);

          // Trigger the email engine for the next player down the shortlist array
          await supabase.functions.invoke('send-concert-emails', {
            body: {
              concert_id: concertId,
              player_ids: [nextSpare.id],
              is_cascade: true,
              subject: `Gig Dep Request: ${activeCascade.concerts?.name || 'Upcoming Performance'}`,
              message: "An open position has advanced to your position in our automated availability radar network list. Please let us know your availability using the status controls below."
            }
          });
        } else {
          // Roster shortlist completely exhausted. Return core seat layout back to unassigned state
          await supabase.from('availability')
            .update({
              status: 'Not Responded',
              approached_spares: [],
              current_approach_index: 0,
              approach_initiated_at: null
            })
            .eq('player_id', activeCascade.player_id)
            .eq('concert_id', activeCascade.concert_id);
        }
      }
    }

    const htmlResponse = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${pageTitle}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: #0f172a; color: #f8fafc; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
          .card { background-color: #ffffff; color: #0f172a; padding: 40px; border-radius: 16px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); width: 100%; max-width: 440px; text-align: center; }
          .icon-box { display: inline-flex; align-items: center; justify-content: center; width: 64px; height: 64px; background-color: #f1f5f9; border-radius: 50%; margin-bottom: 24px; color: ${primaryColor}; }
          h1 { font-size: 24px; font-weight: 800; color: #1e3a5f; margin: 0 0 12px 0; }
          p { color: #475569; font-size: 15px; line-height: 1.6; margin: 0 0 24px 0; }
          .footer-brand { font-size: 12px; color: #94a3b8; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon-box">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
          </div>
          <h1>${messageHeading}</h1>
          <p>${messageBody}</p>
          <div style="height: 1px; background-color: #e2e8f0; margin-bottom: 16px;"></div>
          <span class="footer-brand">Powered by Brassbandwidth</span>
        </div>
      </body>
      </html>
    `;

    return new Response(htmlResponse, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/html; charset=UTF-8" }
    });

  } catch (err: any) {
    return new Response(`Error executing loop pipeline routing step: ${err.message}`, { status: 500 });
  }
});