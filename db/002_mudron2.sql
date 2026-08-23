-- ============================================================================
-- Mudron 2.0 migration
-- Adds: manuscripts, AI Manuscript Doctor, readiness score, publisher matcher,
--       submission packages + tracker, formatter outputs, metadata, beta readers,
--       pro marketplace, integrity/provenance, sales analytics, universal links.
-- Safe to run multiple times.
-- Run:  psql -U postgres -d Maindb -f db/migrations/002_mudron2.sql
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Patch existing tables
-- ---------------------------------------------------------------------------
ALTER TABLE Author  ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE Author  ADD COLUMN IF NOT EXISTS pen_name      VARCHAR(100);
ALTER TABLE Author  ADD COLUMN IF NOT EXISTS bio           TEXT;
ALTER TABLE Author  ADD COLUMN IF NOT EXISTS country       VARCHAR(60) DEFAULT 'Bangladesh';
ALTER TABLE Author  ADD COLUMN IF NOT EXISTS ui_language   VARCHAR(5)  DEFAULT 'bn';

ALTER TABLE Publisher ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE Editor    ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

-- Once a password is upgraded to a bcrypt hash the legacy plaintext column is
-- cleared, so it must be nullable. Editor.password was declared NOT NULL.
ALTER TABLE Editor    ALTER COLUMN password DROP NOT NULL;

-- app.js queries Book_sales but it was never created.
CREATE TABLE IF NOT EXISTS Book_sales (
    sale_id      BIGSERIAL PRIMARY KEY,
    book_id      BIGINT REFERENCES Book(book_id) ON DELETE CASCADE,
    channel      VARCHAR(40)  DEFAULT 'online',
    store_id     INT,
    unit_price   DECIMAL(10,2) DEFAULT 0,
    currency     VARCHAR(5)   DEFAULT 'BDT',
    sold_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_book_sales_book ON Book_sales(book_id);
CREATE INDEX IF NOT EXISTS idx_book_sales_date ON Book_sales(sold_at);

-- ---------------------------------------------------------------------------
-- 1. Manuscript core (real uploads replace the old pdf_link text field)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS Manuscript (
    manuscript_id BIGSERIAL PRIMARY KEY,
    author_id     BIGINT REFERENCES Author(id) ON DELETE CASCADE,
    title         VARCHAR(255) NOT NULL,
    subtitle      VARCHAR(255),
    genre         VARCHAR(60),
    language      VARCHAR(10)  DEFAULT 'bn',      -- bn | en | mixed
    audience      VARCHAR(40)  DEFAULT 'adult',   -- children | ya | adult | academic
    country       VARCHAR(60)  DEFAULT 'Bangladesh',
    synopsis      TEXT,
    word_count    INT          DEFAULT 0,
    char_count    INT          DEFAULT 0,
    chapter_count INT          DEFAULT 0,
    cover_path    VARCHAR(500),
    status        VARCHAR(30)  DEFAULT 'draft',   -- draft|analyzed|formatted|submitted|published
    created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_manuscript_author ON Manuscript(author_id);

CREATE TABLE IF NOT EXISTS Manuscript_Chapter (
    chapter_id    BIGSERIAL PRIMARY KEY,
    manuscript_id BIGINT REFERENCES Manuscript(manuscript_id) ON DELETE CASCADE,
    chapter_no    INT NOT NULL,
    title         VARCHAR(255),
    content       TEXT,
    word_count    INT DEFAULT 0,
    UNIQUE (manuscript_id, chapter_no)
);
CREATE INDEX IF NOT EXISTS idx_chapter_ms ON Manuscript_Chapter(manuscript_id);

CREATE TABLE IF NOT EXISTS Manuscript_File (
    file_id       BIGSERIAL PRIMARY KEY,
    manuscript_id BIGINT REFERENCES Manuscript(manuscript_id) ON DELETE CASCADE,
    kind          VARCHAR(20),      -- source | pdf | epub | print_pdf | cover
    file_path     VARCHAR(500),
    original_name VARCHAR(255),
    mime_type     VARCHAR(100),
    size_bytes    BIGINT,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_msfile_ms ON Manuscript_File(manuscript_id, kind);

-- ---------------------------------------------------------------------------
-- 2. AI Manuscript Doctor
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS Manuscript_Analysis (
    analysis_id     BIGSERIAL PRIMARY KEY,
    manuscript_id   BIGINT REFERENCES Manuscript(manuscript_id) ON DELETE CASCADE,
    health_score    INT DEFAULT 0,      -- 0..100
    engine          VARCHAR(20) DEFAULT 'heuristic',  -- heuristic | ai | hybrid
    language        VARCHAR(10),
    metrics         JSONB,              -- pacing curve, dialogue ratio, readability ...
    voice_preserved BOOLEAN DEFAULT TRUE,
    run_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_analysis_ms ON Manuscript_Analysis(manuscript_id, run_at DESC);

CREATE TABLE IF NOT EXISTS Manuscript_Issue (
    issue_id     BIGSERIAL PRIMARY KEY,
    analysis_id  BIGINT REFERENCES Manuscript_Analysis(analysis_id) ON DELETE CASCADE,
    chapter_no   INT,
    category     VARCHAR(40),   -- plot_hole|pacing|repetition|character|dialogue|clarity|grammar|style
    severity     VARCHAR(10),   -- low | medium | high
    message      TEXT,
    excerpt      TEXT,
    suggestion   TEXT,
    resolved     BOOLEAN DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_issue_analysis ON Manuscript_Issue(analysis_id, category);

-- ---------------------------------------------------------------------------
-- 3. Publishing Readiness Score
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS Readiness_Snapshot (
    snapshot_id    BIGSERIAL PRIMARY KEY,
    manuscript_id  BIGINT REFERENCES Manuscript(manuscript_id) ON DELETE CASCADE,
    manuscript_pct INT DEFAULT 0,
    editing_pct    INT DEFAULT 0,
    formatting_pct INT DEFAULT 0,
    cover_pct      INT DEFAULT 0,
    metadata_pct   INT DEFAULT 0,
    overall_pct    INT DEFAULT 0,
    blockers       JSONB,
    computed_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_readiness_ms ON Readiness_Snapshot(manuscript_id, computed_at DESC);

-- ---------------------------------------------------------------------------
-- 4. Publisher / literary-agent matcher
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS Publisher_Profile (
    publisher_id       BIGINT PRIMARY KEY REFERENCES Publisher(publisher_id) ON DELETE CASCADE,
    is_agent           BOOLEAN DEFAULT FALSE,
    accepted_genres    TEXT[],
    languages          TEXT[] DEFAULT ARRAY['bn'],
    audiences          TEXT[] DEFAULT ARRAY['adult'],
    min_words          INT DEFAULT 0,
    max_words          INT DEFAULT 250000,
    country            VARCHAR(60) DEFAULT 'Bangladesh',
    open_for_submission BOOLEAN DEFAULT TRUE,
    response_days      INT DEFAULT 30,
    submission_guidelines TEXT,
    wants_full_manuscript BOOLEAN DEFAULT FALSE,
    updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Publisher_Match (
    match_id      BIGSERIAL PRIMARY KEY,
    manuscript_id BIGINT REFERENCES Manuscript(manuscript_id) ON DELETE CASCADE,
    publisher_id  BIGINT REFERENCES Publisher(publisher_id) ON DELETE CASCADE,
    score         INT,
    reasons       JSONB,
    computed_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (manuscript_id, publisher_id)
);

-- ---------------------------------------------------------------------------
-- 5. Submission package + tracker
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS Submission_Package (
    package_id    BIGSERIAL PRIMARY KEY,
    manuscript_id BIGINT REFERENCES Manuscript(manuscript_id) ON DELETE CASCADE,
    language      VARCHAR(10) DEFAULT 'bn',
    query_letter  TEXT,
    synopsis      TEXT,
    pitch         TEXT,
    author_bio    TEXT,
    proposal      TEXT,
    comp_titles   TEXT,
    sample_chapters TEXT,
    generated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Submission (
    submission_id BIGSERIAL PRIMARY KEY,
    manuscript_id BIGINT REFERENCES Manuscript(manuscript_id) ON DELETE CASCADE,
    publisher_id  BIGINT REFERENCES Publisher(publisher_id),
    package_id    BIGINT REFERENCES Submission_Package(package_id),
    status        VARCHAR(30) DEFAULT 'submitted',
        -- submitted|viewed|requested_partial|requested_full|offer|accepted|rejected|withdrawn
    submitted_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expected_by   DATE,
    notes         TEXT,
    UNIQUE (manuscript_id, publisher_id)
);
CREATE INDEX IF NOT EXISTS idx_submission_ms ON Submission(manuscript_id);

CREATE TABLE IF NOT EXISTS Submission_Event (
    event_id      BIGSERIAL PRIMARY KEY,
    submission_id BIGINT REFERENCES Submission(submission_id) ON DELETE CASCADE,
    status        VARCHAR(30),
    note          TEXT,
    event_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- 6. Discoverability metadata
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS Book_Metadata (
    metadata_id   BIGSERIAL PRIMARY KEY,
    manuscript_id BIGINT REFERENCES Manuscript(manuscript_id) ON DELETE CASCADE,
    title         VARCHAR(255),
    subtitle      VARCHAR(255),
    blurb         TEXT,
    keywords      TEXT[],
    categories    TEXT[],
    audience      VARCHAR(60),
    comp_titles   TEXT,
    isbn          VARCHAR(20),
    seo_score     INT DEFAULT 0,
    language      VARCHAR(10) DEFAULT 'bn',
    generated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_metadata_ms ON Book_Metadata(manuscript_id, generated_at DESC);

-- ---------------------------------------------------------------------------
-- 7. Beta readers + professional marketplace
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS Beta_Invite (
    invite_id     BIGSERIAL PRIMARY KEY,
    manuscript_id BIGINT REFERENCES Manuscript(manuscript_id) ON DELETE CASCADE,
    reader_email  VARCHAR(150),
    reader_name   VARCHAR(120),
    token         VARCHAR(64) UNIQUE,
    from_chapter  INT DEFAULT 1,
    to_chapter    INT,
    status        VARCHAR(20) DEFAULT 'invited',  -- invited|opened|submitted|expired
    invited_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at    TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Beta_Feedback (
    feedback_id   BIGSERIAL PRIMARY KEY,
    manuscript_id BIGINT REFERENCES Manuscript(manuscript_id) ON DELETE CASCADE,
    invite_id     BIGINT REFERENCES Beta_Invite(invite_id) ON DELETE SET NULL,
    reader_name   VARCHAR(120),
    chapter_no    INT,
    story         INT CHECK (story BETWEEN 0 AND 10),
    characters    INT CHECK (characters BETWEEN 0 AND 10),
    pacing        INT CHECK (pacing BETWEEN 0 AND 10),
    ending        INT CHECK (ending BETWEEN 0 AND 10),
    prose         INT CHECK (prose BETWEEN 0 AND 10),
    would_recommend BOOLEAN,
    comment       TEXT,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_beta_fb_ms ON Beta_Feedback(manuscript_id);

CREATE TABLE IF NOT EXISTS Service_Pro (
    pro_id     BIGSERIAL PRIMARY KEY,
    name       VARCHAR(150) NOT NULL,
    role       VARCHAR(40),    -- editor|proofreader|cover_designer|translator|marketer|illustrator
    languages  TEXT[] DEFAULT ARRAY['bn'],
    genres     TEXT[],
    rate       DECIMAL(10,2),
    currency   VARCHAR(5) DEFAULT 'BDT',
    rate_unit  VARCHAR(20) DEFAULT 'per_1000_words',
    bio        TEXT,
    portfolio_url VARCHAR(300),
    rating     DECIMAL(3,2) DEFAULT 0,
    jobs_done  INT DEFAULT 0,
    email      VARCHAR(150),
    available  BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS Pro_Hire (
    hire_id       BIGSERIAL PRIMARY KEY,
    manuscript_id BIGINT REFERENCES Manuscript(manuscript_id) ON DELETE CASCADE,
    pro_id        BIGINT REFERENCES Service_Pro(pro_id),
    author_id     BIGINT REFERENCES Author(id),
    status        VARCHAR(20) DEFAULT 'requested', -- requested|accepted|in_progress|delivered|cancelled
    agreed_rate   DECIMAL(10,2),
    brief         TEXT,
    hired_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- 8. Copyright / plagiarism / AI provenance
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS Integrity_Report (
    report_id            BIGSERIAL PRIMARY KEY,
    manuscript_id        BIGINT REFERENCES Manuscript(manuscript_id) ON DELETE CASCADE,
    plagiarism_score     INT DEFAULT 0,   -- 0..100, higher = more overlap found
    ai_likelihood        INT DEFAULT 0,   -- 0..100 heuristic
    unverified_quotes    INT DEFAULT 0,
    missing_attribution  INT DEFAULT 0,
    details              JSONB,
    run_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Integrity_Match (
    match_id    BIGSERIAL PRIMARY KEY,
    report_id   BIGINT REFERENCES Integrity_Report(report_id) ON DELETE CASCADE,
    chapter_no  INT,
    excerpt     TEXT,
    source_type VARCHAR(30),  -- internal_manuscript | online_book | quote | self
    source_ref  VARCHAR(255),
    similarity  INT
);

CREATE TABLE IF NOT EXISTS Provenance_Event (
    prov_id       BIGSERIAL PRIMARY KEY,
    manuscript_id BIGINT REFERENCES Manuscript(manuscript_id) ON DELETE CASCADE,
    chapter_no    INT,
    event_type    VARCHAR(30),  -- authored | imported | ai_assisted | edited_by_pro
    tool          VARCHAR(80),
    share_pct     INT DEFAULT 0,
    note          TEXT,
    recorded_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- 9. Universal Book Link + click analytics
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS Universal_Book_Link (
    ubl_id        BIGSERIAL PRIMARY KEY,
    manuscript_id BIGINT REFERENCES Manuscript(manuscript_id) ON DELETE CASCADE,
    book_id       BIGINT REFERENCES Book(book_id) ON DELETE SET NULL,
    slug          VARCHAR(80) UNIQUE NOT NULL,
    title         VARCHAR(255),
    blurb         TEXT,
    cover_path    VARCHAR(500),
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS UBL_Retailer (
    retailer_id BIGSERIAL PRIMARY KEY,
    ubl_id      BIGINT REFERENCES Universal_Book_Link(ubl_id) ON DELETE CASCADE,
    retailer    VARCHAR(80),
    url         VARCHAR(500),
    region      VARCHAR(40) DEFAULT 'BD',
    sort_order  INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS UBL_Click (
    click_id   BIGSERIAL PRIMARY KEY,
    ubl_id     BIGINT REFERENCES Universal_Book_Link(ubl_id) ON DELETE CASCADE,
    retailer   VARCHAR(80),
    referrer   VARCHAR(300),
    clicked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ubl_click ON UBL_Click(ubl_id, clicked_at);

-- ---------------------------------------------------------------------------
-- 10. Notifications
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS Notification (
    notif_id   BIGSERIAL PRIMARY KEY,
    role       VARCHAR(20),   -- author | publisher | editor
    user_id    BIGINT,
    title      VARCHAR(200),
    body       TEXT,
    link       VARCHAR(300),
    seen       BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON Notification(role, user_id, seen);

-- ---------------------------------------------------------------------------
-- 11. Server-side logic: keep counters + readiness honest
-- ---------------------------------------------------------------------------

-- Roll chapter word counts up onto the manuscript.
CREATE OR REPLACE FUNCTION sync_manuscript_counts() RETURNS TRIGGER AS $$
DECLARE
    ms BIGINT;
BEGIN
    ms := COALESCE(NEW.manuscript_id, OLD.manuscript_id);
    UPDATE Manuscript m
       SET word_count    = COALESCE((SELECT SUM(word_count) FROM Manuscript_Chapter WHERE manuscript_id = ms), 0),
           chapter_count = COALESCE((SELECT COUNT(*)        FROM Manuscript_Chapter WHERE manuscript_id = ms), 0),
           updated_at    = CURRENT_TIMESTAMP
     WHERE m.manuscript_id = ms;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_manuscript_counts_trg ON Manuscript_Chapter;
CREATE TRIGGER sync_manuscript_counts_trg
AFTER INSERT OR UPDATE OR DELETE ON Manuscript_Chapter
FOR EACH ROW EXECUTE FUNCTION sync_manuscript_counts();

-- Every submission status change is journalled automatically.
CREATE OR REPLACE FUNCTION log_submission_event() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO Submission_Event (submission_id, status, note)
        VALUES (NEW.submission_id, NEW.status, 'Submission created');
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
        INSERT INTO Submission_Event (submission_id, status, note)
        VALUES (NEW.submission_id, NEW.status, 'Status changed from ' || OLD.status);
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS log_submission_event_trg ON Submission;
CREATE TRIGGER log_submission_event_trg
AFTER INSERT OR UPDATE ON Submission
FOR EACH ROW EXECUTE FUNCTION log_submission_event();

-- Fill expected_by from the publisher's stated response time.
CREATE OR REPLACE FUNCTION set_submission_deadline() RETURNS TRIGGER AS $$
DECLARE
    days INT;
BEGIN
    IF NEW.expected_by IS NULL THEN
        SELECT response_days INTO days FROM Publisher_Profile WHERE publisher_id = NEW.publisher_id;
        NEW.expected_by := CURRENT_DATE + COALESCE(days, 30);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_submission_deadline_trg ON Submission;
CREATE TRIGGER set_submission_deadline_trg
BEFORE INSERT ON Submission
FOR EACH ROW EXECUTE FUNCTION set_submission_deadline();

-- Aggregate beta feedback for a manuscript.
CREATE OR REPLACE FUNCTION GetBetaAverages(ms_id BIGINT)
RETURNS TABLE (
    responses BIGINT,
    avg_story NUMERIC,
    avg_characters NUMERIC,
    avg_pacing NUMERIC,
    avg_ending NUMERIC,
    avg_prose NUMERIC,
    recommend_pct NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT COUNT(*)::BIGINT,
           ROUND(AVG(story), 1),
           ROUND(AVG(characters), 1),
           ROUND(AVG(pacing), 1),
           ROUND(AVG(ending), 1),
           ROUND(AVG(prose), 1),
           ROUND(100.0 * COUNT(*) FILTER (WHERE would_recommend) / NULLIF(COUNT(*), 0), 0)
      FROM Beta_Feedback WHERE manuscript_id = ms_id;
END;
$$ LANGUAGE plpgsql;

-- Sales rollup used by the analytics dashboard.
CREATE OR REPLACE FUNCTION GetAuthorSales(a_id BIGINT)
RETURNS TABLE (
    book_title VARCHAR,
    copies_sold BIGINT,
    gross DECIMAL,
    author_share DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT b.book_title,
           COUNT(bs.sale_id)::BIGINT,
           COALESCE(SUM(bs.unit_price), 0)::DECIMAL,
           COALESCE(SUM(bs.unit_price) * COALESCE(MAX(p.author_gets), 0) / 100.0, 0)::DECIMAL
      FROM Book b
      LEFT JOIN Book_sales bs ON bs.book_id = b.book_id
      LEFT JOIN Payment p     ON p.book_id  = b.book_id
     WHERE b.author_id = a_id
     GROUP BY b.book_title;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- 12. Seed data so every new screen has something to show
-- ---------------------------------------------------------------------------
INSERT INTO Publisher_Profile (publisher_id, accepted_genres, languages, audiences, min_words, max_words, country, response_days, submission_guidelines)
SELECT p.publisher_id,
       ARRAY['Fiction','Thriller','Romance','Poetry','History'],
       ARRAY['bn','en'],
       ARRAY['adult','ya'],
       15000, 200000, 'Bangladesh', 30,
       'Send the first three chapters, a one-page synopsis and an author bio.'
  FROM Publisher p
 WHERE NOT EXISTS (SELECT 1 FROM Publisher_Profile pp WHERE pp.publisher_id = p.publisher_id);

INSERT INTO Service_Pro (name, role, languages, genres, rate, bio, rating, jobs_done, email)
SELECT * FROM (VALUES
    ('Nusrat Jahan',  'editor',          ARRAY['bn','en'], ARRAY['Fiction','Literary'], 900.00,  'Developmental editor for Bangla literary fiction.', 4.8, 42, 'nusrat@example.com'),
    ('Rafiqul Islam', 'proofreader',     ARRAY['bn'],      ARRAY['Fiction','History'],  450.00,  'Bangla proofreading, Bangla Academy style guide.',  4.6, 88, 'rafiq@example.com'),
    ('Tanvir Ahmed',  'cover_designer',  ARRAY['bn','en'], ARRAY['Thriller','Sci-Fi'],  6000.00, 'Cover designer, Bangla typography specialist.',     4.9, 61, 'tanvir@example.com'),
    ('Shreya Das',    'translator',      ARRAY['bn','en'], ARRAY['Fiction','Poetry'],   1500.00, 'Bangla to English literary translation.',           4.7, 23, 'shreya@example.com'),
    ('Imran Kabir',   'marketer',        ARRAY['bn','en'], ARRAY['Non-fiction'],        5000.00, 'Book launch campaigns for Bangladeshi authors.',    4.4, 30, 'imran@example.com')
) AS s(name, role, languages, genres, rate, bio, rating, jobs_done, email)
WHERE NOT EXISTS (SELECT 1 FROM Service_Pro);

COMMIT;
