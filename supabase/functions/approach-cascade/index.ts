import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const { record, old_record } = await req.json();

    const shouldTrigger = 
      record.status === 'Spares Contacted' && 
      (!old_record || old_record.status !== 'Spares Contacted' || record.current_approach_index !== old_record.current_approach_index);

    if (!shouldTrigger) {
      return new Response(JSON.stringify({ message: "No escalation required" }), { status: 200 });
    }

    const currentIndex = record.current_approach_index || 0;
    const list = record.approached_spares || [];

    if (currentIndex >= list.length) {
      await supabase
        .from('availability')
        .update({ status: 'Not Available', approach_initiated_at: null })
        .match({ player_id: record.player_id, concert_id: record.concert_id });
        
      return new Response(JSON.stringify({ message: "Shortlist fully exhausted" }), { status: 200 });
    }

    const targetSpare = list[currentIndex];

    // 1. Fetch the player's email address
    const { data: playerProfile } = await supabase
      .from('players')
      .select('email')
      .eq('id', targetSpare.id)
      .single();

    // 2. Fetch the specific gig details using the concert_id
    const { data: concertDetails } = await supabase
      .from('concerts')
      .select('*') 
      .eq('id', record.concert_id)
      .single();

    // 3. Fetch the band name using the ID found
    let bandName = "Brass Band Opportunity"; 
    const foundBandId = concertDetails?.band_id || concertDetails?.bandId;

    if (foundBandId) {
      const { data: bandData } = await supabase
        .from('bands')
        .select('*')
        .eq('id', foundBandId)
        .single();
        
      if (bandData) {
        bandName = bandData?.name || bandData?.band_name || bandData?.title || bandName;
      }
    }

    if (!playerProfile?.email) {
      await supabase
        .from('availability')
        .update({ current_approach_index: currentIndex + 1, approach_initiated_at: new Date().toISOString() })
        .match({ player_id: record.player_id, concert_id: record.concert_id });
        
      return new Response(JSON.stringify({ message: "Missing email address, skipping forward" }), { status: 200 });
    }

    // ✉️ RESEND EMAIL INTEGRATION
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const PROJECT_ID = "xkwsshbjpevdpvkruqbv";
    const BASE_URL = `https://${PROJECT_ID}.supabase.co/functions/v1/dep-response`;

    // 🌟 LINK FIXES: Accept/Decline update the Core Player's row, Join Network updates the Spare's row!
    const acceptLink = `${BASE_URL}?player_id=${record.player_id}&concert_id=${record.concert_id}&spare_id=${targetSpare.id}&action=accept`;
    const declineLink = `${BASE_URL}?player_id=${record.player_id}&concert_id=${record.concert_id}&spare_id=${targetSpare.id}&action=decline`;
    
    // 🌟 THE FIX: The working Global Network opt-in link using the SPARE's ID!
    const globalNetworkLink = `${BASE_URL}?player_id=${targetSpare.id}&action=join-network`; 
    
    const managerMailto = `mailto:${concertDetails?.manager_email || 'Admin@brassbandwidth.com'}?subject=Regarding Gig on ${concertDetails?.date || 'Upcoming'}`;

    const emailHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background-color: #f8fafc; padding: 24px; border-radius: 8px; border: 1px solid #e2e8f0;">
        <h2 style="color: #0f172a; margin-top: 0; font-size: 22px;">Gig Invitation: ${bandName} 🎺</h2>
        <p style="color: #334155; font-size: 16px;">Hi ${targetSpare.name.split(' ')[0]},</p>
        <p style="color: #334155; font-size: 16px;">Are you available to dep for us? Here are the performance details:</p>
        
        <div style="background-color: #ffffff; padding: 16px; border-radius: 6px; border-left: 4px solid #3b82f6; margin: 20px 0;">
          <p style="margin: 0 0 8px 0; color: #1e293b;"><strong>📅 Date:</strong> ${concertDetails?.date || concertDetails?.concert_date || 'TBD'}</p>
          <p style="margin: 0; color: #1e293b;"><strong>📍 Venue:</strong> ${concertDetails?.venue || concertDetails?.location || 'TBD'}</p>
        </div>
        
        <div style="margin: 28px 0; text-align: center;">
          <a href="${acceptLink}" style="background-color: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin-right: 12px; display: inline-block;">✅ Accept Gig</a>
          <a href="${declineLink}" style="background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">✕ Decline</a>
        </div>

        <p style="font-size: 13px; color: #64748b; line-height: 1.5;">
          ⏱️ <em>Note: If you do not respond, this invitation will automatically roll forward to the next player on our list.</em>
        </p>

        <div style="margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 14px; color: #475569;">
          <p>💬 Questions? <a href="${managerMailto}" style="color: #3b82f6; text-decoration: underline;">Message the Band Manager</a></p>
          <p style="font-size: 13px; color: #94a3b8; margin-top: 20px;">
            Want more playing opportunities? <a href="${globalNetworkLink}" style="color: #3b82f6; text-decoration: none; font-weight: 500;">Would you like to join the Global Spares network?</a>
          </p>
        </div>
      </div>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${bandName} Manager <Admin@brassbandwidth.com>`, 
        to: playerProfile.email,
        subject: `Gig Request: ${bandName}`,
        html: emailHtml,
      }),
    });

    if (!res.ok) {
        const errData = await res.text();
        throw new Error(`Resend API Error: ${errData}`);
    }

    return new Response(JSON.stringify({ message: `Live email successfully fired to ${targetSpare.name}` }), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});