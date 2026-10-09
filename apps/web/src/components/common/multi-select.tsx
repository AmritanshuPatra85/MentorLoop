"use client";

import { Check, ChevronsUpDown, X } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Option {
  id: string;
  name: string;
  slug: string;
}

interface MultiSelectProps {
  options: Option[];
  selectedSlugs: string[];
  onChange: (slugs: string[]) => void;
  placeholder?: string;
  className?: string;
}

export function MultiSelect({
  options,
  selectedSlugs,
  onChange,
  placeholder = "Select items...",
  className,
}: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOptions = options.filter((o) => selectedSlugs.includes(o.slug));

  function handleSelect(slug: string) {
    if (selectedSlugs.includes(slug)) {
      onChange(selectedSlugs.filter((s) => s !== slug));
    } else {
      onChange([...selectedSlugs, slug]);
    }
  }

  function handleRemove(e: React.MouseEvent, slug: string) {
    e.stopPropagation();
    onChange(selectedSlugs.filter((s) => s !== slug));
  }

  return (
    <div className={cn("relative w-full", className)} ref={containerRef}>
      <div
        className="flex min-h-10 w-full cursor-pointer items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        onClick={() => setIsOpen(!isOpen)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setIsOpen(!isOpen);
          }
        }}
      >
        <div className="flex flex-wrap gap-1">
          {selectedOptions.length === 0 && (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          {selectedOptions.map((opt) => (
            <Badge key={opt.slug} variant="secondary" className="font-normal text-xs py-0 h-6">
              {opt.name}
              <button
                className="ml-1 rounded-full outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2"
                onClick={(e) => handleRemove(e, opt.slug)}
                aria-label={`Remove ${opt.name}`}
              >
                <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
              </button>
            </Badge>
          ))}
        </div>
        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
      </div>

      {isOpen && (
        <div className="absolute top-full z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover text-popover-foreground shadow-md outline-none animate-in fade-in-0 zoom-in-95">
          <div className="p-1">
            {options.map((opt) => {
              const isSelected = selectedSlugs.includes(opt.slug);
              return (
                <div
                  key={opt.slug}
                  className={cn(
                    "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground",
                    isSelected ? "bg-accent/50" : ""
                  )}
                  onClick={() => handleSelect(opt.slug)}
                >
                  <div className="mr-2 flex h-4 w-4 items-center justify-center">
                    {isSelected && <Check className="h-4 w-4" />}
                  </div>
                  {opt.name}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
