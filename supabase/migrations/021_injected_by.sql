-- Migration 021: Add injected_by to whatsapp_numbers for per-admin injection isolation
-- Run this in Supabase SQL Editor

-- Add injected_by column so we can track which admin injected each hidden number
ALTER TABLE whatsapp_numbers ADD COLUMN IF NOT EXISTS injected_by UUID REFERENCES auth.users(id);
