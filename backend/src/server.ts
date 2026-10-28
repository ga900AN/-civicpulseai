
import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import crypto from "crypto";


const app = express();
const PORT = Number(process.env.PORT || 5000);

app.use(cors({
  origin: (origin, callback) => {
    if (
      !origin ||
      /^http:\/\/localhost:\d+$/.test(origin) ||
      /^http:\/\/127\.0\.0\.1:\d+$/.test(origin)
    ) {
      return callback(null, true);
    }
    return callback(new Error("Origin not allowed by CORS"));
  },
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json({ limit: "5mb" }));

type TimelineItem = {
  status: string;
  note: string;
  at: string;
};

type Report = {
  id: string;
  title: string;
  description: string;
  category: string;
  location: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  citizenName: string;
  timeline: TimelineItem[];
};

const reportSchema = new mongoose.Schema({
  id: { type: String, unique: true, index: true },
  title: String,
  description: String,
  category: String,
  location: String,
  status: String,
  createdAt: String,
  updatedAt: String,
  citizenName: String,
  timeline: [{
    status: String,
    note: String,
    at: String
  }]
}, { versionKey: false });

const ReportModel =
  mongoose.models.Report || mongoose.model("Report", reportSchema);

const memoryReports: Report[] = [];

const notifications: {
  id: string;
  message: string;
  at: string;
  read: boolean;
}[] = [];

let dbReady = false;
const now = () => new Date().toISOString();

async function listReports(): Promise<Report[]> {
  if (dbReady) {
    return await ReportModel.find()
      .sort({ createdAt: -1 })
      .lean() as unknown as Report[];
  }

  return [...memoryReports].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
}

async function saveReport(report: Report) {
  if (dbReady) {
    await ReportModel.create(report);
  } else {
    memoryReports.unshift(report);
  }
}

async function getReport(id: string): Promise<Report | undefined> {
  if (dbReady) {
    return await ReportModel.findOne({ id })
      .lean() as unknown as Report | undefined;
  }

  return memoryReports.find(
    report => report.id.toLowerCase() === id.toLowerCase()
  );
}

async function updateReport(
  id: string,
  update: Partial<Report>
): Promise<Report | undefined> {
  if (dbReady) {
    return await ReportModel.findOneAndUpdate(
      { id },
      { $set: update },
      { new: true }
    ).lean() as unknown as Report | undefined;
  }

  const index = memoryReports.findIndex(
    report => report.id.toLowerCase() === id.toLowerCase()
  );

  if (index < 0) return undefined;

  memoryReports[index] = {
    ...memoryReports[index],
    ...update
  };

  return memoryReports[index];
}

// Health check
app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    status: "ok",
    database: dbReady ? "connected" : "memory mode",
    gemini: Boolean(process.env.GEMINI_API_KEY)
  });
});

// Get reports
app.get("/api/complaints", async (_req, res) => {
  try {
    res.json({
      success: true,
      reports: await listReports()
    });
  } catch {
    res.status(500).json({
      success: false,
      message: "Could not load reports."
    });
  }
});

// Create a complaint
app.post("/api/complaints", async (req, res) => {
  const {
    title,
    description,
    category,
    location,
    citizenName
  } = req.body || {};

  if (!title || !description || !category || !location) {
    return res.status(400).json({
      success: false,
      message: "Please provide a title, description, category, and location."
    });
  }

  const stamp = now();

  const report: Report = {
    id: "CP-" + crypto.randomBytes(3).toString("hex").toUpperCase(),
    title: String(title),
    description: String(description),
    category: String(category),
    location: String(location),
    status: "Submitted",
    createdAt: stamp,
    updatedAt: stamp,
    citizenName: String(citizenName || "Community member"),
    timeline: [{
      status: "Submitted",
      note: "Report saved in CivicPulse AI.",
      at: stamp
    }]
  };

  try {
    await saveReport(report);

    notifications.unshift({
      id: crypto.randomUUID(),
      message: `Your report ${report.id} was saved in CivicPulse AI.`,
      at: stamp,
      read: false
    });

    return res.status(201).json({
      success: true,
      report
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Could not save report."
    });
  }
});

// Track a complaint
app.get("/api/complaints/:id", async (req, res) => {
  try {
    const report = await getReport(req.params.id);

    if (!report) {
      return res.status(404).json({
        success: false,
        message: "No report found with that ID."
      });
    }

    return res.json({ success: true, report });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Could not retrieve the report."
    });
  }
});

// Update complaint status (demo admin)
app.patch("/api/complaints/:id/status", async (req, res) => {
  const allowedStatuses = [
    "Submitted",
    "Under Review",
    "In Progress",
    "Resolved",
    "Rejected"
  ];

  const status = String(req.body?.status || "");

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      message: "Invalid status."
    });
  }

  try {
    const existing = await getReport(req.params.id);

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Report not found."
      });
    }

    const stamp = now();

    const updated = await updateReport(req.params.id, {
      status,
      updatedAt: stamp,
      timeline: [
        ...existing.timeline,
        {
          status,
          note: `Status changed to ${status} in the demo system.`,
          at: stamp
        }
      ]
    });

    notifications.unshift({
      id: crypto.randomUUID(),
      message: `Report ${req.params.id} status: ${status}.`,
      at: stamp,
      read: false
    });

    return res.json({
      success: true,
      report: updated
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Could not update report status."
    });
  }
});

// Analytics
app.get("/api/analytics", async (_req, res) => {
  try {
    const reports = await listReports();
    const byCategory: Record<string, number> = {};
    const byStatus: Record<string, number> = {};

    for (const report of reports) {
      byCategory[report.category] =
        (byCategory[report.category] || 0) + 1;

      byStatus[report.status] =
        (byStatus[report.status] || 0) + 1;
    }

    res.json({
      success: true,
      total: reports.length,
      resolved: reports.filter(r => r.status === "Resolved").length,
      open: reports.filter(
        r => r.status !== "Resolved" && r.status !== "Rejected"
      ).length,
      byCategory,
      byStatus
    });
  } catch {
    res.status(500).json({
      success: false,
      message: "Could not load analytics."
    });
  }
});

// Notifications
app.get("/api/notifications", (_req, res) => {
  res.json({ success: true, notifications });
});

// Mark notification as read
app.patch("/api/notifications/:id/read", (req, res) => {
  const notification = notifications.find(
    item => item.id === req.params.id
  );

  if (!notification) {
    return res.status(404).json({
      success: false,
      message: "Notification not found."
    });
  }

  notification.read = true;

  res.json({
    success: true,
    notification
  });
});

// Gemini AI assistant
app.post("/api/ai/assist", async (req, res) => {
  const { description, location } = req.body || {};

  if (!description || String(description).trim().length < 8) {
    return res.status(400).json({
      success: false,
      message: "Please describe the issue in more detail."
    });
  }

  const text = String(description).trim();

  if (process.env.GEMINI_API_KEY) {
    try {
      const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `You are CivicPulse AI, a civic issue reporting assistant.
Improve the description without inventing facts.
Choose one category from Roads, Waste, Streetlights, Water,
Drainage, Public Safety, Other.
Return JSON with keys title, category, description, nextSteps.
Citizen description: ${text}
Location: ${String(location || "not specified")}`
              }]
            }],
            generationConfig: {
              responseMimeType: "application/json"
            }
          })
        }
      );

      const data: any = await response.json();

      if (!response.ok) {
        throw new Error(data?.error?.message || "Gemini request failed");
      }

      const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

      return res.json({
        success: true,
        source: "Gemini",
        suggestion: JSON.parse(raw)
      });
    } catch {
      return res.json({
        success: true,
        source: "fallback",
        suggestion: fallback(text),
        note: "Gemini was unavailable; showing a local suggestion."
      });
    }
  }

  return res.json({
    success: true,
    source: "fallback",
    suggestion: fallback(text),
    note: "Add GEMINI_API_KEY to backend/.env to enable Gemini."
  });
});

function fallback(description: string) {
  const lower = description.toLowerCase();

  const category =
    lower.includes("garbage") || lower.includes("waste") || lower.includes("trash")
      ? "Waste"
      : lower.includes("light") || lower.includes("lamp")
        ? "Streetlights"
        : lower.includes("water") || lower.includes("leak")
          ? "Water"
          : lower.includes("drain") || lower.includes("sewer")
            ? "Drainage"
            : lower.includes("pothole") || lower.includes("road") || lower.includes("street")
              ? "Roads"
              : "Other";

  return {
    title: `Civic issue: ${description.slice(0, 55)}`,
    category,
    description: `Please investigate the following issue: ${description}`,
    nextSteps: [
      "Confirm the exact location.",
      "Attach a clear photo if available.",
      "Save the report ID and check its status."
    ]
  };
}

// Unknown API routes
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: "API route not found."
  });
});

// MongoDB connection
mongoose.connect(
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/civicpulseai"
)
.then(() => {
  dbReady = true;
  console.log("✅ MongoDB connected successfully.");
})
.catch(() => {
  console.log("ℹ️ MongoDB unavailable; using temporary in-memory storage.");
});

// Start server
app.listen(PORT, () => {
  console.log(
    `🚀 CivicPulse AI backend running on port ${PORT}\n` +
    `🌐 API: http://localhost:${PORT}\n` +
    `❤️ Health: http://localhost:${PORT}/api/health`
  );
});
