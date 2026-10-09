import { NotFoundActions } from "@/components/common/not-found-actions";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <p className="text-sm font-semibold text-primary">404</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Page not found</h1>
        <p className="mt-2 text-muted-foreground">That page does not exist or has moved.</p>
        <NotFoundActions />
      </div>
    </div>
  );
}
