import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import connectDB from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import agentRoutes from "./routes/agentRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";


dotenv.config();
connectDB();

const app = express();
app.use(express.json());
app.use(cors());
app.use("/uploads", express.static("uploads"));

app.use("/api/auth", authRoutes);
app.use("/api/agents", agentRoutes);
app.use("/api/upload", uploadRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
