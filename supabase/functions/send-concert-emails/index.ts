import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// UK Date Formatter
const formatDateUK = (dateStr?: string) => {
  if (!dateStr) return "TBD";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json();
    
    const concert_id = body.concert_id || body.concertId;
    const player_ids = body.player_ids || body.playerIds;
    const general = body.general;
    const subject = body.subject || "";
    
    // 🌟 FIX: Safely catch the custom message no matter how the CRON/Frontend formats it
    const message = body.message || body.customMessage || body.custom_message || null;

    let concertDetails = null;
    if (concert_id) {
      const { data: concert } = await supabase.from('concerts').select('*').eq('id', concert_id).maybeSingle();
      concertDetails = concert;
    }

    let derivedName = "Upcoming Performance";
    if (subject && subject.includes(":")) derivedName = subject.split(":").pop()?.trim() || derivedName;
    else if (subject) derivedName = subject;

    const concertNameDisplay = concertDetails?.name || concertDetails?.concert_name || concertDetails?.title || derivedName;
    const concertDateDisplay = formatDateUK(concertDetails?.concert_date || concertDetails?.date);
    const concertVenueDisplay = concertDetails?.venue || concertDetails?.location || "TBD";

    // 🌟 SMART EMAIL TYPE DETECTION
    const isLineupEmail = subject.toLowerCase().includes('lineup') || subject.toLowerCase().includes('confirmed');
    const showButtons = !general && concertDetails && !isLineupEmail;

    let players = [];
    if (player_ids && player_ids.length > 0) {
      const { data } = await supabase.from('players').select('*').in('id', player_ids);
      if (data) players = data;
    } else if (concertDetails?.band_id) {
      const { data } = await supabase.from('players').select('*').eq('band_id', concertDetails.band_id).eq('status', 'Active');
      if (data) players = data;
    } else return new Response(JSON.stringify({ error: "No players selected." }), { status: 400, headers: corsHeaders });

    let bandId = concertDetails?.band_id || players.find(p => p.band_id)?.band_id;
    let replyToEmail = "admin@brassbandwidth.com"; 
    let bandName = "Band Manager";

    if (bandId) {
      const { data: bandData } = await supabase.from('bands').select('manager_id, name').eq('id', bandId).single();
      if (bandData) {
        bandName = bandData.name || "Band Manager";
        if (bandData.manager_id) {
          const { data: authUser } = await supabase.auth.admin.getUserById(bandData.manager_id);
          if (authUser?.user?.email) replyToEmail = authUser.user.email;
        }
      }
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const BASE_URL = `https://xkwsshbjpevdpvkruqbv.supabase.co/functions/v1/dep-response`;

    for (const player of players) {
      if (!player.email) continue;
      const matrixLink = `https://brassbandwidth.netlify.app/band-view?uid=${player.band_id || bandId}`;

      let htmlBody = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #f8fafc;">
          <h2 style="color: #0f172a; margin-top: 0; font-size: 22px;">${!showButtons ? subject : `Availability Request: ${concertNameDisplay}`} 🎺</h2>
          <p style="color: #334155; font-size: 16px;">Hi ${player.name.split(' ')[0]},</p>
          ${showButtons ? `<p style="color: #334155; font-size: 16px;">Please confirm your availability for our upcoming event: <strong>${concertNameDisplay}</strong>.</p>` : ''}
          ${message ? `<p style="color: #334155; font-size: 14px; white-space: pre-wrap; ${showButtons ? 'font-style: italic; background: #f1f5f9; padding: 12px; border-radius: 6px;' : ''}">${message}</p>` : ''}
      `;

      if (showButtons) {
const acceptLink = `${BASE_URL}?player_id=${player.id}&concert_id=${concertDetails.id}&action=dep-accept&t=${Date.now()}`;
const declineLink = `${BASE_URL}?player_id=${player.id}&concert_id=${concertDetails.id}&action=dep-decline&t=${Date.now()}`;
        htmlBody += `
          <div style="background-color: #ffffff; padding: 16px; border-radius: 6px; border-left: 4px solid #3b82f6; margin: 20px 0;">
            <p style="margin: 0 0 8px 0; color: #1e293b;"><strong>🎵 Event:</strong> ${concertNameDisplay}</p>
            <p style="margin: 0 0 8px 0; color: #1e293b;"><strong>📅 Date:</strong> ${concertDateDisplay}</p>
            <p style="margin: 0; color: #1e293b;"><strong>📍 Location:</strong> ${concertVenueDisplay}</p>
          </div>
          <div style="margin: 28px 0; text-align: center;">
            <a href="${acceptLink}" style="background-color: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin-right: 12px; display: inline-block;">✅ Available</a>
            <a href="${declineLink}" style="background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">✕ Not Available</a>
          </div>
        `;
      }
      
      htmlBody += `
          <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 14px; color: #475569;">
            <p>📊 <a href="${matrixLink}" style="color: #3b82f6; text-decoration: underline; font-weight: 600;">Click here to view the Live Band Availability Matrix</a></p>
      `;

      // 🌟 FIX: Hide the "Join Network" button ONLY from Global Spares.
      // Local spares (who share the band_id) WILL still see the button!
      const isAlreadyGlobal = 
        player.is_global_spare === true || 
        (concertDetails && player.band_id !== concertDetails.band_id) || 
        (!player.band_id);

if (!isAlreadyGlobal) {
        // 🌟 FIX: Point this directly to your Netlify URL instead of BASE_URL so they see the welcome popup box!
const globalNetworkLink = `https://brassbandwidth.netlify.app/respond?status=welcome&action=join-network&player_id=${player.id}`;        
        htmlBody += `<p style="font-size: 13px; color: #94a3b8; margin-top: 20px;">Want more playing opportunities outside the band? <br/>🌍 <a href="${globalNetworkLink}" style="color: #3b82f6; text-decoration: none; font-weight: 500;">Join the Online Network Spares</a></p>`;
      }

      htmlBody += `
            <div style="margin-top: 24px; border-top: 1px dashed #cbd5e1; padding-top: 12px; font-size: 11px; color: #94a3b8; line-height: 1.4;">
              <p style="margin: 0 0 6px 0;"><strong>Data Privacy Notice:</strong> You are receiving this invitation because you are registered as a network spare or listed on a local band roster for BrassBandwidth.</p>
              <p style="margin: 0;">Your contact data is processed strictly for coordinating performance bookings. To request data removal, update your active roster status, or exercise your right to erasure, please contact the platform administrator at <a href="mailto:admin@brassbandwidth.com" style="color: #64748b; text-decoration: underline;">admin@brassbandwidth.com</a>.</p>
            </div>
          </div>
        </div>
      `;

      const finalSubject = subject.includes(concertNameDisplay) ? subject : `${subject} - ${concertNameDisplay}`;

      await fetch("https://api.resend.com/emails", {
        method: "POST", headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: `"${bandName}" <Admin@brassbandwidth.com>`, reply_to: replyToEmail, to: player.email, subject: finalSubject, html: htmlBody }),
      });
    }
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});