// backend/routes/uploadRoutes.js
import express from "express";
import protect from "../middleware/authMiddleware.js";
import { uploadAndDistribute } from "../controllers/uploadController.js";

const router = express.Router();

// POST /api/upload  (multipart/form-data with `file`)
router.post("/", protect, uploadAndDistribute);

// GET /api/upload/lists  -> return lists grouped by agent
router.get("/lists", protect, async (req, res) => {
  try {
    // populate agent info
    const lists = await (await import("../models/List.js")).default.find().populate("agentId", "name email mobile");
    // Group by agent
    const grouped = {};
    lists.forEach((l) => {
      const aId = l.agentId?._id?.toString() || "unknown";
      if (!grouped[aId]) {
        grouped[aId] = {
          agent: l.agentId ? { id: aId, name: l.agentId.name, email: l.agentId.email, mobile: l.agentId.mobile } : null,
          items: [],
        };
      }
      grouped[aId].items.push({ id: l._id, firstName: l.firstName, phone: l.phone, notes: l.notes });
    });

    const result = Object.values(grouped);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch lists" });
  }
});

export default router;
