import { Button } from "@/components/ui/button";
import { Bold, Italic, Heading2, List, ListOrdered, Link as LinkIcon, Quote } from "lucide-react";

interface Props {
  onWrap: (open: string, close: string) => void;
}

const btn = "h-8 px-2 gap-1";

export default function ContentToolbar({ onWrap }: Props) {
  const link = () => {
    const url = window.prompt("URL do link (https://...)");
    if (!url) return;
    onWrap(`<a href="${url.replace(/"/g, "&quot;")}" target="_blank" rel="noopener">`, "</a>");
  };
  return (
    <div className="flex flex-wrap gap-1 border border-border rounded-t-md bg-muted/40 p-1 mb-0">
      <Button type="button" size="sm" variant="ghost" className={btn} onClick={() => onWrap("<strong>", "</strong>")} title="Negrito">
        <Bold className="w-4 h-4" />
      </Button>
      <Button type="button" size="sm" variant="ghost" className={btn} onClick={() => onWrap("<em>", "</em>")} title="Itálico">
        <Italic className="w-4 h-4" />
      </Button>
      <Button type="button" size="sm" variant="ghost" className={btn} onClick={() => onWrap("<h2>", "</h2>")} title="Subtítulo">
        <Heading2 className="w-4 h-4" />
      </Button>
      <Button type="button" size="sm" variant="ghost" className={btn} onClick={() => onWrap("<blockquote>", "</blockquote>")} title="Citação">
        <Quote className="w-4 h-4" />
      </Button>
      <Button type="button" size="sm" variant="ghost" className={btn} onClick={() => onWrap("<ul>\n  <li>", "</li>\n</ul>")} title="Lista">
        <List className="w-4 h-4" />
      </Button>
      <Button type="button" size="sm" variant="ghost" className={btn} onClick={() => onWrap("<ol>\n  <li>", "</li>\n</ol>")} title="Lista numerada">
        <ListOrdered className="w-4 h-4" />
      </Button>
      <Button type="button" size="sm" variant="ghost" className={btn} onClick={link} title="Link">
        <LinkIcon className="w-4 h-4" />
      </Button>
      <Button type="button" size="sm" variant="ghost" className={btn} onClick={() => onWrap("<p>", "</p>")} title="Parágrafo">
        ¶
      </Button>
    </div>
  );
}
