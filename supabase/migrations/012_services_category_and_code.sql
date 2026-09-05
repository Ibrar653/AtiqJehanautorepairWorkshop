-- ─── 012: Add category, service_code, and estimated_time to services table ───

ALTER TABLE services ADD COLUMN IF NOT EXISTS service_code TEXT;
ALTER TABLE services ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'General Maintenance';
ALTER TABLE services ADD COLUMN IF NOT EXISTS estimated_time TEXT DEFAULT '45 mins';

CREATE INDEX IF NOT EXISTS idx_services_category ON services(category);
CREATE INDEX IF NOT EXISTS idx_services_service_code ON services(service_code);

