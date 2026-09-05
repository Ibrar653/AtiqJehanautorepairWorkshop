-- ============================================================================
-- Migration: Uploaded Job Cards & Job Card Attachments
-- ============================================================================

-- ─── Add work_details to job_cards if not exists ─────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'job_cards' AND column_name = 'work_details'
  ) THEN
    ALTER TABLE job_cards ADD COLUMN work_details TEXT;
  END IF;
END $$;

-- ─── Document Type Enum ──────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'document_type') THEN
    CREATE TYPE document_type AS ENUM (
      'paper_job_card',
      'vehicle_photo',
      'supplier_document',
      'inspection_photo',
      'other'
    );
  END IF;
END $$;

-- ─── Uploaded Job Cards Table ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS uploaded_job_cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_card_number TEXT NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  document_type document_type NOT NULL DEFAULT 'paper_job_card',
  job_card_id UUID REFERENCES job_cards(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_uploaded_job_cards_customer ON uploaded_job_cards(customer_id);
CREATE INDEX IF NOT EXISTS idx_uploaded_job_cards_vehicle ON uploaded_job_cards(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_uploaded_job_cards_number ON uploaded_job_cards(job_card_number);
CREATE INDEX IF NOT EXISTS idx_uploaded_job_cards_date ON uploaded_job_cards(date);

-- ─── Job Card Attachments Table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_card_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_card_id UUID NOT NULL REFERENCES job_cards(id) ON DELETE CASCADE,
  document_type document_type NOT NULL DEFAULT 'vehicle_photo',
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  description TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_card_attachments_job_card ON job_card_attachments(job_card_id);

-- ─── Storage Bucket Setup ───────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('job-card-documents', 'job-card-documents', true)
ON CONFLICT (id) DO NOTHING;
