-- ============================================================================
-- Mudron base schema (reconstructed from Final Tables.txt + all qeuries.txt,
-- with tables in dependency order and the interspersed test CALL/SELECT/DROP
-- lines removed so the whole thing loads in one pass).
--   psql -U postgres -p 5433 -d Maindb -f db/001_base.sql
-- ============================================================================

-- ---- core people ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS Reader (
    reader_id  BIGSERIAL PRIMARY KEY,
    reader_name VARCHAR(50) NOT NULL,
    email      VARCHAR(100) NOT NULL,
    contact_no VARCHAR(15),
    password   VARCHAR(50) NOT NULL
);

CREATE TABLE IF NOT EXISTS Author (
    id BIGSERIAL NOT NULL PRIMARY KEY,
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    gender VARCHAR(50),
    email VARCHAR(50),
    contact_no VARCHAR(50),
    interested_genre VARCHAR(50),
    password VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS Publisher (
    publisher_id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(50),
    contact_no VARCHAR(50),
    password VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS Editor (
    editor_id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    contact_no VARCHAR(20),
    password VARCHAR(50) NOT NULL
);

-- ---- books ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS Book (
    book_id BIGSERIAL NOT NULL PRIMARY KEY,
    author_id BIGINT REFERENCES Author(id),
    book_title VARCHAR(37),
    price INT,
    type VARCHAR(7),
    date_of_publish DATE
);

CREATE TABLE IF NOT EXISTS Payment (
    book_id BIGINT REFERENCES Book(book_id),
    book_price DECIMAL(10, 2),
    publisher_id BIGINT REFERENCES Publisher(publisher_id),
    author_id BIGINT REFERENCES Author(id),
    editor_id BIGINT REFERENCES Editor(editor_id),
    author_gets DECIMAL(10, 2),
    editor_gets DECIMAL(10, 2),
    publisher_gets DECIMAL(10, 2),
    publication_date DATE
);

CREATE TABLE IF NOT EXISTS Review (
    review_id BIGSERIAL PRIMARY KEY,
    book_id BIGINT REFERENCES Book(book_id),
    rating INTEGER DEFAULT 0,
    review VARCHAR(250)
);

CREATE TABLE IF NOT EXISTS Reader_interaction (
    interaction_id BIGINT PRIMARY KEY,
    book_id BIGINT REFERENCES Book(book_id),
    reader_id BIGINT REFERENCES Reader(reader_id),
    action_type VARCHAR(50),
    timestamp TIMESTAMP
);

-- ---- publish workflow -----------------------------------------------------
CREATE TABLE IF NOT EXISTS Publish_Request (
    request_id BIGSERIAL PRIMARY KEY,
    author_id BIGINT REFERENCES Author(id),
    publisher_id BIGINT REFERENCES Publisher(publisher_id)
);

CREATE TABLE IF NOT EXISTS Publish_Requested_books (
    request_id BIGINT PRIMARY KEY REFERENCES Publish_Request(request_id),
    book_name VARCHAR(255),
    genre VARCHAR(50),
    pdf_link VARCHAR(255),
    request_date DATE DEFAULT CURRENT_DATE,
    status VARCHAR(20) DEFAULT 'Pending'
);

CREATE TABLE IF NOT EXISTS Approved_books (
    approve_id BIGSERIAL PRIMARY KEY,
    publisher_id INT REFERENCES Publisher(publisher_id),
    request_id BIGINT REFERENCES Publish_Request(request_id),
    approval_date DATE DEFAULT CURRENT_DATE
);

CREATE TABLE IF NOT EXISTS Rejected_books (
    rejection_id BIGSERIAL PRIMARY KEY,
    publisher_id INT REFERENCES Publisher(publisher_id),
    request_id BIGINT REFERENCES Publish_Request(request_id),
    rejection_reason VARCHAR(200)
);

CREATE TABLE IF NOT EXISTS Editor_Books (
    editor_id BIGINT REFERENCES Editor(editor_id),
    approve_id BIGINT REFERENCES Approved_books(approve_id),
    request_id BIGINT REFERENCES Publish_Requested_books(request_id),
    editing_status VARCHAR(20) DEFAULT 'Not Started',
    edit_start_date DATE,
    edit_deadline DATE,
    PRIMARY KEY (editor_id, approve_id, request_id)
);

-- ---- distribution ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS BookStore (
    Store_id INT PRIMARY KEY,
    Publisher_id INT REFERENCES Publisher(publisher_id),
    Name VARCHAR(255) NOT NULL,
    Copies_got INTEGER,
    Email VARCHAR(255),
    Contact_no VARCHAR(20)
);

CREATE TABLE IF NOT EXISTS BookStore_Inventory (
    Store_id INT REFERENCES BookStore(Store_id),
    book_id BIGINT REFERENCES Book(book_id),
    Copies_in_stock INTEGER,
    PRIMARY KEY (Store_id, book_id)
);

-- ---- online subscription side ---------------------------------------------
CREATE TABLE IF NOT EXISTS online_author (
    author_code BIGSERIAL PRIMARY KEY,
    author_name VARCHAR(255),
    email VARCHAR(255),
    contact_no VARCHAR(20),
    username VARCHAR(50) UNIQUE,
    password_hash VARCHAR(255),
    session_token VARCHAR(255) UNIQUE
);

CREATE TABLE IF NOT EXISTS online_book (
    book_id SERIAL PRIMARY KEY,
    author_code INT REFERENCES online_author(author_code),
    book_title VARCHAR(255) NOT NULL,
    genre VARCHAR(100),
    pdf_url VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS online_reader (
    user_id SERIAL PRIMARY KEY,
    user_name VARCHAR(255),
    email VARCHAR(255),
    contact_no VARCHAR(20),
    password VARCHAR(255),
    subscription_end_date TIMESTAMP
);

CREATE TABLE IF NOT EXISTS online_subscription (
    subscription_id SERIAL PRIMARY KEY,
    user_id INT REFERENCES online_reader(user_id),
    payment DECIMAL,
    payment_method VARCHAR(50)
);

-- ---- functions & procedures the app calls ---------------------------------
CREATE OR REPLACE FUNCTION GetTotalSubmissions() RETURNS INT AS $$
DECLARE total_submissions INT;
BEGIN
    SELECT COUNT(*) INTO total_submissions FROM Publish_Requested_books;
    RETURN total_submissions;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION GetApprovalRate(publisher_id BIGINT) RETURNS FLOAT AS $$
DECLARE total_submissions INT; approved_count INT; approval_rate FLOAT;
BEGIN
    SELECT COUNT(*) INTO total_submissions FROM Publish_Request WHERE Publish_Request.publisher_id = GetApprovalRate.publisher_id;
    SELECT COUNT(*) INTO approved_count FROM Approved_books WHERE Approved_books.publisher_id = GetApprovalRate.publisher_id;
    IF total_submissions = 0 THEN approval_rate := 0;
    ELSE approval_rate := (approved_count * 100.0) / total_submissions; END IF;
    RETURN approval_rate;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION GetTopGenres(top_genre_count INT)
RETURNS TABLE (genre_name VARCHAR, submission_count BIGINT) AS $$
BEGIN
    RETURN QUERY
    SELECT genre, COUNT(*) AS submission_count
    FROM Publish_Requested_books
    GROUP BY genre ORDER BY submission_count DESC
    LIMIT top_genre_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE PROCEDURE FinancialStatistics(
    OUT total_revenue DECIMAL(10, 2),
    OUT total_cost DECIMAL(10, 2),
    OUT profit_margin DECIMAL(10, 2)
) LANGUAGE plpgsql AS $$
BEGIN
    SELECT SUM(book_price) INTO total_revenue FROM Payment;
    SELECT SUM(author_gets) + SUM(editor_gets) + SUM(publisher_gets) INTO total_cost FROM Payment;
    IF total_revenue IS NULL OR total_revenue = 0 THEN
        profit_margin := 0;
    ELSE
        profit_margin := (total_revenue - COALESCE(total_cost, 0)) / total_revenue * 100;
    END IF;
END;
$$;

CREATE OR REPLACE PROCEDURE DeletePublishRequest(p_book_name IN VARCHAR) AS $$
DECLARE v_request_id BIGINT;
BEGIN
    SELECT request_id INTO v_request_id FROM Publish_Requested_books WHERE book_name = p_book_name;
    DELETE FROM Publish_Requested_books WHERE request_id = v_request_id;
    DELETE FROM Publish_Request WHERE request_id = v_request_id;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error: Failed to delete publish requests and associated records.';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE PROCEDURE Send_Publish_Request_To_All_Publishers(
    IN author_id_in BIGINT, IN book_name_in VARCHAR(255),
    IN genre_in VARCHAR(50), IN pdf_link_in VARCHAR(255)
) AS $$
DECLARE
    publisher_record Publisher%ROWTYPE;
    request_id_out BIGINT;
    loop_counter INT := 0;
    max_loops INT := 50;
BEGIN
    FOR publisher_record IN SELECT * FROM Publisher LOOP
        EXIT WHEN loop_counter >= max_loops;
        SELECT nextval('publish_request_request_id_seq') INTO request_id_out;
        INSERT INTO Publish_Request (request_id, author_id, publisher_id)
        VALUES (request_id_out, author_id_in, publisher_record.publisher_id);
        INSERT INTO Publish_Requested_books (request_id, book_name, genre, pdf_link)
        VALUES (request_id_out, book_name_in, genre_in, pdf_link_in);
        loop_counter := loop_counter + 1;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE PROCEDURE SendEditRequest(
    p_request_id Editor_Books.request_id%TYPE,
    p_approve_id Editor_Books.approve_id%TYPE
) LANGUAGE plpgsql AS $$
DECLARE
    editor_rec RECORD;
    editor_cursor CURSOR FOR SELECT editor_id FROM Editor;
BEGIN
    OPEN editor_cursor;
    LOOP
        FETCH NEXT FROM editor_cursor INTO editor_rec;
        EXIT WHEN NOT FOUND;
        INSERT INTO Editor_Books (editor_id, approve_id, request_id, editing_status, edit_start_date, edit_deadline)
        VALUES (editor_rec.editor_id, p_approve_id, p_request_id, 'Not Started', NULL, NULL);
    END LOOP;
    CLOSE editor_cursor;
END;
$$;

-- ---- integrity triggers ---------------------------------------------------
-- NOTE: the original duplicate-email/password triggers also rejected two users
-- sharing a password (bad design, and moot now that passwords are hashed).
-- Kept faithful but limited to the email check, which is the real constraint.
CREATE OR REPLACE FUNCTION prevent_duplicate_author() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.email IS NOT NULL AND EXISTS (SELECT 1 FROM Author WHERE email = NEW.email) THEN
        RAISE EXCEPTION 'Author with the same email already exists';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER prevent_duplicate_author_trigger
BEFORE INSERT ON Author FOR EACH ROW EXECUTE FUNCTION prevent_duplicate_author();

CREATE OR REPLACE FUNCTION prevent_duplicate_publisher() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.email IS NOT NULL AND EXISTS (SELECT 1 FROM Publisher WHERE email = NEW.email) THEN
        RAISE EXCEPTION 'Publisher with the same email already exists';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER prevent_duplicate_publisher_trigger
BEFORE INSERT ON Publisher FOR EACH ROW EXECUTE FUNCTION prevent_duplicate_publisher();

CREATE OR REPLACE FUNCTION delete_associated_records() RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM Payment WHERE book_id = OLD.book_id;
    DELETE FROM Review  WHERE book_id = OLD.book_id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS delete_associated_records_trigger ON Book;
CREATE TRIGGER delete_associated_records_trigger
BEFORE DELETE ON Book FOR EACH ROW EXECUTE FUNCTION delete_associated_records();

CREATE OR REPLACE FUNCTION calculate_edit_deadline() RETURNS TRIGGER AS $$
DECLARE approval_date DATE;
BEGIN
    SELECT Approved_books.approval_date INTO approval_date
    FROM Approved_books WHERE approve_id = NEW.approve_id;
    NEW.edit_deadline := approval_date + INTERVAL '15 DAY';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS calculate_edit_deadline_trigger ON Editor_Books;
CREATE TRIGGER calculate_edit_deadline_trigger
BEFORE INSERT ON Editor_Books FOR EACH ROW EXECUTE FUNCTION calculate_edit_deadline();
