CREATE SCHEMA IF NOT EXISTS pp09;
CREATE TABLE IF NOT EXISTS pp09.categories (
 id BIGSERIAL PRIMARY KEY, code VARCHAR(30) NOT NULL UNIQUE, name VARCHAR(80) NOT NULL
);
CREATE TABLE IF NOT EXISTS pp09.clients (
 id BIGSERIAL PRIMARY KEY, code VARCHAR(30) NOT NULL UNIQUE,
 name VARCHAR(120) NOT NULL, industry VARCHAR(80) NOT NULL, city VARCHAR(80) NOT NULL,
 is_demo BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS pp09.projects (
 id BIGSERIAL PRIMARY KEY,
 slug VARCHAR(70) NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]{2,70}$'),
 title VARCHAR(100) NOT NULL CHECK (length(trim(title)) > 0),
 summary VARCHAR(500) NOT NULL CHECK (length(trim(summary)) > 0),
 category_id BIGINT NOT NULL REFERENCES pp09.categories(id) ON DELETE RESTRICT,
 client_id BIGINT NOT NULL REFERENCES pp09.clients(id) ON DELETE RESTRICT,
 image_url VARCHAR(100), is_published BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pp09.tags (
 id BIGSERIAL PRIMARY KEY, code VARCHAR(30) NOT NULL UNIQUE, name VARCHAR(80) NOT NULL
);
CREATE TABLE IF NOT EXISTS pp09.project_tags (
 project_id BIGINT NOT NULL REFERENCES pp09.projects(id) ON DELETE CASCADE,
 tag_id BIGINT NOT NULL REFERENCES pp09.tags(id) ON DELETE RESTRICT,
 PRIMARY KEY (project_id, tag_id)
);
CREATE TABLE IF NOT EXISTS pp09.inquiry_statuses (
 id BIGSERIAL PRIMARY KEY, code VARCHAR(20) NOT NULL UNIQUE, name VARCHAR(60) NOT NULL
);
CREATE TABLE IF NOT EXISTS pp09.admin_users (
 id BIGSERIAL PRIMARY KEY, username VARCHAR(50) NOT NULL UNIQUE, password_hash TEXT NOT NULL,
 display_name VARCHAR(100) NOT NULL, is_active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pp09.inquiries (
 id BIGSERIAL PRIMARY KEY,
 project_id BIGINT REFERENCES pp09.projects(id) ON DELETE SET NULL,
 status_id BIGINT NOT NULL REFERENCES pp09.inquiry_statuses(id) ON DELETE RESTRICT,
 assigned_to BIGINT REFERENCES pp09.admin_users(id) ON DELETE SET NULL,
 name VARCHAR(100) NOT NULL, email VARCHAR(200) NOT NULL,
 topic VARCHAR(20) NOT NULL CHECK (topic IN ('project','career','support')),
 channel VARCHAR(10) NOT NULL CHECK (channel IN ('email','phone')),
 message VARCHAR(2000) NOT NULL, is_demo BOOLEAN NOT NULL DEFAULT FALSE,
 demo_code VARCHAR(40) UNIQUE, legacy_source_id BIGINT UNIQUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pp09.admin_sessions (
 token_hash CHAR(64) PRIMARY KEY,
 user_id BIGINT NOT NULL REFERENCES pp09.admin_users(id) ON DELETE CASCADE,
 csrf_token CHAR(64) NOT NULL, expires_at TIMESTAMPTZ NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pp09.site_pages (
 id BIGSERIAL PRIMARY KEY, path VARCHAR(32) NOT NULL UNIQUE, title VARCHAR(100) NOT NULL
);
CREATE TABLE IF NOT EXISTS pp09.daily_views (
 visited_on DATE NOT NULL DEFAULT CURRENT_DATE,
 page_id BIGINT NOT NULL REFERENCES pp09.site_pages(id) ON DELETE RESTRICT,
 views BIGINT NOT NULL DEFAULT 0 CHECK (views >= 0), is_demo BOOLEAN NOT NULL DEFAULT FALSE,
 PRIMARY KEY (visited_on, page_id)
);
CREATE TABLE IF NOT EXISTS pp09.audit_events (
 id BIGSERIAL PRIMARY KEY,
 user_id BIGINT REFERENCES pp09.admin_users(id) ON DELETE SET NULL,
 project_id BIGINT REFERENCES pp09.projects(id) ON DELETE SET NULL,
 inquiry_id BIGINT REFERENCES pp09.inquiries(id) ON DELETE SET NULL,
 action VARCHAR(40) NOT NULL, details JSONB NOT NULL DEFAULT '{}'::jsonb,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS projects_category_idx ON pp09.projects(category_id, id DESC) WHERE is_published;
CREATE INDEX IF NOT EXISTS projects_client_idx ON pp09.projects(client_id);
CREATE INDEX IF NOT EXISTS project_tags_tag_idx ON pp09.project_tags(tag_id);
CREATE INDEX IF NOT EXISTS inquiries_status_idx ON pp09.inquiries(status_id, created_at DESC);
CREATE INDEX IF NOT EXISTS inquiries_project_idx ON pp09.inquiries(project_id);
CREATE INDEX IF NOT EXISTS admin_sessions_expiry_idx ON pp09.admin_sessions(expires_at);
CREATE INDEX IF NOT EXISTS audit_events_date_idx ON pp09.audit_events(created_at DESC);
