import { Repeat } from "lucide-react";
import Link from "next/link";

export function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="grid size-8 place-items-center rounded-lg bg-brand text-midnight">
        <Repeat className="size-4" />
      </span>
      <span>MentorLoop</span>
    </Link>
  );
}