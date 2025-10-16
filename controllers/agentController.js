import Agent from "../models/Agent.js";
import bcrypt from "bcryptjs";

export const addAgent = async (req, res) => {
  try {
    const { name, email, mobile, password } = req.body;

    if (!name || !email || !mobile || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const existing = await Agent.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: "Agent with this email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const agent = await Agent.create({
      name,
      email,
      mobile,
      password: hashedPassword,
    });

    res.status(201).json({ message: "Agent created successfully", agent });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getAgents = async (req, res) => {
  try {
    const agents = await Agent.find();
    res.json(agents);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const updateAgent = async (req, res) => {
  try {
    const { name, email, mobile, password } = req.body;
    const agent = await Agent.findById(req.params.id);

    if (!agent) return res.status(404).json({ message: "Agent not found" });

    agent.name = name || agent.name;
    agent.email = email || agent.email;
    agent.mobile = mobile || agent.mobile;

    if (password) {
      agent.password = await bcrypt.hash(password, 10);
    }

    await agent.save();
    res.json({ message: "Agent updated successfully", agent });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const deleteAgent = async (req, res) => {
  try {
    const agent = await Agent.findById(req.params.id);
    if (!agent) return res.status(404).json({ message: "Agent not found" });

    await agent.deleteOne();
    res.json({ message: "Agent deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

