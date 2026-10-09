import type { RequestHandler, Request } from "express";
import type { ZodTypeAny } from "zod";
import { ValidationError } from "../lib/errors";

type Schemas = { body?: ZodTypeAny; query?: ZodTypeAny; params?: ZodTypeAny };
type Issue = { location: string; path: string; message: string };

export function validate(schemas: Schemas): RequestHandler {
  return (req, _res, next) => {
    const issues: Issue[] = [];
    const target = req as unknown as Record<string, unknown>;

    for (const location of ["params", "query", "body"] as const) {
      const schema = schemas[location];
      if (!schema) continue;
      const result = schema.safeParse((req as Request)[location]);
      if (result.success) {
        target[location] = result.data;
      } else {
        for (const issue of result.error.issues) {
          issues.push({ location, path: issue.path.join("."), message: issue.message });
        }
      }
    }

    if (issues.length > 0) return next(new ValidationError(issues));
    next();
  };
}