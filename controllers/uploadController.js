// backend/controllers/uploadController.js
import multer from "multer";
import path from "path";
import fs from "fs";
import csvParser from "csv-parser";
import xlsx from "xlsx";
import Agent from "../models/Agent.js";
import List from "../models/List.js";

// Multer setup (store in uploads/ folder)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = [".csv", ".xlsx", ".xls"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error("Only .csv, .xlsx and .xls files are allowed"));
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
}).single("file");

// Helper to normalize column names (case-insensitive)
const mapRow = (row) => {
  // Accept various header possibilities (FirstName, firstname, first_name, Name)
  const keys = Object.keys(row);
  const get = (arr) => keys.find((k) => arr.includes(k.toLowerCase()));
  // Build mapping
  const keyLower = keys.reduce((acc, k) => ((acc[k.toLowerCase()] = k), acc), {});
  // possible keys
  const firstKey =
    keyLower["firstname"] || keyLower["first_name"] || keyLower["name"] || keyLower["first name"];
  const phoneKey = keyLower["phone"] || keyLower["phone_number"] || keyLower["mobile"];
  const notesKey = keyLower["notes"] || keyLower["note"] || keyLower["remarks"];

  if (!firstKey || !phoneKey) return null;

  return {
    FirstName: row[firstKey] !== undefined ? String(row[firstKey]).trim() : "",
    Phone: row[phoneKey] !== undefined ? String(row[phoneKey]).trim() : "",
    Notes: notesKey ? String(row[notesKey] || "").trim() : "",
  };
};

export const uploadAndDistribute = (req, res) => {
  upload(req, res, async function (err) {
    if (err) {
      return res.status(400).json({ message: err.message || "Upload error" });
    }

    if (!req.file) return res.status(400).json({ message: "No file provided" });

    try {
      // Get 5 agents (we'll require at least 5)
      const agents = await Agent.find().sort({ createdAt: 1 }).limit(5);
      if (agents.length < 5) {
        // cleanup file
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ message: "Need at least 5 agents to distribute lists" });
      }

      const ext = path.extname(req.file.path).toLowerCase();
      let rows = [];

      if (ext === ".csv") {
        // parse CSV
        const stream = fs.createReadStream(req.file.path).pipe(csvParser());
        for await (const row of stream) {
          const mapped = mapRow(row);
          if (!mapped) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ message: "CSV format invalid: required columns missing (FirstName, Phone)" });
          }
          rows.push(mapped);
        }
      } else {
        // parse XLSX / XLS
        const workbook = xlsx.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const raw = xlsx.utils.sheet_to_json(sheet, { defval: "" });
        for (const row of raw) {
          const mapped = mapRow(row);
          if (!mapped) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ message: "XLSX format invalid: required columns missing (FirstName, Phone)" });
          }
          rows.push(mapped);
        }
      }

      // Remove uploaded file
      fs.unlinkSync(req.file.path);

      if (!rows.length) return res.status(400).json({ message: "No records found in the file" });

      // Distribute among exactly 5 agents as specified
      const total = rows.length;
      const perAgent = Math.floor(total / 5);
      const remainder = total % 5;

      // Build assignments
      const assignments = []; // array of { agentId, items: [] }
      let index = 0;
      for (let i = 0; i < 5; i++) {
        const count = perAgent + (i < remainder ? 1 : 0);
        const items = rows.slice(index, index + count);
        index += count;
        assignments.push({ agent: agents[i], items });
      }

      // Save lists to DB
      const created = [];
      for (const assign of assignments) {
        for (const item of assign.items) {
          const listDoc = await List.create({
            agentId: assign.agent._id,
            firstName: item.FirstName,
            phone: item.Phone,
            notes: item.Notes,
          });
          created.push(listDoc);
        }
      }

      return res.status(201).json({
        message: "File processed and distributed successfully",
        totalRecords: total,
        distributedTo: assignments.map((a) => ({ agentId: a.agent._id, agentName: a.agent.name, count: a.items.length })),
      });
    } catch (error) {
      console.error("Upload error:", error);
      return res.status(500).json({ message: "Server error while processing file" });
    }
  });
};
