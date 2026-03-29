const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const session = require("express-session");
const passport = require("./config/passport");
const placementConsentRoutes = require("./routes/placementConsent");
const notificationsRoutes = require("./routes/notifications");
const http = require("http");
const { Server } = require("socket.io");

// Sensible defaults for quiz integration if not provided via .env
process.env.EXPO_QUIZ_URL = process.env.EXPO_QUIZ_URL || "https://placement-app-sewb.vercel.app/";
process.env.QUIZ_LAUNCH_MODE = process.env.QUIZ_LAUNCH_MODE || "expo";
// Point to deployed quiz backend by default in production to avoid localhost
process.env.QUIZ_BASE_URL = process.env.QUIZ_BASE_URL || "https://placement-app-kg7c.onrender.com";
process.env.QUIZ_RUN_URL = process.env.QUIZ_RUN_URL || process.env.QUIZ_BASE_URL;

// Force secured quiz app usage
process.env.QUIZ_LAUNCH_MODE = "expo";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "https://placement-app-omega.vercel.app",
    methods: ["GET", "POST"],
  },
});

// Make io accessible throughout the app
app.set("io", io);

// Middleware
// Allow frontend (3000) and secured quiz app (19006) to call the API
const allowedOrigins = [
  (process.env.CLIENT_URL || "https://placement-app-omega.vercel.app").replace(/\/$/, ""),
  (process.env.EXPO_QUIZ_URL || "https://placement-app-sewb.vercel.app/").replace(/\/$/, ""),
  "https://campus-placement-application-r9h3hnq3v-nifo.vercel.app",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true); // allow same-origin/non-browser
      const o = origin.replace(/\/$/, "");
      // Allow exact matches or any nifo.vercel.app preview deployment
      if (allowedOrigins.includes(o)) return callback(null, true);
      if (o.endsWith(".vercel.app")) return callback(null, true);
      return callback(null, false);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    credentials: true,
    optionsSuccessStatus: 204,
  })
);
app.use(express.json());

// Serve uploaded files statically
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
// Serve uploaded signature files
app.use(
  "/uploads/signatures",
  express.static(path.join(__dirname, "uploads/signatures"))
);

// Session middleware (required for passport)
app.use(
  session({
    secret:
      process.env.SESSION_SECRET ||
      "s8f9230f23u29f3nq38nq328nfs9d8vnasdvn2398vn",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }, // Set to true in production with HTTPS
  })
);

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts, please try again after 15 minutes." },
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many upload requests, please slow down." },
});

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please slow down." },
});

app.use("/api/auth", authLimiter);
app.use("/api/users/upload-cgpa", uploadLimiter);
app.use("/api/profile/upload", uploadLimiter);
app.use("/api", generalLimiter);

// Test route
app.get("/api/test", (req, res) => {
  res.json({
    message: "Server is running",
    timestamp: new Date().toISOString(),
  });
});

// Routes - Comment out all and add back one by one
console.log("Starting to load routes...");

// Test each route individually
try {
  console.log("Loading auth routes...");
  const authRoutes = require("./routes/auth");
  console.log("Auth routes type:", typeof authRoutes);
  app.use("/api/auth", authRoutes);
} catch (error) {
  console.error("Error with auth routes:", error.message);
}

try {
  console.log("Loading job-drives routes...");
  const jobDriveRoutes = require("./routes/jobDrives");
  console.log("JobDrive routes type:", typeof jobDriveRoutes);
  app.use("/api/job-drives", jobDriveRoutes);
} catch (error) {
  console.error("Error with job-drives routes:", error.message);
}

try {
  console.log("Loading users routes...");
  const userRoutes = require("./routes/users");
  console.log("User routes type:", typeof userRoutes);
  app.use("/api/users", userRoutes);
} catch (error) {
  console.error("Error with users routes:", error.message);
}

try {
  console.log("Loading profile routes...");
  const profileRoutes = require("./routes/profile");
  console.log("Profile routes type:", typeof profileRoutes);
  app.use("/api/profile", profileRoutes);
} catch (error) {
  console.error("Error with profile routes:", error.message);
}

try {
  console.log("Loading placement-consent routes...");
  const placementRoutes = require("./routes/placementConsent");
  console.log("Placement routes type:", typeof placementRoutes);
  app.use("/api/placement-consent", placementRoutes);
} catch (error) {
  console.error("Error with placement-consent routes:", error.message);
}

try {
  console.log("Loading notifications routes...");
  app.use("/api/notifications", notificationsRoutes);
} catch (error) {
  console.error("Error with notifications routes:", error.message);
}

try {
  console.log("Loading placement-analytics routes...");
  const placementAnalyticsRoutes = require("./routes/placementAnalytics");
  console.log(
    "Placement Analytics routes type:",
    typeof placementAnalyticsRoutes
  );
  app.use("/api/placement-analytics", placementAnalyticsRoutes);
} catch (error) {
  console.error("Error with placement-analytics routes:", error.message);
}

try {
  console.log("Loading deletion-requests routes...");
  const deletionRequestRoutes = require("./routes/deletionRequests");
  console.log("Deletion requests routes type:", typeof deletionRequestRoutes);
  app.use("/api/deletion-requests", deletionRequestRoutes);
} catch (error) {
  console.error("Error with deletion-requests routes:", error.message);
}

// ✅ ADDED: Template management routes
try {
  console.log("Loading templates routes...");
  const templatesRoutes = require("./routes/templates");
  console.log("Templates routes type:", typeof templatesRoutes);
  app.use("/api/templates", templatesRoutes);
} catch (error) {
  console.error("Error with templates routes:", error.message);
}

// ✅ ADDED: Box file management routes
try {
  console.log("Loading box-files routes...");
  const boxFilesRoutes = require("./routes/boxFiles");
  console.log("Box files routes type:", typeof boxFilesRoutes);
  app.use("/api/box-files", boxFilesRoutes);
} catch (error) {
  console.error("Error with box-files routes:", error.message);
}

// ✅ ADDED: Job drive file management routes
try {
  console.log("Loading drive-files routes...");
  const driveFilesRoutes = require("./routes/driveFiles");
  console.log("Drive files routes type:", typeof driveFilesRoutes);
  app.use("/api/drive-files", driveFilesRoutes);
} catch (error) {
  console.error("Error with drive-files routes:", error.message);
}

console.log("Finished loading routes");

// Placement Preparation routes
try {
  console.log("Loading placement preparation routes...");
  const prepTests = require("./routes/prep/tests");
  const prepResources = require("./routes/prep/resources");
  const prepWebhooks = require("./routes/prep/webhooks");
  app.use("/api/prep/tests", prepTests);
  app.use("/api/prep/resources", prepResources);
  app.use("/api/prep/webhooks", prepWebhooks);
} catch (error) {
  console.error("Error with placement preparation routes:", error.message);
}

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Join user to their role-specific room
  socket.on("join-room", (userData) => {
    const role = userData?.role ? String(userData.role).trim() : "";
    const userId = userData?.userId ? String(userData.userId).trim() : "";
    const department = userData?.department ? String(userData.department).trim() : "";

    if (role) {
      socket.join(role); // legacy room name used by existing events
      console.log(`User ${socket.id} joined room: ${role}`);
    }

    if (userId) {
      socket.join(`user:${userId}`);
      console.log(`User ${socket.id} joined room: user:${userId}`);
    }

    if (department) {
      socket.join(`dept:${department}`);
      console.log(`User ${socket.id} joined room: dept:${department}`);
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({ message: "Something went wrong!" });
});

// ============================================
// DATABASE INITIALIZATION
// ============================================
const { testNeonConnection } = require("./config/neonConnection");
const databaseService = require("./services/database/databaseService");
const notificationService = require("./services/notifications/notificationService");
const fileNotificationService = require("./services/notifications/fileNotificationService");

async function initializeDatabases() {
  console.log("\n========================================");
  console.log("Initializing Database Connections");
  console.log("========================================\n");

  let neonConnected = false;

  // Try NeonDB connection
  try {
    neonConnected = await testNeonConnection();
    if (neonConnected) {
      console.log("[SUCCESS] NeonDB is ready as PRIMARY database");
      await databaseService.initialize();
      await notificationService.ensureSchema();
      await fileNotificationService.ensureSchema();
    }
  } catch (error) {
    console.error("[ERROR] NeonDB connection failed:", error.message);
  }

  // Check database status
  if (!neonConnected) {
    console.error("\n[CRITICAL] NeonDB failed to connect!");
    console.error("Server cannot start without NeonDB.");
    process.exit(1);
  }

  console.log("\n[SUCCESS] Neon-only database system initialized");
  console.log("  → Primary: NeonDB (PostgreSQL)");

  console.log("\n========================================\n");
}

// Start server after database initialization
const PORT = process.env.PORT || 5000;

initializeDatabases()
  .then(() => {
    fileNotificationService.startDailyScheduler(io);

    server.listen(PORT, () => {
      console.log(`✓ Server running on port ${PORT}`);
      console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`✓ Client URL: ${process.env.CLIENT_URL || 'http://localhost:3000'}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize databases:", error);
    process.exit(1);
  });
