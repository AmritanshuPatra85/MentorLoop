import { type TaxonomyStage } from "@mentorloop/shared";
import { cn } from "@/lib/utils";

interface StageSelectProps {
  stages: TaxonomyStage[];
  value: string; // The selected stage slug
  onChange: (value: string) => void;
  className?: string;
}

export function StageSelect({ stages, value, onChange, className }: StageSelectProps) {
  return (
    <div className={cn("grid gap-2 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {stages.map((stage) => (
        <label
          key={stage.slug}
          className="flex cursor-pointer gap-3 rounded-md border border-input p-3 has-[:checked]:border-primary has-[:checked]:bg-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring transition-colors"
        >
          <input
            type="radio"
            name="stage"
            value={stage.slug}
            checked={value === stage.slug}
            onChange={() => onChange(stage.slug)}
            className="mt-1 accent-[hsl(var(--primary))]"
          />
          <span className="space-y-0.5">
            <span className="block text-sm font-medium">{stage.name}</span>
            <span className="block text-xs text-muted-foreground">{stage.description}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
