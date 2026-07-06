import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const htmlTemplate = (title: string, message: string, isSuccess: boolean) => `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${title}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: #f8fafc; color: #0f172a; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
        .card { background: white; padding: 32px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.01); max-width: 440px; width: 100%; text-align: center; border: 1px solid #e2e8f0; }
        h1 { font-size: 24px; font-weight: 800; margin-top: 0; margin-bottom: 12px; color: ${isSuccess ? '#16a34a' : '#1e3a5f'}; }
        p { color: #475569; font-size: 15px; line-height: 1.6; margin: 0; }
        .icon { font-size: 48px; margin-bottom: 16px; display: inline-block; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="icon">${isSuccess ? '✅' : '🎺'}</div>
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

  try {
    const url = new URL(req.url);
    const player_id = url.searchParams.get('player_id');     // Core Musician ID
    const concert_id = url.searchParams.get('concert_id');   // Concert ID
    const spare_id = url.searchParams.get('spare_id');       // The Dep's Player ID
    const action = url.searchParams.get('action');           // accept, decline, join-network

    // 🌟 ACTION 1: DE-P JOINS GLOBAL NETWORK
    if (action === 'join-network' && player_id) {
      // In this specific link payload, player_id is the spare's profile ID
      await supabase
        .from('players')
        .update({ status: 'Spare' }) // or any tags/network flags you use
        .eq('id', player_id);

      return new Response(
        htmlTemplate("Welcome to the Network!", "You are now opted into the Global Spares roster. Band managers will be able to find and invite you via the Dep Radar.", true),
        { headers: { "Content-Type": "text/html" }, status: 200 }
      );
    }

    // Guard rails for gig management links
    if (!player_id || !concert_id || !spare_id) {
      return new Response(
        htmlTemplate("Invalid Link", "This response link appears incomplete or broken. Please contact the band manager directly.", false),
        { headers: { "Content-Type": "text/html" }, status: 400 }
      );
    }

    // Fetch the core availability record to verify cascade parameters
    const { data: currentAvail } = await supabase
      .from('availability')
      .select('*')
      .match({ player_id, concert_id })
      .single();

    if (!currentAvail) {
      return new Response(
        htmlTemplate("Record Not Found", "We couldn't find the vacancy record for this concert. It may have been modified or deleted.", false),
        { headers: { "Content-Type": "text/html" }, status: 444 }
      );
    }

    // 🌟 ACTION 2: DEP ACCEPTS GIG
    if (action === 'accept') {
      // Complete the vacancy row on the matrix
      await supabase
        .from('availability')
        .update({ 
          status: 'Spare Assigned', 
          spare_player_id: spare_id 
        })
        .match({ player_id, concert_id });

      return new Response(
        htmlTemplate("Gig Accepted!", "Thank you! You have been successfully assigned to this event. The band manager has been notified.", true),
        { headers: { "Content-Type": "text/html" }, status: 200 }
      );
    }

    // 🌟 ACTION 3: DEP DECLINES GIG (Triggers the automatic chain-reaction!)
    if (action === 'decline') {
      const currentIndex = currentAvail.current_approach_index || 0;
      const list = currentAvail.approached_spares || [];

      // Safety check: ensure the person clicking decline is actually the one currently being asked
      if (list[currentIndex] && list[currentIndex].id === spare_id) {
        const nextIndex = currentIndex + 1;

        // Advance the index inside the database row
        await supabase
          .from('availability')
          .update({ 
            current_approach_index: nextIndex,
            approach_initiated_at: new Date().toISOString()
          })
          .match({ player_id, concert_id });
          
        // 💡 Note: Your database webhook will see this update to `current_approach_index`
        // and automatically fire `approach-cascade` to email the next player in line!
      }

      return new Response(
        htmlTemplate("Response Recorded", "Thank you for letting us know. Your decline has been logged, and the request has moved on to the next available spare.", true),
        { headers: { "Content-Type": "text/html" }, status: 200 }
      );
    }

    return new Response(htmlTemplate("Unknown Action", "The request action was not recognized.", false), { status: 400 });

  } catch (err: any) {
    return new Response(htmlTemplate("Server Error", `An error occurred: ${err.message}`, false), { status: 500 });
  }
});