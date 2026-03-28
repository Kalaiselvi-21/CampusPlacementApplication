-- Migration: Add support for user deletion archiving and backlog history
-- Date: 2026-03-24
-- Purpose: Enable user deletion with data archiving and support backlog history tracking

-- Fix 1: Add history_of_backlogs column to user_profiles for tracking backlog history
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS history_of_backlogs jsonb DEFAULT '[]'::jsonb;

-- Fix 2: Ensure deleted_users table has all necessary columns for archiving
-- This table stores snapshots of deleted user data for compliance and record-keeping
ALTER TABLE deleted_users
ADD COLUMN IF NOT EXISTS user_id uuid UNIQUE,
ADD COLUMN IF NOT EXISTS email text,
ADD COLUMN IF NOT EXISTS name text,
ADD COLUMN IF NOT EXISTS role text,
ADD COLUMN IF NOT EXISTS user_data jsonb,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS deletion_reason text;

-- Create index on deleted_at for efficient queries
CREATE INDEX IF NOT EXISTS idx_deleted_users_deleted_at ON deleted_users(deleted_at DESC);

-- Create index on user_id for lookups
CREATE INDEX IF NOT EXISTS idx_deleted_users_user_id ON deleted_users(user_id);

-- Add comment to deleted_users table for clarity
COMMENT ON TABLE deleted_users IS 'Archive of deleted user data for compliance and audit trail';
COMMENT ON COLUMN deleted_users.user_id IS 'Original user ID (soft-linked from deleted user)';
COMMENT ON COLUMN deleted_users.deleted_by IS 'ID of admin/PO who initiated deletion';
COMMENT ON COLUMN deleted_users.deletion_reason IS 'Reason for user deletion';
COMMENT ON COLUMN deleted_users.user_data IS 'Full JSON snapshot of user data at time of deletion';
