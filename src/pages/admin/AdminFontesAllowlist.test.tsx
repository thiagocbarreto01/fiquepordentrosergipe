import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// ---- Mocks ----
const rpc = vi.fn();
const from = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    from: (...args: unknown[]) => from(...args),
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      getSession: async () => ({ data: { session: null } }),
    },
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ isAdmin: true, isStaff: true }),
}));

const toastFn = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastFn }),
}));

vi.mock("@/components/admin/AdminLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import AdminFontesAllowlist from "./AdminFontesAllowlist";

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminFontesAllowlist />
    </MemoryRouter>,
  );
}

function setupInitialLoad(overrides?: { preview?: unknown[] }) {
  const previewData = overrides?.preview ?? [];
  // AllowedHosts SELECT chain: from().select().order()
  const hostsChain = {
    select: () => ({
      order: async () => ({ data: [], error: null }),
    }),
  };
  const sourcesChain = {
    select: async () => ({ data: [{ id: "s1", name: "Fonte 1" }], error: null }),
  };
  const batchesChain = {
    select: () => ({
      order: () => ({
        limit: async () => ({ data: [], error: null }),
      }),
    }),
  };
  from.mockImplementation((table: string) => {
    if (table === "news_source_allowed_hosts") return hostsChain;
    if (table === "news_sources") return sourcesChain;
    if (table === "source_allowed_hosts_batches") return batchesChain;
    return { select: async () => ({ data: [], error: null }) };
  });
  // preview_allowed_hosts_backfill on load
  rpc.mockImplementation(async (name: string, args?: Record<string, unknown>) => {
    if (name === "preview_allowed_hosts_backfill") return { data: previewData, error: null };
    if (name === "admin_backfill_source_allowed_hosts" && args?._dry_run === true) {
      return {
        data: {
          dry_run: true,
          status: "preview",
          candidates: 37,
          would_insert: 37,
          conflicts: 0,
          invalid: 0,
          items: [],
        },
        error: null,
        status: 200,
      };
    }
    return { data: null, error: null };
  });
}

async function clickExecutar() {
  const btn = await screen.findByRole("button", { name: /Executar backfill/i });
  fireEvent.click(btn);
}

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
  toastFn.mockReset();
});

describe("AdminFontesAllowlist – fluxo do backfill", () => {
  it("Abrir prévia chama admin_backfill_source_allowed_hosts uma vez com _dry_run=true", async () => {
    setupInitialLoad();
    renderPage();
    await clickExecutar();

    await waitFor(() => {
      const calls = rpc.mock.calls.filter(
        (c) => c[0] === "admin_backfill_source_allowed_hosts",
      );
      expect(calls).toHaveLength(1);
      expect(calls[0][1]).toEqual({ _dry_run: true });
    });
  });

  it("Cancelar nunca chama _dry_run:false", async () => {
    setupInitialLoad();
    renderPage();
    await clickExecutar();
    const cancel = await screen.findByRole("button", { name: /Cancelar/i });
    fireEvent.click(cancel);

    const realCalls = rpc.mock.calls.filter(
      (c) =>
        c[0] === "admin_backfill_source_allowed_hosts" &&
        (c[1] as { _dry_run: boolean })._dry_run === false,
    );
    expect(realCalls).toHaveLength(0);
  });

  it("Confirmar chama _dry_run:false exatamente uma vez e mostra sucesso quando resposta é completed+batch_id", async () => {
    setupInitialLoad();
    renderPage();
    await clickExecutar();

    rpc.mockImplementationOnce(async () => ({
      data: {
        dry_run: false,
        status: "completed",
        batch_id: "11111111-2222-3333-4444-555555555555",
        candidates: 37,
        inserted_count: 37,
        conflict_count: 0,
        invalid_count: 0,
      },
      error: null,
      status: 200,
    }));

    const confirm = await screen.findByRole("button", { name: /Confirmar execução/i });
    fireEvent.click(confirm);

    await waitFor(() => {
      const realCalls = rpc.mock.calls.filter(
        (c) =>
          c[0] === "admin_backfill_source_allowed_hosts" &&
          (c[1] as { _dry_run: boolean })._dry_run === false,
      );
      expect(realCalls).toHaveLength(1);
      expect(toastFn).toHaveBeenCalledWith(
        expect.objectContaining({ title: expect.stringMatching(/Backfill concluído/i) }),
      );
    });
  });

  it("Dry-run não é tratado como execução concluída (não abre toast de sucesso)", async () => {
    setupInitialLoad();
    renderPage();
    await clickExecutar();
    // Nesse ponto apenas o dry-run foi chamado
    expect(
      toastFn.mock.calls.some((c) =>
        String(c[0]?.title ?? "").match(/Backfill concluído/i),
      ),
    ).toBe(false);
  });

  it("Resposta sem batch_id mostra erro e não mostra sucesso", async () => {
    setupInitialLoad();
    renderPage();
    await clickExecutar();

    rpc.mockImplementationOnce(async () => ({
      data: { dry_run: false, status: "completed", batch_id: null },
      error: null,
      status: 200,
    }));

    const confirm = await screen.findByRole("button", { name: /Confirmar execução/i });
    fireEvent.click(confirm);

    await waitFor(() => {
      expect(
        toastFn.mock.calls.some((c) =>
          String(c[0]?.title ?? "").match(/Resposta inesperada/i),
        ),
      ).toBe(true);
    });
    expect(
      toastFn.mock.calls.some((c) =>
        String(c[0]?.title ?? "").match(/Backfill concluído/i),
      ),
    ).toBe(false);
  });

  it("Clique duplo em Confirmar executa apenas uma vez", async () => {
    setupInitialLoad();
    renderPage();
    await clickExecutar();

    let resolveRpc: (v: unknown) => void = () => {};
    rpc.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRpc = resolve;
        }),
    );

    const confirm = await screen.findByRole("button", { name: /Confirmar execução/i });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    resolveRpc({
      data: {
        dry_run: false,
        status: "completed",
        batch_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        candidates: 0,
        inserted_count: 0,
        conflict_count: 0,
        invalid_count: 0,
      },
      error: null,
      status: 200,
    });

    await waitFor(() => {
      const realCalls = rpc.mock.calls.filter(
        (c) =>
          c[0] === "admin_backfill_source_allowed_hosts" &&
          (c[1] as { _dry_run: boolean })._dry_run === false,
      );
      expect(realCalls).toHaveLength(1);
    });
  });
});
