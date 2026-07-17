// Autenticação de `capture-sources`.
// Único caminho aceito: JWT válido de usuário staff (redator, editor, admin,
// super_admin — conforme public.is_staff).
//
// O gateway já rejeita requisições sem JWT válido (verify_jwt=true) antes do
// handler. Este módulo revalida no handler para garantir que o usuário é staff.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

export type CaptureActor = {
  kind: "staff_user";
  user_id: string;
};

export type AuthResult =
  | { ok: true; actor: CaptureActor }
  | { ok: false; status: 401 | 403; code: string; message: string };

export async function authenticateRequest(
  req: Request,
  admin: SupabaseClient,
): Promise<AuthResult> {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return {
      ok: false,
      status: 401,
      code: "missing_authorization",
      message: "Cabeçalho Authorization ausente ou inválido.",
    };
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return {
      ok: false,
      status: 401,
      code: "missing_authorization",
      message: "Token de acesso não fornecido.",
    };
  }

  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) {
    return {
      ok: false,
      status: 401,
      code: "invalid_token",
      message: "Token de acesso inválido ou expirado.",
    };
  }

  const userId = userData.user.id;
  const { data: staffOk, error: staffErr } = await admin.rpc("is_staff", {
    _user_id: userId,
  });

  if (staffErr) {
    return {
      ok: false,
      status: 403,
      code: "authorization_check_failed",
      message: "Não foi possível validar suas permissões.",
    };
  }

  if (!staffOk) {
    return {
      ok: false,
      status: 403,
      code: "forbidden_not_staff",
      message: "Acesso restrito a usuários da equipe editorial.",
    };
  }

  return { ok: true, actor: { kind: "staff_user", user_id: userId } };
}
