"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, ChevronLeft, ChevronRight, CircleHelp, Compass, Filter, Sparkles, UserRound, X } from "lucide-react";
import { matchEventActionResponseSchema, matchingWithExplanationsResponseSchema, myProfileResponseSchema, publicMentorProfileSchema, type MatchResultWithExplanation } from "@mentorloop/shared";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { ListSkeleton } from "@/components/common/skeletons";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api-client";
import { MatchActions } from "@/components/matching/match-actions";
import { RequestToConnect } from "@/components/connections/request-to-connect";

const PAGE_SIZE = 10;
type SortMode = "recommended" | "experience" | "availability";
const signals = [
  ["semanticSimilarity", "Profile fit"],
  ["domainOverlap", "Shared domains"],
  ["stageFit", "Stage fit"],
  ["availabilityOverlap", "Availability fit"],
  ["trackRecord", "Track record"],
] as const;

export default function DiscoverMentorsPage() {
  const [domain, setDomain] = useState("all");
  const [stage, setStage] = useState("all");
  const [availability, setAvailability] = useState("all");
  const [sort, setSort] = useState<SortMode>("recommended");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<MatchResultWithExplanation | null>(null);
  const [showBreakdown, setShowBreakdown] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const myProfileQuery = useQuery({ queryKey: ["my-profile"], queryFn: () => api.get("/profiles/me", myProfileResponseSchema) });
  const startupId = myProfileQuery.data?.publicProfilePath?.startsWith("/startups/")
    ? myProfileQuery.data.publicProfilePath.slice("/startups/".length)
    : null;
  const startupName = typeof myProfileQuery.data?.profile?.startupName === "string"
    ? myProfileQuery.data.profile.startupName
    : "your startup";
  const matchesQuery = useQuery({
    queryKey: ["matches", "mentors"],
    queryFn: () => api.get("/matches/mentors", matchingWithExplanationsResponseSchema),
  });
  const matches = matchesQuery.data?.matches ?? [];
  const domains = useMemo(() => [...new Set(matches.flatMap((match) => match.mentor.domains))].sort(), [matches]);
  const stages = useMemo(() => [...new Set(matches.flatMap((match) => match.mentor.mentorshipStages))].sort(), [matches]);
  const filtered = useMemo(() => {
    const values = matches.filter((match) =>
      (domain === "all" || match.mentor.domains.includes(domain)) &&
      (stage === "all" || match.mentor.mentorshipStages.includes(stage)) &&
      (availability === "all" || (match.signals.availabilityOverlap.raw >= (availability === "high" ? 0.67 : 0.34)))
    );
    if (sort === "experience") return [...values].sort((a, b) => (b.mentor.yearsExperience ?? -1) - (a.mentor.yearsExperience ?? -1) || b.score - a.score);
    if (sort === "availability") return [...values].sort((a, b) => b.signals.availabilityOverlap.raw - a.signals.availabilityOverlap.raw || b.score - a.score);
    return values;
  }, [matches, domain, stage, availability, sort]);
  const pageCount = Math.ceil(filtered.length / PAGE_SIZE);
  const pageMatches = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function changeFilter(setter: (value: string) => void, value: string) {
    setter(value);
    setPage(0);
  }

  return (
    <>
      <PageHeader title="Discover mentors" description="Explore mentors ranked for your startup, with clear reasons behind every recommendation." />
      {matchesQuery.isPending ? <ListSkeleton rows={5} /> : null}
      {matchesQuery.isError ? <ErrorState title="Matches could not be loaded" message="Check your connection and try loading your recommendations again." onRetry={() => void matchesQuery.refetch()} /> : null}
      {matchesQuery.isSuccess ? <>
        <section aria-label="Mentor discovery filters" className="mb-5 rounded-xl border bg-card p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Filter aria-hidden="true" className="size-4 text-primary" />Refine recommendations</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="space-y-1 text-xs font-medium text-muted-foreground">Domain
              <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground" value={domain} onChange={(event) => changeFilter(setDomain, event.target.value)}>
                <option value="all">All domains</option>{domains.map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-xs font-medium text-muted-foreground">Mentorship stage
              <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground" value={stage} onChange={(event) => changeFilter(setStage, event.target.value)}>
                <option value="all">All stages</option>{stages.map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-xs font-medium text-muted-foreground">Availability fit
              <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground" value={availability} onChange={(event) => changeFilter(setAvailability, event.target.value)}>
                <option value="all">Any fit</option><option value="medium">Moderate or better</option><option value="high">Strong fit</option>
              </select>
            </label>
            <label className="space-y-1 text-xs font-medium text-muted-foreground">Sort by
              <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground" value={sort} onChange={(event) => { setSort(event.target.value as SortMode); setPage(0); }}>
                <option value="recommended">Recommended</option><option value="experience">Experience</option><option value="availability">Availability fit</option>
              </select>
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{filtered.length} {filtered.length === 1 ? "mentor" : "mentors"} match these filters</span>
            {(domain !== "all" || stage !== "all" || availability !== "all") ? <button className="underline underline-offset-2 hover:text-foreground" onClick={() => { setDomain("all"); setStage("all"); setAvailability("all"); setPage(0); }}>Clear filters</button> : null}
          </div>
        </section>
        {matches.length === 0 ? <EmptyState icon={Compass} title="No eligible mentors yet" description="No mentors currently meet the matching requirements for your startup. Recommendations require an approved mentor with a complete profile, a current profile embedding, remaining capacity, and bookable availability within the next 14 days. Check back after mentor availability is set." /> : null}
        {matches.length > 0 && filtered.length === 0 ? <EmptyState icon={CircleHelp} title="No mentors match these filters" description="Try a different domain, stage, or availability fit." action={<Button variant="outline" onClick={() => { setDomain("all"); setStage("all"); setAvailability("all"); }}>Clear filters</Button>} /> : null}
        {pageMatches.length > 0 ? <div className="space-y-3">
          {pageMatches.map((match, index) => <MentorMatchCard key={match.candidateId} match={match} startupId={startupId} startupName={startupName} rank={page * PAGE_SIZE + index + 1} breakdownOpen={showBreakdown === match.candidateId} onToggleBreakdown={() => setShowBreakdown(showBreakdown === match.candidateId ? null : match.candidateId)} onOpen={() => setSelected(match)} onSaved={() => { queryClient.setQueryData(["matches", "mentors"], (current: typeof matchesQuery.data) => current ? { ...current, matches: current.matches.map((item) => item.candidateId === match.candidateId ? { ...item, saved: true } : item) } : current); void queryClient.invalidateQueries({ queryKey: ["matches", "mentors"] }); }} onDismissed={() => { queryClient.setQueryData(["matches", "mentors"], (current: typeof matchesQuery.data) => current ? { ...current, matches: current.matches.filter((item) => item.candidateId !== match.candidateId) } : current); setPage((currentPage) => Math.min(currentPage, Math.max(0, Math.ceil((filtered.length - 1) / PAGE_SIZE) - 1))); void queryClient.invalidateQueries({ queryKey: ["matches", "mentors"] }); }} />)}
          <div className="flex items-center justify-between gap-3 pt-2">
            <p className="text-sm text-muted-foreground">Page {page + 1} of {pageCount}</p>
            <div className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}><ChevronLeft />Previous</Button><Button variant="outline" size="sm" disabled={page + 1 >= pageCount} onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}>Next<ChevronRight /></Button></div>
          </div>
        </div> : null}
      </> : null}
      {selected ? <MentorDrawer match={selected} onClose={() => setSelected(null)} /> : null}
    </>
  );
}

function MentorMatchCard({ match, startupId, startupName, rank, breakdownOpen, onToggleBreakdown, onOpen, onSaved, onDismissed }: { match: MatchResultWithExplanation; startupId: string | null; startupName: string; rank: number; breakdownOpen: boolean; onToggleBreakdown: () => void; onOpen: () => void; onSaved: () => void; onDismissed: () => void }) {
  const { mentor } = match;
  const score = Math.round(match.score * 100);
  const RoleIcon = UserRound;
  return <Card className="overflow-hidden">
    <CardContent className="p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex min-w-0 flex-1 gap-3 sm:gap-4">
          <button onClick={onOpen} className="group relative size-14 shrink-0 overflow-hidden rounded-full bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:size-16" aria-label={`Open ${mentor.name}'s profile`}>
            {mentor.avatarUrl ? <img src={mentor.avatarUrl} alt="" className="size-full object-cover" /> : <span className="grid size-full place-items-center text-muted-foreground"><RoleIcon className="size-7" /></span>}
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-medium text-muted-foreground">#{rank} match</span>{match.explanation.source === "groq" ? <Badge variant="ai"><Sparkles aria-hidden="true" />AI explanation</Badge> : <Badge variant="outline">Match insight</Badge>}</div>
            <button onClick={onOpen} className="mt-1 block max-w-full truncate text-left text-lg font-semibold hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{mentor.name}</button>
            <p className="truncate text-sm text-muted-foreground">{[mentor.currentRole, mentor.organization].filter(Boolean).join(" · ") || "Mentor"}{mentor.yearsExperience !== null ? ` · ${mentor.yearsExperience} years experience` : ""}</p>
            <p className="mt-3 text-sm leading-6">{match.explanation.text}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">{mentor.domains.slice(0, 4).map((item) => <Badge key={item} variant="secondary">{item}</Badge>)}{mentor.domains.length > 4 ? <Badge variant="outline">+{mentor.domains.length - 4}</Badge> : null}</div>
          </div>
        </div>
          <div className="flex flex-wrap items-center gap-3 border-t pt-3 sm:w-40 sm:flex-col sm:justify-center sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
          <ScoreRing score={score} />
          <div className="flex-1 sm:text-center"><p className="text-xs text-muted-foreground">Match score</p><button onClick={onToggleBreakdown} aria-expanded={breakdownOpen} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><CircleHelp className="size-3.5" />{breakdownOpen ? "Hide details" : "Score details"}</button></div>
          <Button onClick={onOpen} size="sm" className="sm:w-full">View mentor</Button>
          {startupId ? <RequestToConnect startupId={startupId} startupName={startupName} mentorId={match.candidateId} mentorName={mentor.name} /> : null}
          <MatchActions candidateType="mentor" candidateId={match.candidateId} saved={match.saved} onSaved={onSaved} onDismissed={onDismissed} />
        </div>
      </div>
      {breakdownOpen ? <div className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2 lg:grid-cols-5" aria-label={`${mentor.name} score breakdown`}>
        {signals.map(([key, label]) => { const signal = match.signals[key]; return <div key={key} className="rounded-lg bg-muted/60 p-3"><div className="flex justify-between gap-2 text-xs"><span>{label}</span><span className="font-semibold tabular-nums">{Math.round(signal.raw * 100)}%</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(signal.raw * 100)}%` }} /></div><p className="mt-1 text-[11px] text-muted-foreground">{signal.weight}% weight · +{(signal.weighted * 100).toFixed(1)} pts</p></div>; })}
        {match.newMentorBoost > 0 ? <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-5">Includes a new mentor visibility boost.</p> : null}
      </div> : null}
    </CardContent>
  </Card>;
}

function ScoreRing({ score }: { score: number }) {
  return <div className="grid size-14 shrink-0 place-items-center rounded-full p-[3px]" style={{ background: `conic-gradient(hsl(var(--primary)) ${score * 3.6}deg, hsl(var(--secondary)) 0deg)` }} role="img" aria-label={`${score}% match`}><div className="grid size-full place-items-center rounded-full bg-card text-sm font-bold tabular-nums">{score}%</div></div>;
}

function MentorDrawer({ match, onClose }: { match: MatchResultWithExplanation; onClose: () => void }) {
  const query = useQuery({ queryKey: ["public-profile", "mentor", match.candidateId], queryFn: () => api.get(`/profiles/mentors/${match.candidateId}`, publicMentorProfileSchema) });
  useEffect(() => {
    void api.post(`/matches/mentor/${match.candidateId}/events`, matchEventActionResponseSchema, { eventType: "view" }).catch(() => undefined);
  }, [match.candidateId]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  return <div className="fixed inset-0 z-[60] flex justify-end bg-black/55" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="mentor-drawer-title" className="flex h-full w-full max-w-xl flex-col overflow-y-auto border-l bg-background shadow-2xl">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/95 px-5 py-4 backdrop-blur"><div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Mentor profile</p><h2 id="mentor-drawer-title" className="font-semibold">{match.mentor.name}</h2></div><Button variant="ghost" size="icon" onClick={onClose} aria-label="Close mentor details"><X /></Button></div>
      <div className="space-y-5 p-5 sm:p-6">
        <Card><CardContent className="flex items-center gap-4 p-5"><Avatar src={match.mentor.avatarUrl} name={match.mentor.name} /><div className="min-w-0"><h3 className="truncate text-lg font-semibold">{match.mentor.name}</h3><p className="text-sm text-muted-foreground">{[match.mentor.currentRole, match.mentor.organization].filter(Boolean).join(" · ") || "Mentor"}</p>{match.mentor.yearsExperience !== null ? <p className="mt-1 text-xs text-muted-foreground">{match.mentor.yearsExperience} years experience</p> : null}</div><ScoreRing score={Math.round(match.score * 100)} /></CardContent></Card>
        <section className="rounded-lg border bg-card p-4"><div className="mb-2 flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-ai-foreground" />Why this mentor</div><p className="text-sm leading-6">{match.explanation.text}</p><button className="mt-3 text-xs font-medium text-primary underline underline-offset-2" onClick={onClose}>Close details</button></section>
        {query.isPending ? <ListSkeleton rows={4} /> : null}
        {query.isError ? <ErrorState title="More profile details are unavailable" message="The match summary is still available. Try again shortly." onRetry={() => void query.refetch()} /> : null}
        {query.data ? <>
          <section className="space-y-2"><h3 className="font-semibold">About</h3><p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{query.data.bio || "No biography provided."}</p>{query.data.experienceSummary ? <p className="whitespace-pre-wrap text-sm leading-6">{query.data.experienceSummary}</p> : null}</section>
          <TagSection title="Expertise" values={query.data.domains} /><TagSection title="Skills" values={query.data.skills} /><TagSection title="Mentorship stages" values={query.data.mentorshipStages} />
        </> : null}
        <section><h3 className="mb-2 font-semibold">Match breakdown</h3><div className="space-y-2">{signals.map(([key, label]) => <div key={key} className="flex items-center gap-3 text-sm"><span className="w-32 shrink-0 text-muted-foreground">{label}</span><div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${match.signals[key].raw * 100}%` }} /></div><span className="w-10 text-right tabular-nums">{Math.round(match.signals[key].raw * 100)}%</span></div>)}</div></section>
        <p className="flex items-start gap-2 rounded-md bg-muted p-3 text-xs text-muted-foreground"><CalendarClock className="mt-0.5 size-4 shrink-0" />Availability fit reflects the matching signal. Confirm an actual session time after connecting.</p>
      </div>
    </section>
  </div>;
}

function Avatar({ src, name }: { src: string | null; name: string }) {
  return src ? <img src={src} alt={`${name} profile`} className="size-14 shrink-0 rounded-full object-cover" /> : <div className="grid size-14 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground"><UserRound className="size-7" /></div>;
}

function TagSection({ title, values }: { title: string; values: string[] }) {
  return <section className="space-y-2"><h3 className="text-sm font-semibold">{title}</h3>{values.length ? <div className="flex flex-wrap gap-2">{values.map((value) => <Badge key={value} variant="secondary">{value}</Badge>)}</div> : <p className="text-sm text-muted-foreground">Not provided</p>}</section>;
}
