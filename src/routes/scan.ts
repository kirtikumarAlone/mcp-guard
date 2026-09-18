import { Router } from "express";
import { asyncRoute, HttpError } from "../middleware/errors";
import type { GuardService } from "../service";

export function scanRoutes(service: GuardService): Router {
  const router = Router();

  router.post(
    "/scan",
    asyncRoute(async (req, res) => {
      const text = (req.body ?? {}).text;
      if (typeof text !== "string" || text.length === 0) {
        throw new HttpError(400, "body must include a non-empty text field");
      }
      res.json(await service.scanText(text, req.originalUrl));
    }),
  );

  return router;
}
