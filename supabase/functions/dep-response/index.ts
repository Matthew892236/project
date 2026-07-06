import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const htmlTemplate = (title: string, message: string, isSuccess: boolean) => `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${title}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: #f8fafc; color: #0f172a; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
        .card { background: white; padding: 32px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.01); max-width: 500px; width: 100%; text-align: center; border: 1px solid #e2e8f0; }
        h1 { font-size: 24px; font-weight: 800; margin-top: 0; margin-bottom: 12px; color: ${isSuccess ? '#16a34a' : '#ef4444'}; }
        p { color: #475569; font-size: 15px; line-height: 1.6; margin: 0; }
        .error-box { background: #fef2f2; border: 1px solid #fee2e2; color: #991b1b; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 13px; margin-top: 16px; text-align: left; word-break: break-all; }
        .icon { font-size: 48px; margin-bottom: 16px; display: inline-block; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="icon">${isSuccess ? '✅' : '⚠️'}</div>
        <h1>${title}</h1>
        <p>${message}</p>
      </div>
    </body>
  </html>
`;

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // 🛡️ PLAIN OBJECT HEADERS: Deno cannot strip or ignore this format!
  const htmlHeaders = {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate"
  };

  try {
    const url = new URL(req.url);
    const player_id = url.searchParams.get('player_id') || url.searchParams.get('playerId');
    const concert_id = url.searchParams.get('concert_id') || url.searchParams.get('concertId');
    const spare_id = url.searchParams.get('spare_id') || url.searchParams.get('spareId');
    const action = url.searchParams.get('action');

    if (action === 'join-network' && player_id) {
      await supabase.from('players').update({ status: 'Spare' }).eq('id', player_id);
      return new Response(htmlTemplate("Welcome!", "You are now opted into the Global Spares roster.", true), { status: 200, headers: htmlHeaders });
    }

    if (!player_id || !concert_id || !spare_id) {
      return new Response(htmlTemplate("Invalid Link", "This response link appears incomplete or broken.", false), { status: 400, headers: htmlHeaders });
    }

    const { data: currentAvail, error: fetchError } = await supabase
      .from('availability')
      .select('*')
      .match({ player_id, concert_id })
      .maybeSingle();

    if (fetchError || !currentAvail) {
      return new Response(htmlTemplate("Record Not Found", "We couldn't locate this vacancy row on the matrix.", false), { status: 404, headers: htmlHeaders });
    }

    if (action === 'accept') {
      const { error: updateError } = await supabase
        .from('availability')
        .update({ 
          status: 'Spare Assigned', 
          spare_player_id: spare_id 
        })
        .match({ player_id, concert_id });

      if (updateError) {
        return new Response(htmlTemplate("Matrix Update Failed", `The database rejected the assignment. <div class="error-box">Error: ${updateError.message}</div>`, false), { status: 500, headers: htmlHeaders });
      }

      return new Response(htmlTemplate("Gig Accepted!", "Thank you! You have been successfully assigned to this event.", true), { status: 200, headers: htmlHeaders });
    }

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

      return new Response(htmlTemplate("Response Recorded", "Thank you. The request has moved on to the next available spare.", true), { status: 200, headers: htmlHeaders });
    }

    return new Response(htmlTemplate("Unknown Action", "The request action was not recognized.", false), { status: 400, headers: htmlHeaders });

  } catch (err: any) {
    return new Response(htmlTemplate("Server Error", `An execution error occurred: ${err.message}`, false), { status: 500, headers: htmlHeaders });
  }
});