// Imports an external image into the `media` bucket and returns the public URL.
// Used by the admin UI to bypass CORS when generating the Instagram art on canvas.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extFromContentType(ct: string | null): string {
  if (!ct) return "jpg";
  const c = ct.toLowerCase();
  if (c.includes("png")) return "png";
  if (c.includes("webp")) return "webp";
  if (c.includes("gif")) return "gif";
  if (c.includes("jpeg") || c.includes("jpg")) return "jpg";
  return "jpg";
}

async function sha1Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-1", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user?.id) {
    return json({ error: "Unauthorized" }, 401);
  }
  const userId = userData.user.id;
  const admin = createClient(supabaseUrl, serviceKey);
  const { data: isStaff } = await admin.rpc("is_staff", { _user_id: userId });
  if (!isStaff) return json({ error: "Forbidden: staff only" }, 403);

  let body: { url?: string; slug?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const sourceUrl = (body.url ?? "").trim();
  if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) {
    return json({ error: "Invalid url" }, 400);
  }

  // If it's already a media bucket URL, just return it
  const publicPrefix = `${supabaseUrl}/storage/v1/object/public/media/`;
  if (sourceUrl.startsWith(publicPrefix)) {
    return json({ ok: true, url: sourceUrl, cached: true });
  }

  console.log("[import-image] request", { userId, sourceUrl });

  // Fetch image server-side
  let res: Response;
  try {
    res = await fetch(sourceUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; FiquePorDentroSEBot/1.0; +https://fiquepordentrose.com.br)",
        Accept: "image/*,*/*;q=0.8",
        Referer: new URL(sourceUrl).origin,
      },
      redirect: "follow",
    });
  } catch (e) {
    console.error("[import-image] fetch failed", e);
    return json(
      { error: `Falha ao baixar imagem: ${(e as Error).message}`, url: sourceUrl },
      502,
    );
  }
  console.log("[import-image] origin response", {
    status: res.status,
    contentType: res.headers.get("content-type"),
  });
  if (!res.ok) {
    return json(
      {
        error: `Origem respondeu ${res.status} ${res.statusText}`,
        url: sourceUrl,
      },
      502,
    );
  }

  const contentType = res.headers.get("content-type");
  if (!contentType || !contentType.toLowerCase().startsWith("image/")) {
    return json(
      {
        error: `Conteúdo não é uma imagem (content-type=${contentType ?? "?"})`,
        url: sourceUrl,
      },
      415,
    );
  }

  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength === 0) {
    return json({ error: "Imagem vazia", url: sourceUrl }, 502);
  }

  const ext = extFromContentType(contentType);
  const hash = (await sha1Hex(sourceUrl)).slice(0, 16);
  const slug = (body.slug ?? "noticia").replace(/[^a-z0-9-]/gi, "").slice(0, 60) ||
    "noticia";
  const path = `imported/${slug}-${hash}.${ext}`;
  console.log("[import-image] uploading", { bucket: "media", path, bytes: buf.byteLength });

  const { error: upErr } = await admin.storage
    .from("media")
    .upload(path, buf, {
      contentType,
      cacheControl: "31536000",
      upsert: true,
    });
  if (upErr) {
    console.error("[import-image] storage upload failed", upErr);
    return json(
      { error: `Falha ao salvar no Storage: ${upErr.message}`, url: sourceUrl },
      500,
    );
  }

  const { data: pub } = admin.storage.from("media").getPublicUrl(path);
  console.log("[import-image] success", { path, publicUrl: pub.publicUrl });
  return json({ ok: true, url: pub.publicUrl, path, cached: false });
});
