import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// Publicação direta no Instagram foi DESATIVADA.
// A postagem é 100% manual: o admin baixa a arte, copia a legenda e publica pelo app do Instagram.
// Esta função é mantida apenas por compatibilidade e responde 410 sem chamar API externa.

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const request_id = crypto.randomUUID();
  return new Response(
    JSON.stringify({
      success: false,
      code: "direct_publish_disabled",
      message: "A publicação no Instagram é manual.",
      request_id,
    }),
    { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
