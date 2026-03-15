// Socket utility functions for emitting real-time events

// Helper function to emit events to specific user roles
const emitToPOs = (io, event, data) => {
  io.to("po").emit(event, data);
};

const emitToPRs = (io, event, data) => {
  io.to("pr").emit(event, data);
};

const emitToStudents = (io, event, data) => {
  io.to("student").emit(event, data);
};

const emitToAll = (io, event, data) => {
  io.emit(event, data);
};

// Specific event emitters for different actions
const emitJobDriveUpdate = (io, action, jobDrive) => {
  const eventData = {
    action, // 'created', 'updated', 'deleted', 'application_submitted'
    jobDrive,
    timestamp: new Date(),
  };

  emitToAll(io, "jobDriveUpdate", eventData);
};

const emitApplicationUpdate = (io, action, applicationData) => {
  const eventData = {
    action, // 'submitted', 'reviewed', 'shortlisted'
    applicationData,
    timestamp: new Date(),
  };

  emitToAll(io, "applicationUpdate", eventData);
};

const emitDeletionRequestUpdate = (io, action, deletionRequest) => {
  const eventData = {
    action, // 'created', 'approved', 'rejected'
    deletionRequest,
    timestamp: new Date(),
  };

  // Emit to POs for approval actions
  if (action === "created") {
    emitToPOs(io, "deletionRequestUpdate", eventData);
  }

  // Emit to PRs for status updates
  if (action === "approved" || action === "rejected") {
    emitToPRs(io, "deletionRequestUpdate", eventData);
  }

  // Also emit to all for general updates
  emitToAll(io, "deletionRequestUpdate", eventData);
};

const emitPlacementUpdate = (io, action, placement) => {
  const eventData = {
    action, // 'created', 'updated', 'deleted'
    placement,
    timestamp: new Date(),
  };

  emitToAll(io, "placementUpdate", eventData);
};

const emitAnalyticsUpdate = (io, data) => {
  const eventData = {
    data,
    timestamp: new Date(),
  };

  emitToAll(io, "analyticsUpdate", eventData);
};

// Placement Preparation specific events
const emitTestPublished = (io, data) => {
  const eventData = { ...data, timestamp: new Date() };
  
  // Emit to department students and PRs
  if (data.department && data.department !== 'ALL') {
    emitToAll(io, "test:published", eventData);
  } else {
    emitToAll(io, "test:published", eventData);
  }
  
  // Also emit to PRs specifically
  emitToPRs(io, "test:published", eventData);
};

const emitTestUpdated = (io, data) => {
  const eventData = { ...data, timestamp: new Date() };
  emitToAll(io, "test:updated", eventData);
  emitToPRs(io, "test:updated", eventData);
};

const emitTestDeleted = (io, data) => {
  const eventData = { ...data, timestamp: new Date() };
  emitToAll(io, "test:deleted", eventData);
  emitToPRs(io, "test:deleted", eventData);
};

const emitTestCompleted = (io, data) => {
  const eventData = { ...data, timestamp: new Date() };
  emitToAll(io, "test:completed", eventData);
  emitToPRs(io, "test:completed", eventData);
};

const emitResourceAdded = (io, data) => {
  const eventData = { ...data, timestamp: new Date() };
  emitToAll(io, "resource:added", eventData);
  emitToPRs(io, "resource:added", eventData);
};

// Notification helpers
const createNotification = (type, title, message, data = {}) => ({
  id: Date.now().toString(),
  type,
  title,
  message,
  data,
  timestamp: new Date().toISOString(),
  read: false
});

const emitPlacementDataUpdate = (io, action, data) => {
  const eventData = {
    action, // 'batch_added', 'data_uploaded', 'batch_deleted'
    data,
    timestamp: new Date(),
  };

  emitToAll(io, "placementDataUpdate", eventData);
};

const emitProfileUpdate = (io, action, data) => {
  const eventData = {
    action, // 'basic_info_updated', 'files_uploaded'
    data,
    timestamp: new Date(),
  };

  emitToAll(io, "profileUpdate", eventData);
};

const emitCGPAUpdate = (io, action, data) => {
  const eventData = {
    action, // 'csv_uploaded', 'manual_update'
    data,
    timestamp: new Date(),
  };

  emitToAll(io, "cgpaUpdate", eventData);
};

module.exports = {
  emitToPOs,
  emitToPRs,
  emitToStudents,
  emitToAll,
  emitJobDriveUpdate,
  emitApplicationUpdate,
  emitDeletionRequestUpdate,
  emitPlacementUpdate,
  emitAnalyticsUpdate,
  emitPlacementDataUpdate,
  emitProfileUpdate,
  emitCGPAUpdate,
  emitTestPublished,
  emitTestUpdated,
  emitTestDeleted,
  emitTestCompleted,
  emitResourceAdded,
  createNotification,
};
