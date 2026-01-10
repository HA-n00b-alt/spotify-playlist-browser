-- Add super admin flag to existing admin users table
ALTER TABLE admin_users
ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT FALSE;
