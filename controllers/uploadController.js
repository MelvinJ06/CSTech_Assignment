import multer from "multer";
import path from "path";
import fs from "fs";
import csvParser from "csv-parser";
import xlsx from "xlsx";
import Agent from "../models/Agent.js";
import List from "../models/List.js";

const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
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
  limits: { fileSize: 5 * 1024 * 1024 },
}).single("file");

const mapRow = (row) => {
  const keys = Object.keys(row);
  const keyLower = keys.reduce((acc, k) => ((acc[k.toLowerCase()] = k), acc), {});
  const firstKey = keyLower["firstname"] || keyLower["first_name"] || keyLower["name"] || keyLower["first name"];
  const phoneKey = keyLower["phone"] || keyLower["phone_number"] || keyLower["mobile"];
  const notesKey = keyLower["notes"] || keyLower["note"] || keyLower["remarks"];

  if (!firstKey || !phoneKey) return null;

  return {
    FirstName: String(row[firstKey] || "").trim(),
    Phone: String(row[phoneKey] || "").trim(),
    Notes: notesKey ? String(row[notesKey] || "").trim() : "",
  };
};

export const uploadAndDistribute = (req, res) => {
  upload(req, res, async function (err) {
    if (err) return res.status(400).json({ message: err.message || "Upload error" });
    if (!req.file) return res.status(400).json({ message: "No file provided" });

    try {
      const agents = await Agent.find().sort({ createdAt: 1 }).limit(5);
      if (agents.length < 5) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ message: "Need at least 5 agents to distribute lists" });
      }

      const ext = path.extname(req.file.path).toLowerCase();
      let rows = [];

      if (ext === ".csv") {
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
        const workbook = xlsx.readFile(req.file.path);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
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

      fs.unlinkSync(req.file.path);

      if (!rows.length) return res.status(400).json({ message: "No records found in the file" });

      const total = rows.length;
      const perAgent = Math.floor(total / 5);
      const remainder = total % 5;

      const assignments = [];
      let index = 0;
      for (let i = 0; i < 5; i++) {
        const count = perAgent + (i < remainder ? 1 : 0);
        const items = rows.slice(index, index + count);
        index += count;
        assignments.push({ agent: agents[i], items });
      }

      for (const assign of assignments) {
        for (const item of assign.items) {
          await List.create({
            agentId: assign.agent._id,
            firstName: item.FirstName,
            phone: item.Phone,
            notes: item.Notes,
          });
        }
      }

      return res.status(201).json({
        message: "File processed and distributed successfully",
        totalRecords: total,
        distributedTo: assignments.map((a) => ({
          agentId: a.agent._id,
          agentName: a.agent.name,
          count: a.items.length,
        })),
      });
    } catch (error) {
      console.error("Upload error:", error);
      return res.status(500).json({ message: "Server error while processing file" });
    }
  });
};
