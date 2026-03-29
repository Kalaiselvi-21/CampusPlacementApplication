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
  emitToPOs(io, event, data);
  emitToPRs(io, event, data);
  emitToStudents(io, event, data);
};

// Specific event emitters for different actions
const emitJobDriveUpdate = (io, action, jobDrive) => {
  const eventData = {
    action, // 'created', 'updated', 'deleted', 'application_submitted'
    jobDrive,
    timestamp: new Date(),
  };
  // Only students and PRs care about job drive updates
  emitToStudents(io, "jobDriveUpdate", eventData);
  emitToPRs(io, "jobDriveUpdate", eventData);
  emitToPOs(io, "jobDriveUpdate", eventData);
};

const emitApplicationUpdate = (io, action, applicationData) => {
  const eventData = {
    action, // 'submitted', 'reviewed', 'shortlisted'
    applicationData,
    timestamp: new Date(),
  };
  // PR and PO need to see applications; student only needs their own (handled by userId room if needed)
  emitToPRs(io, "applicationUpdate", eventData);
  emitToPOs(io, "applicationUpdate", eventData);
};

const emitDeletionRequestUpdate = (io, action, deletionRequest) => {
  const eventData = {
    action, // 'created', 'approved', 'rejected'
    deletionRequest,
    timestamp: new Date(),
  };

  if (action === "created") {
    emitToPOs(io, "deletionRequestUpdate", eventData);
  } else if (action === "approved" || action === "rejected") {
    emitToPRs(io, "deletionRequestUpdate", eventData);
  }
};

const emitPlacementUpdate = (io, action, placement) => {
  const eventData = {
    action, // 'created', 'updated', 'deleted'
    placement,
    timestamp: new Date(),
  };
  emitToPOs(io, "placementUpdate", eventData);
  emitToPRs(io, "placementUpdate", eventData);
};

const emitAnalyticsUpdate = (io, data) => {
  const eventData = {
    data,
    timestamp: new Date(),
  };
  // Analytics are only viewed by PO/PR
  emitToPOs(io, "analyticsUpdate", eventData);
  emitToPRs(io, "analyticsUpdate", eventData);
};

// Placement Preparation specific events
const emitTestPublished = (io, data) => {
  const eventData = { ...data, timestamp: new Date() };
  emitToStudents(io, "test:published", eventData);
  emitToPRs(io, "test:published", eventData);
};

const emitTestUpdated = (io, data) => {
  const eventData = { ...data, timestamp: new Date() };
  emitToStudents(io, "test:updated", eventData);
  emitToPRs(io, "test:updated", eventData);
};

const emitTestDeleted = (io, data) => {
  const eventData = { ...data, timestamp: new Date() };
  emitToStudents(io, "test:deleted", eventData);
  emitToPRs(io, "test:deleted", eventData);
};

const emitTestCompleted = (io, data) => {
  const eventData = { ...data, timestamp: new Date() };
  emitToPRs(io, "test:completed", eventData);
};

const emitResourceAdded = (io, data) => {
  const eventData = { ...data, timestamp: new Date() };
  emitToStudents(io, "resource:added", eventData);
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
  emitToPOs(io, "placementDataUpdate", eventData);
  emitToPRs(io, "placementDataUpdate", eventData);
};

const emitProfileUpdate = (io, action, data) => {
  const eventData = {
    action, // 'basic_info_updated', 'files_uploaded'
    data,
    timestamp: new Date(),
  };
  // Profile updates only relevant to PO/PR for monitoring
  emitToPOs(io, "profileUpdate", eventData);
  emitToPRs(io, "profileUpdate", eventData);
};

const emitCGPAUpdate = (io, action, data) => {
  const eventData = {
    action, // 'csv_uploaded', 'manual_update'
    data,
    timestamp: new Date(),
  };
  emitToPOs(io, "cgpaUpdate", eventData);
  emitToPRs(io, "cgpaUpdate", eventData);
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
