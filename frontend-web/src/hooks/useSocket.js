import { useEffect, useCallback } from "react";
import socketService from "../services/socketService";
import { toast } from "react-hot-toast";

// Hook for job drive real-time updates
export const useJobDriveUpdates = (onUpdate) => {
  const handleJobDriveUpdate = useCallback(
    (data) => {
      const { action, jobDrive } = data;

      // Show toast notification
      switch (action) {
        case "created":
          toast.success(`New job drive created: ${jobDrive.companyName}`);
          break;
        case "updated":
          toast(`Job drive updated: ${jobDrive.companyName}`);
          break;
        case "deleted":
          toast.error(`Job drive deleted: ${jobDrive.companyName}`);
          break;
        case "application_submitted":
          toast(`New application submitted for ${jobDrive.companyName}`);
          break;
        default:
          break;
      }

      // Call the provided callback with update data
      if (onUpdate) {
        onUpdate(data);
      }
    },
    [onUpdate]
  );

  useEffect(() => {
    socketService.onJobDriveUpdate(handleJobDriveUpdate);

    return () => {
      socketService.offJobDriveUpdate(handleJobDriveUpdate);
    };
  }, [handleJobDriveUpdate]);
};

// Hook for deletion request real-time updates
export const useDeletionRequestUpdates = (onUpdate) => {
  const handleDeletionRequestUpdate = useCallback(
    (data) => {
      const { action, deletionRequest } = data;

      // Show toast notification
      switch (action) {
        case "created":
          toast("New deletion request submitted");
          break;
        case "approved":
          toast.success("Deletion request approved");
          break;
        case "rejected":
          toast.error("Deletion request rejected");
          break;
        default:
          break;
      }

      // Call the provided callback with update data
      if (onUpdate) {
        onUpdate(data);
      }
    },
    [onUpdate]
  );

  useEffect(() => {
    socketService.onDeletionRequestUpdate(handleDeletionRequestUpdate);

    return () => {
      socketService.offDeletionRequestUpdate(handleDeletionRequestUpdate);
    };
  }, [handleDeletionRequestUpdate]);
};

// Hook for placement real-time updates
export const usePlacementUpdates = (onUpdate) => {
  const handlePlacementUpdate = useCallback(
    (data) => {
      const { action, placement } = data;

      // Show toast notification
      switch (action) {
        case "created":
          toast.success("New placement recorded");
          break;
        case "updated":
          toast("Placement information updated");
          break;
        case "deleted":
          toast.error("Placement record deleted");
          break;
        default:
          break;
      }

      // Call the provided callback with update data
      if (onUpdate) {
        onUpdate(data);
      }
    },
    [onUpdate]
  );

  useEffect(() => {
    socketService.onPlacementUpdate(handlePlacementUpdate);

    return () => {
      socketService.offPlacementUpdate(handlePlacementUpdate);
    };
  }, [handlePlacementUpdate]);
};

// Hook for application real-time updates
export const useApplicationUpdates = (onUpdate) => {
  const handleApplicationUpdate = useCallback(
    (data) => {
      const { action, applicationData } = data;

      // Show toast notification
      switch (action) {
        case "submitted":
          toast("New application submitted");
          break;
        case "reviewed":
          toast("Application status updated");
          break;
        case "shortlisted":
          toast.success("Application shortlisted");
          break;
        default:
          break;
      }

      // Call the provided callback with update data
      if (onUpdate) {
        onUpdate(data);
      }
    },
    [onUpdate]
  );

  useEffect(() => {
    socketService.on("applicationUpdate", handleApplicationUpdate);

    return () => {
      socketService.off("applicationUpdate", handleApplicationUpdate);
    };
  }, [handleApplicationUpdate]);
};

// Hook for analytics real-time updates
export const useAnalyticsUpdates = (onUpdate) => {
  const handleAnalyticsUpdate = useCallback(
    (data) => {
      // Analytics updates don't need toast notifications as they're background updates

      // Call the provided callback with update data
      if (onUpdate) {
        onUpdate(data);
      }
    },
    [onUpdate]
  );

  useEffect(() => {
    socketService.onAnalyticsUpdate(handleAnalyticsUpdate);

    return () => {
      socketService.offAnalyticsUpdate(handleAnalyticsUpdate);
    };
  }, [handleAnalyticsUpdate]);
};

// Hook for placement data real-time updates
export const usePlacementDataUpdates = (onUpdate) => {
  const handlePlacementDataUpdate = useCallback(
    (data) => {
      const { action, data: updateData } = data;

      // Show toast notification
      switch (action) {
        case "batch_added":
          toast.success(`New batch added: ${updateData.batchName}`);
          break;
        case "data_uploaded":
          toast.success(
            `Placement data uploaded for batch: ${updateData.batch}`
          );
          break;
        case "batch_deleted":
          toast.error(`Batch deleted: ${updateData.batch}`);
          break;
        default:
          break;
      }

      // Call the provided callback with update data
      if (onUpdate) {
        onUpdate(data);
      }
    },
    [onUpdate]
  );

  useEffect(() => {
    socketService.onPlacementDataUpdate(handlePlacementDataUpdate);

    return () => {
      socketService.offPlacementDataUpdate(handlePlacementDataUpdate);
    };
  }, [handlePlacementDataUpdate]);
};

// Hook for profile real-time updates
export const useProfileUpdates = (onUpdate) => {
  const handleProfileUpdate = useCallback(
    (data) => {
      const { action, data: updateData } = data;

      // Show toast notification
      switch (action) {
        case "basic_info_updated":
          toast.success("Profile updated successfully");
          break;
        case "files_uploaded":
          toast.success("Files uploaded successfully");
          break;
        default:
          break;
      }

      // Call the provided callback with update data
      if (onUpdate) {
        onUpdate(data);
      }
    },
    [onUpdate]
  );

  useEffect(() => {
    socketService.onProfileUpdate(handleProfileUpdate);

    return () => {
      socketService.offProfileUpdate(handleProfileUpdate);
    };
  }, [handleProfileUpdate]);
};

// Hook for CGPA real-time updates
export const useCGPAUpdates = (onUpdate) => {
  const handleCGPAUpdate = useCallback(
    (data) => {
      const { action, data: updateData } = data;

      // Show toast notification
      switch (action) {
        case "csv_uploaded":
          toast.success(
            `CGPA data uploaded: ${updateData.updatedCount} students updated`
          );
          break;
        case "manual_update":
          toast.success(`CGPA updated for ${updateData.name}`);
          break;
        default:
          break;
      }

      // Call the provided callback with update data
      if (onUpdate) {
        onUpdate(data);
      }
    },
    [onUpdate]
  );

  useEffect(() => {
    socketService.onCGPAUpdate(handleCGPAUpdate);

    return () => {
      socketService.offCGPAUpdate(handleCGPAUpdate);
    };
  }, [handleCGPAUpdate]);
};

// Hook for round management updates (for modal refreshing)
export const useRoundUpdates = (onUpdate) => {
  const handleJobDriveUpdate = useCallback((data) => {
    const { action, jobDrive } = data;
    
    // Handle round-specific updates
    if (action === 'students_selected' || action === 'round_status_updated' || action === 'selection_rounds_added') {
      // Call the provided callback with update data
      if (onUpdate) {
        onUpdate(data);
      }
    }
  }, [onUpdate]);

  useEffect(() => {
    socketService.onJobDriveUpdate(handleJobDriveUpdate);
    
    return () => {
      socketService.offJobDriveUpdate(handleJobDriveUpdate);
    };
  }, [handleJobDriveUpdate]);
};

// Hook for modal content updates - specifically for job drive modals
export const useModalUpdates = (driveId, onUpdate) => {
  const handleJobDriveUpdate = useCallback((data) => {
    const { action, jobDrive } = data;
    
    // Check if this update is for the modal's drive
    if (jobDrive && (jobDrive._id === driveId || jobDrive.id === driveId)) {
      // Call the provided callback with update data
      if (onUpdate) {
        onUpdate(jobDrive, action);
      }
    }
  }, [driveId, onUpdate]);

  useEffect(() => {
    if (driveId) {
      socketService.onJobDriveUpdate(handleJobDriveUpdate);
      
      return () => {
        socketService.offJobDriveUpdate(handleJobDriveUpdate);
      };
    }
  }, [driveId, handleJobDriveUpdate]);
};

// Hook to initialize socket connection with user role
export const useSocketConnection = (userRole) => {
  useEffect(() => {
    if (userRole && !socketService.isConnected()) {
      socketService.connect(userRole);
    }

    return () => {
      // Don't disconnect on unmount as other components might be using it
      // socketService.disconnect();
    };
  }, [userRole]);

  return socketService.isConnected();
};

// Generic hook for custom socket events
export const useSocketEvent = (eventName, callback) => {
  const handleEvent = useCallback(
    (data) => {
      if (callback) {
        callback(data);
      }
    },
    [callback]
  );

  useEffect(() => {
    socketService.on(eventName, handleEvent);

    return () => {
      socketService.off(eventName, handleEvent);
    };
  }, [eventName, handleEvent]);
};
