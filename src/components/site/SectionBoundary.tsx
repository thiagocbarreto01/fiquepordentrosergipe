import React from "react";

type Props = {
  title?: string;
  children: React.ReactNode;
  /** Mensagem mostrada quando o filho for vazio (children === null/undefined/false). */
  emptyMessage?: string;
  /** Se `true`, renderiza um skeleton no lugar. */
  loading?: boolean;
};

type State = { hasError: boolean; message?: string };

/**
 * Boundary leve por seção da Home. Garante que uma falha de fetch ou render
 * em uma seção NUNCA derruba a página inteira.
 */
export class SectionBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(err: unknown): State {
    return { hasError: true, message: err instanceof Error ? err.message : String(err) };
  }

  componentDidCatch(err: unknown) {
    // eslint-disable-next-line no-console
    console.error(`[SectionBoundary] ${this.props.title ?? "sem título"}:`, err);
  }

  render() {
    const { children, title, emptyMessage = "Sem notícias no momento.", loading } = this.props;

    if (loading) {
      return (
        <div className="rounded-md border border-border/60 bg-white p-4 space-y-3 animate-pulse">
          <div className="h-4 w-32 bg-muted rounded" />
          <div className="h-24 w-full bg-muted rounded" />
          <div className="h-3 w-3/4 bg-muted rounded" />
          <div className="h-3 w-2/3 bg-muted rounded" />
        </div>
      );
    }

    if (this.state.hasError) {
      return (
        <div className="rounded-md border border-border/60 bg-white p-4 text-sm text-muted-foreground">
          {title ? <strong className="block mb-1">{title}</strong> : null}
          Não foi possível carregar esta seção agora.
        </div>
      );
    }

    if (children === null || children === undefined || children === false) {
      return (
        <div className="rounded-md border border-dashed border-border/60 bg-white/60 p-4 text-sm text-muted-foreground">
          {title ? <strong className="block mb-1">{title}</strong> : null}
          {emptyMessage}
        </div>
      );
    }

    return <>{children}</>;
  }
}
