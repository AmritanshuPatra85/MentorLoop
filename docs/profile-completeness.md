# Profile completeness and nudges

Completeness is computed from the existing founder, startup, and mentor profile fields in `@mentorloop/shared` (`profile-completeness.ts`). The scoring functions are pure and run against the authenticated owner's existing `/profiles/me` response. They introduce no API, persistence column, or duplicate profile contract.

## Score inputs

- Founder identity: founder role (50), LinkedIn profile (50).
- Startup matching details: name (14), one-line pitch (14), description (14), selected domains plus primary domain (14), stage (10), mentorship needs (14), goals (10), and timezone plus at least one preferred session window (10).
- Mentor matching details: bio (16), experience summary (13), current role or organization (9), selected expertise domains (14), skills (14), mentorable stages (10), topics (10), years of experience including zero (5), mentee capacity (4), and timezone plus at least one preferred session window (5).

Each profile score is a whole-number percentage. The dashboard displays saved profile data. The profile editor recalculates from its current draft and labels it as unsaved until the user saves. Checklist links navigate to the existing profile fields, including taxonomy and availability controls.

Scores below 40 show a non-blocking, owner-facing suggestion on startup and mentor profiles. Sprint 4 matching has not been implemented, so there is currently no matching score or candidate eligibility to adjust. The informational warning does not hide features, change approval, or affect access. A matching penalty can be considered when the matching ranker is built, with its own tests and policy.
