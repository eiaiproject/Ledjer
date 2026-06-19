-- Fix: Add missing can_manage_products column BEFORE it's used in RLS policies
-- This column was referenced in 20260627 but not created until later in that migration
-- This migration adds it to ensure RLS policies work correctly

ALTER TABLE public.organization_members 
  ADD COLUMN IF NOT EXISTS can_manage_products BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.organization_members.can_manage_products IS 
  'Staff permission: can create, update, and delete products';
