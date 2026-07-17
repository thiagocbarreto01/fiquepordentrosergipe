/**
 * Helper central de permissões para ações na tela de Fontes.
 * Mantém a mesma regra visual e de servidor.
 */
export interface SourceActionPermissions {
  canEdit: boolean;
  canToggleActive: boolean;
  canDelete: boolean;
  canCapture: boolean;
}

export function getSourcePermissions(opts: {
  isAdmin: boolean;
  isStaff: boolean;
  role: string | null;
}): SourceActionPermissions {
  const { isAdmin, isStaff, role } = opts;
  const isEditor = role === "editor";
  return {
    canEdit: isAdmin || isEditor,
    canToggleActive: isAdmin || isEditor,
    canDelete: isAdmin, // super_admin também é resolvido como isAdmin no useAuth
    canCapture: isStaff,
  };
}
