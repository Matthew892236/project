import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

    const { player_ids, general, subject, message, concert_id } = await req.json();

    if (!player_ids || player_ids.length === 0) {
      return new Response(JSON.stringify({ error: "No players selected" }), { status: 400, headers: corsHeaders });
    }

    // Pull targeted player profiles
    const { data: players } = await supabase
      .from('players')
      .select('id, name, email, is_global_spare, band_id') 
      .in('id', player_ids);

    if (!players || players.length === 0) {
      return new Response(JSON.stringify({ error: "Players not found" }), { status: 404, headers: corsHeaders });
    }

    let concertDetails = null;
    if (!general && concert_id) {
      const { data: concert } = await supabase
        .from('concerts')
        .select('*')
        .eq('id', concert_id)
        .single();
      concertDetails = concert;
    }

    // 🌟 RESOLVE SENDER IDENTITY & REPLY-TO ROUTING
    let bandId = concertDetails?.band_id;
    if (!bandId && players && players.length > 0) {
      const corePlayer = players.find(p => p.band_id);
      if (corePlayer) bandId = corePlayer.band_id;
    }

    let replyToEmail = "admin@brassbandwidth.com"; 
    let bandName = "Band Manager";

    if (bandId) {
      const { data: bandData } = await supabase
        .from('bands')
        .select('manager_id, name')
        .eq('id', bandId)
        .single();

      if (bandData) {
        bandName = bandData.name || "Band Manager";
        if (bandData.manager_id) {
          // Use service role authority to fetch the manager's account email address
          const { data: authUser } = await supabase.auth.admin.getUserById(bandData.manager_id);
          if (authUser?.user?.email) {
            replyToEmail = authUser.user.email;
          }
        }
      }
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const PROJECT_ID = "xkwsshbjpevdpvkruqbv"; 
    const BASE_URL = `https://${PROJECT_ID}.supabase.co/functions/v1/dep-response`;

    for (const player of players) {
      if (!player.email) continue;

      const currentBandId = player.band_id || bandId || "";
      const matrixLink = `https://brassbandwidth.netlify.app/band-view?uid=${currentBandId}`;

      let htmlBody = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #f8fafc;">
          <h2 style="color: #0f172a; margin-top: 0; font-size: 22px;">${subject}</h2>
          <p style="color: #334155; font-size: 16px;">Hi ${player.name.split(' ')[0]},</p>
          <p style="color: #334155; font-size: 16px; white-space: pre-wrap;">${message}</p>
      `;

      if (!general && concertDetails) {
        const acceptLink = `${BASE_URL}?player_id=${player.id}&concert_id=${concertDetails.id}&action=core-accept`;
        const declineLink = `${BASE_URL}?player_id=${player.id}&concert_id=${concertDetails.id}&action=core-decline`;

        htmlBody += `
          <div style="background-color: #ffffff; padding: 16px; border-radius: 6px; border-left: 4px solid #3b82f6; margin: 20px 0;">
            <p style="margin: 0 0 8px 0;"><strong>📅 Date:</strong> ${concertDetails.date || concertDetails.concert_date}</p>
            <p style="margin: 0;"><strong>📍 Location:</strong> ${concertDetails.venue || concertDetails.location || 'TBD'}</p>
          </div>

          <div style="margin: 28px 0; text-align: center;">
            <a href="${acceptLink}" style="background-color: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin-right: 12px; display: inline-block;">✅ Available</a>
            <a href="${declineLink}" style="background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">✕ Not Available</a>
          </div>
        `;
      }
      
      htmlBody += `
          <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 14px; color: #475569;">
            <p>📊 <a href="${matrixLink}" style="color: #3b82f6; text-decoration: underline;">Click here to view the Live Band Availability Matrix</a></p>
      `;

      if (!player.is_global_spare) {
        const globalNetworkLink = `${BASE_URL}?player_id=${player.id}&action=join-network`;
        htmlBody += `
            <p style="font-size: 13px; color: #94a3b8; margin-top: 20px;">
              Want more playing opportunities outside the band? <br/>
              🌍 <a href="${globalNetworkLink}" style="color: #3b82f6; text-decoration: none; font-weight: 500;">Join the Online Network Spares</a>
            </p>
        `;
      }

      htmlBody += `
          </div>
        </div>
      `;

      // Dispatch via Resend API
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `${bandName} <Admin@brassbandwidth.com>`, // 🌟 Band name in header title!
          reply_to: replyToEmail,                         // 🌟 Routed back to manager email address!
          to: player.email,
          subject: subject,
          html: htmlBody,
        }),
      });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});