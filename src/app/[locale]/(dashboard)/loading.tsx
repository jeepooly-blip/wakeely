// Shown instantly by Next.js while the server component streams in.
// This eliminates the "white flash" between page navigations.
export default function DashboardLoading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 rounded-full border-4 border-[#1A3557] border-t-transparent animate-spin" />
        <p className="text-xs text-muted-foreground animate-pulse">Loading…</p>
      </div>
    </div>
  );
}
