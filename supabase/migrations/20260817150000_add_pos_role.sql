-- Add pos_role column to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pos_role text;
