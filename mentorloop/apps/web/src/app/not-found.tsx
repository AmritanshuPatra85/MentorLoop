import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <p className="text-sm font-semibold text-primary">404</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Page not found</h1>
        <p className="mt-2 text-muted-foreground">That page does not exist or has moved.</p>
        <Link href="/" className={buttonVariants({ className: "mt-6" })}>
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}