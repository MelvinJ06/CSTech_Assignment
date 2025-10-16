import express from "express";
import {
  addAgent,
  getAgents,
  updateAgent,
  deleteAgent,
} from "../controllers/agentController.js";
import protect from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/", protect, addAgent);
router.get("/", protect, getAgents);
router.put("/:id", protect, updateAgent);
router.delete("/:id", protect, deleteAgent);

export default router;
