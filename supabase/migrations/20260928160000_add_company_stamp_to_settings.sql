-- Migration: Add company_stamp_base64 to settings
ALTER TABLE IF EXISTS settings ADD COLUMN IF NOT EXISTS company_stamp_base64 TEXT;
