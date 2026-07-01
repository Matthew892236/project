import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const appUrl = Deno.env.get("APP_URL") || "https://localhost:5173";

    // Read Brevo API key from Vault
    const { data: brevoApiKey } = await supabase.rpc("get_vault_secret", { secret_name: "BREVO_API_KEY" });

    const body = await req.json();
    const { concert_id, player_ids, chase, general, subject: customSubject, message: customMessage } = body;

    // ──────────────────────────────────────────────
    // GENERAL MODE: email all active players with a
    // summary of upcoming concerts + matrix view link
    // ──────────────────────────────────────────────
    if (general) {
      // Identify the calling user from their JWT
      const authHeader = req.headers.get("Authorization") ?? "";
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return respond({ error: "Unauthorized" }, 401);

      const userId = user.id;
      const today = new Date().toISOString().split("T")[0];

      const [playersRes, concertsRes, profileRes] = await Promise.all([
        supabase.from("players").select("id, name, email, instrument").eq("user_id", userId).eq("status", "Active").not("email", "is", null),
        supabase.from("concerts").select("*").eq("user_id", userId).eq("status", "live").gte("concert_date", today).order("concert_date"),
        supabase.from("profiles").select("band_name").eq("id", userId).maybeSingle(),
      ]);

      const players = playersRes.data ?? [];
      const concerts = concertsRes.data ?? [];
      const bandName = profileRes.data?.band_name ?? "Your Band";
      const viewUrl = `${appUrl}/band-view?uid=${userId}`;

      if (players.length === 0) return respond({ sent: 0, message: "No active players with emails" });
      if (!brevoApiKey) return respond({ error: "BREVO_API_KEY not found in Vault", sent: 0 });

      let sent = 0;
      const errors: string[] = [];

      for (const player of players) {
        const concertRows = concerts.map((c) => {
          const date = new Date(c.concert_date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
          return `
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
                <strong style="color: #1e3a5f; font-size: 14px;">${c.name}</strong><br>
                <span style="color: #6b7280; font-size: 13px;">📅 ${date} &nbsp; 🕐 ${c.start_time.slice(0, 5)}–${c.end_time.slice(0, 5)} &nbsp; 📍 ${c.location}</span>
              </td>
            </tr>`;
        }).join("");

        const emailSubject = customSubject || `${bandName} — Schedule Update`;
        const customBlock = customMessage
          ? `<div style="background:#eff6ff;border-left:3px solid #1e3a5f;padding:14px 18px;border-radius:0 8px 8px 0;margin-bottom:24px;"><p style="font-size:14px;color:#1f2937;margin:0;line-height:1.6;white-space:pre-line;">${customMessage}</p></div>`
          : `<p style="font-size: 14px; color: #4b5563; margin: 0 0 24px;">Here is the current schedule for upcoming concerts. Use the link below to view the full availability matrix.</p>`;

        const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family: 'Inter', Arial, sans-serif; background: #f8fafc; margin: 0; padding: 32px 16px;">
  <div style="max-width: 520px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
    <div style="background: #1e3a5f; padding: 28px 32px;">
      <h1 style="color: #fff; margin: 0; font-size: 20px; font-weight: 700;">${bandName}</h1>
      <p style="color: rgba(255,255,255,0.7); margin: 6px 0 0; font-size: 14px;">Schedule &amp; Availability Update</p>
    </div>
    <div style="padding: 28px 32px;">
      <p style="font-size: 15px; color: #1f2937; margin: 0 0 16px;">Hi <strong>${player.name}</strong>,</p>
      ${customBlock}
      ${concerts.length > 0 ? `
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 28px;">
        ${concertRows}
      </table>` : `<p style="font-size: 14px; color: #9ca3af; margin: 0 0 28px; font-style: italic;">No upcoming concerts scheduled yet.</p>`}
      <div style="text-align: center; margin-bottom: 24px;">
        <a href="${viewUrl}" style="display: inline-block; background: #1e3a5f; color: #fff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">View Availability Matrix</a>
      </div>
    </div>
    <div style="padding: 16px 32px; border-top: 1px solid #e5e7eb; background: #f8fafc;">
      <p style="font-size: 12px; color: #9ca3af; margin: 0; text-align: center;">BrassBandwidth — Band Management</p>
    </div>
  </div>
</body>
</html>`;

        const emailRes = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: { "api-key": brevoApiKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            sender: { name: bandName, email: "mrmatthewhill@gmail.com" },
            to: [{ email: player.email, name: player.name }],
            subject: emailSubject,
            htmlContent: emailHtml,
          }),
        });

        if (emailRes.ok) { sent++; } else { errors.push(`${player.name}: ${await emailRes.text()}`); }
      }

      return respond({ sent, errors });
    }

    // ──────────────────────────────────────────────
    // PER-CONCERT MODE (existing behaviour)
    // ──────────────────────────────────────────────
    if (!concert_id) {
      return respond({ error: "concert_id required (or pass general: true)" }, 400);
    }

    const { data: concert, error: concertErr } = await supabase
      .from("concerts")
      .select("*")
      .eq("id", concert_id)
      .single();

    if (concertErr || !concert) return respond({ error: "Concert not found" }, 404);

    // Get the band view link for this concert's owner
    const viewUrl = `${appUrl}/band-view?uid=${concert.user_id}`;

    let query = supabase.from("players").select("id, name, email, instrument").eq("status", "Active").not("email", "is", null);
    if (player_ids && player_ids.length > 0) query = query.in("id", player_ids);
    const { data: players } = await query;

    if (!players || players.length === 0) return respond({ sent: 0, message: "No players with emails found" });

    const tokens: Record<string, string> = {};
    for (const player of players) {
      const { data: existing } = await supabase
        .from("response_tokens")
        .select("token")
        .eq("player_id", player.id)
        .eq("concert_id", concert_id)
        .maybeSingle();

      if (existing) {
        tokens[player.id] = existing.token;
      } else {
        const { data: created } = await supabase
          .from("response_tokens")
          .insert({ player_id: player.id, concert_id })
          .select("token")
          .single();
        if (created) tokens[player.id] = created.token;
      }

      await supabase.from("availability").upsert(
        { player_id: player.id, concert_id, status: "Not Responded" },
        { onConflict: "player_id,concert_id", ignoreDuplicates: true }
      );
    }

    if (!brevoApiKey) return respond({ error: "BREVO_API_KEY not found in Vault", tokens_created: Object.keys(tokens).length });

    const concertDate = new Date(concert.concert_date).toLocaleDateString("en-GB", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    });

    const isChase = !!chase;
    let sent = 0;
    const errors: string[] = [];

    for (const player of players) {
      const token = tokens[player.id];
      if (!token) continue;

      const respondUrl = `${appUrl}/respond?token=${token}`;
      const subject = customSubject || (isChase
        ? `Reminder: Please respond — ${concert.name} (${concertDate})`
        : `Availability Request: ${concert.name} — ${concertDate}`);

      const customBlock = customMessage
        ? `<div style="background:#eff6ff;border-left:3px solid #1e3a5f;padding:14px 18px;border-radius:0 8px 8px 0;margin-bottom:24px;"><p style="font-size:14px;color:#1f2937;margin:0;line-height:1.6;white-space:pre-line;">${customMessage}</p></div>`
        : (isChase
          ? `<p style="font-size: 14px; color: #4b5563; margin: 0 0 24px;">We haven't heard from you yet! Could you let us know if you're available for this concert?</p>`
          : `<p style="font-size: 14px; color: #4b5563; margin: 0 0 24px;">We'd like to know if you're available for the following concert. Please respond as soon as possible.</p>`);

      const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family: 'Inter', Arial, sans-serif; background: #f8fafc; margin: 0; padding: 32px 16px;">
  <div style="max-width: 520px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
    <div style="background: #1e3a5f; padding: 28px 32px;">
      <h1 style="color: #fff; margin: 0; font-size: 20px; font-weight: 700;">BrassBandwidth</h1>
      <p style="color: rgba(255,255,255,0.7); margin: 6px 0 0; font-size: 14px;">${isChase ? "Availability Reminder" : "Availability Request"}</p>
    </div>
    <div style="padding: 28px 32px;">
      <p style="font-size: 15px; color: #1f2937; margin: 0 0 20px;">Hi <strong>${player.name}</strong>,</p>
      ${customBlock}
      <div style="background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 28px;">
        <h2 style="margin: 0 0 12px; font-size: 18px; color: #1e3a5f;">${concert.name}</h2>
        <p style="margin: 6px 0; font-size: 14px; color: #4b5563;">📅 ${concertDate}</p>
        <p style="margin: 6px 0; font-size: 14px; color: #4b5563;">🕐 ${concert.start_time.slice(0,5)} – ${concert.end_time.slice(0,5)}</p>
        <p style="margin: 6px 0; font-size: 14px; color: #4b5563;">📍 ${concert.location}</p>
      </div>
      <table style="width:100%; border-collapse: collapse; margin-bottom: 24px;">
        <tr>
          <td style="padding-right: 8px;">
            <a href="${appUrl}/respond?token=${token}&status=available" style="display:block; text-align:center; background:#166534; color:#fff; padding:14px 20px; border-radius:8px; text-decoration:none; font-weight:600; font-size:15px;">✓ Available</a>
          </td>
          <td style="padding-left: 8px;">
            <a href="${appUrl}/respond?token=${token}&status=not_available" style="display:block; text-align:center; background:#991b1b; color:#fff; padding:14px 20px; border-radius:8px; text-decoration:none; font-weight:600; font-size:15px;">✕ Not Available</a>
          </td>
        </tr>
      </table>
      <p style="font-size: 13px; color: #9ca3af; margin: 0 0 20px; text-align: center;">
        Or <a href="${appUrl}/respond?token=${token}" style="color: #1e3a5f;">open the form</a> to respond.
      </p>
      <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; text-align: center;">
        <a href="${appUrl}/matrix?token=${token}" style="font-size: 13px; color: #1e3a5f; text-decoration: none;">View Full Band Matrix →</a>
      </div>
    </div>
    <div style="padding: 16px 32px; border-top: 1px solid #e5e7eb; background: #f8fafc;">
      <p style="font-size: 12px; color: #9ca3af; margin: 0; text-align: center;">BrassBandwidth — Band Management</p>
    </div>
  </div>
</body>
</html>`;

      const emailRes = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": brevoApiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          sender: { name: "BrassBandwidth", email: "mrmatthewhill@gmail.com" },
          to: [{ email: player.email, name: player.name }],
          subject,
          htmlContent: emailHtml,
        }),
      });

      if (emailRes.ok) { sent++; } else { errors.push(`${player.name}: ${await emailRes.text()}`); }
    }

    return respond({ sent, errors });

  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
