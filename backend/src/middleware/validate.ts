// Express middleware that validates request data against a Zod schema.
// Supports query, body, and params validation with descriptive error responses.

import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";

type ValidationTarget = "query" | "body" | "params";

interface ValidationErrorDetail {
  field: string;
  message: string;
}

/**
 * Creates an Express middleware that validates the specified request property
 * against a Zod schema. On failure, returns a 400 with structured error details.
 *
 * @param schema - Zod schema to validate against
 * @param target - Which part of the request to validate (default: "query")
 */
export function validate(schema: ZodSchema, target: ValidationTarget = "query") {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse(req[target]);
      // Replace the request property with the parsed (and transformed) value
      // We use a type-safe index signature via a cast through unknown
      const reqAny = req as unknown as Record<string, unknown>;
      reqAny[target] = parsed;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const errors: ValidationErrorDetail[] = err.errors.map((e) => ({
          field: e.path.join("."),
          message: e.message,
        }));

        res.status(400).json({
          success: false,
          error: "Validation failed",
          details: errors,
        });
        return;
      }
      next(err);
    }
  };
}
