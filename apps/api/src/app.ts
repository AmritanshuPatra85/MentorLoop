import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";
import { requestLogger } from "./middleware/request-logger";
import { authRouter } from "./modules/auth/auth.routes";
import { debugRouter } from "./modules/debug/debug.routes";
import { healthRouter } from "./modules/health/health.routes";
import { taxonomyRouter } from "./modules/taxonomy/taxonomy.routes";
import { founderOnboardingRouter } from "./modules/founder-onboarding/founder-onboarding.routes";
import { mentorOnboardingRouter } from "./modules/mentor-onboarding/mentor-onboarding.routes";
import { mentorApprovalsRouter } from "./modules/admin/mentor-approvals.routes";
import {
  avatarFilesRouter,
  profilesRouter,
  publicProfilesRouter,
} from "./modules/profiles/profiles.routes";
import { matchingAdminRouter, matchingRouter } from "./modules/matching/matching.routes";
import { connectionsRouter } from "./modules/connections/connections.routes";
import { connectionLifecycleRouter } from "./modules/connections/lifecycle.routes";
import { availabilityRouter } from "./modules/scheduling/availability.routes";
import { sessionsRouter } from "./modules/scheduling/sessions.routes";
import { calendarRouter } from "./modules/scheduling/calendar.routes";
import { adminFeedbackRouter } from "./modules/admin/feedback.routes";
import { founderTimelineRouter } from "./modules/timeline/timeline.routes";
import { adminConsoleRouter } from "./modules/admin/admin-console.routes";

export function createApp() {
  const app = express();

  if (env.NODE_ENV === "production") app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(helmet());
  app.use(cors({ origin: env.WEB_URL, credentials: true }));
  app.use(requestLogger);
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  app.use("/uploads/avatars", avatarFilesRouter);
  app.use("/profiles", publicProfilesRouter);
  app.use("/profiles", profilesRouter);

  app.use(healthRouter);
  app.use("/taxonomy", taxonomyRouter);
  app.use("/founder-onboarding", founderOnboardingRouter);
  app.use("/mentor-onboarding", mentorOnboardingRouter);
  app.use("/admin/mentor-approvals", mentorApprovalsRouter);
  app.use("/admin/feedback", adminFeedbackRouter);
  app.use("/admin", adminConsoleRouter);
  app.use("/admin/matching", matchingAdminRouter);
  app.use("/matches", matchingRouter);
  app.use("/connections", connectionsRouter);
  app.use("/connections", connectionLifecycleRouter);
  app.use("/availability", availabilityRouter);
  app.use("/sessions", sessionsRouter);
  app.use("/timeline", founderTimelineRouter);
  app.use("/calendar", calendarRouter);
  app.use("/auth", authRouter);
  if (env.NODE_ENV === "development") app.use("/debug", debugRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
