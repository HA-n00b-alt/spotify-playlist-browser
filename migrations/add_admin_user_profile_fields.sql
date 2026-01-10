-- Add profile fields for admin users and requests
ALTER TABLE admin_users
ADD COLUMN IF NOT EXISTS display_name TEXT,
ADD COLUMN IF NOT EXISTS email TEXT;

ALTER TABLE admin_access_requests
ADD COLUMN IF NOT EXISTS display_name TEXT,
ADD COLUMN IF NOT EXISTS email TEXT;
