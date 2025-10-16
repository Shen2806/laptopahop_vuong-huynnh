import { Router } from "express";
import { webllmCss, webllmJs } from "../controllers/ai.webllm.controller";

const router = Router();

// Serve như file tĩnh, nhưng nằm trong src
router.get("/client/ai/ai-turtle.css", webllmCss);
router.get("/client/ai/ai-turtle.js", webllmJs);

export default router;
