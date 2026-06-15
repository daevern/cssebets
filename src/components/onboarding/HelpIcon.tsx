import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HelpCircle } from "lucide-react";

type Props = {
  what: string;
  why?: string;
  mistakes?: string;
  className?: string;
  label?: string;
};

export function HelpIcon({ what, why, mistakes, className, label }: Props) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label ?? "Help"}
          className={`inline-flex items-center justify-center rounded-full p-1 text-muted-foreground hover:text-primary hover:bg-muted transition-colors ${className ?? ""}`}
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 text-sm space-y-2" side="top">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-primary">What it does</div>
          <p className="text-foreground/90 mt-0.5">{what}</p>
        </div>
        {why && (
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-primary">Why it exists</div>
            <p className="text-muted-foreground mt-0.5">{why}</p>
          </div>
        )}
        {mistakes && (
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-destructive">Common mistakes</div>
            <p className="text-muted-foreground mt-0.5">{mistakes}</p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
