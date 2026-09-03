<div align="center">



### From manuscript to published book

*A Bangla-first publishing platform built to support writers at every stage of the publishing process.*

</div>

---

## What is Mudron?

Finishing a manuscript is only the beginning. A writer still has to edit the work, design a cover, format the book, find a suitable publisher, prepare submission documents, promote the book, and manage sales. These steps are often scattered across different tools, and most of those tools offer limited support for Bangla.

**Mudron brings the entire process into one platform, with Bangla treated as a first-class language.**

A writer can upload a manuscript and use Mudron to:

* Review the manuscript and identify potential issues
* Measure how ready it is for publication
* Generate properly formatted EPUB and PDF files
* Prepare blurbs, keywords, and submission documents
* Find suitable publishers or literary agents
* Track submissions
* Publish and sell the finished book

The platform supports four types of users, each with a separate dashboard and set of responsibilities:

| Role             | What they can do                                                                          |
| :--------------- | :---------------------------------------------------------------------------------------- |
| ✍️ **Author**    | Write and review manuscripts, format books, find publishers, submit work, and track sales |
| 🏢 **Publisher** | Review submissions, accept or reject requests, and assign books to editors                |
| 📝 **Editor**    | Edit assigned books and manage progress and deadlines                                     |
| 📖 **Reader**    | Read books through a subscription and leave ratings and reviews                           |

---

## ✨ Features

The **Writer’s Studio** includes the following tools:

* 🧠 **Manuscript Doctor** — Reviews the manuscript chapter by chapter and flags possible plot holes, pacing problems, repetition, character inconsistencies, weak dialogue, and spelling issues. It also provides a **Health Score out of 100**. The tool does not rewrite the author’s work; it simply points out areas that may need attention.

* 📊 **Publishing Readiness Score** — Measures readiness across five areas: manuscript quality, editing, formatting, cover design, and metadata. It also shows what still needs to be completed.

* 🎯 **Publisher and Agent Matcher** — Suggests publishers based on genre, language, target audience, and word count. Each match includes an explanation of the score.

* 📦 **Submission Package Generator** — Creates a query letter, synopsis, pitch, author biography, and book proposal.

* 📚 **One-click Formatter** — Converts DOCX and TXT manuscripts into **EPUB 3, standard PDF, and print-ready PDF**, with embedded Bangla fonts.

* 🔎 **Metadata and Discoverability Tools** — Helps prepare the book description, keywords, and categories, and provides a Discoverability Score.

* 🛡️ **Copyright and AI Provenance** — Checks for possible text matches, quotations, and signs of AI-assisted writing. It presents these results carefully instead of treating them as definitive proof.

* 👥 **Beta Reader and Professional Marketplace** — Connects authors with beta readers and publishing professionals.

* 🔗 **Universal Book Link** — Creates one shareable page for a published book.

* 📈 **Sales Analytics** — Helps authors monitor book sales and performance.

### Built for Bangla

Mudron can detect mixed formal and conversational Bangla, check spelling and punctuation, estimate Bangla readability, support Bangla numerals, and produce EPUB and PDF files with proper Bangla typography.

> 💡 **AI is optional.** Mudron works without an API key by using its built-in offline heuristic engine. Adding an `ANTHROPIC_API_KEY` enables more detailed manuscript reviews, metadata suggestions, and submission documents.

---

## 🚀 Getting Started

### Prerequisites

You will need:

* **Node.js 18 or newer** — the project was developed using Node.js 24
* **PostgreSQL 14 or newer**

### Step 1 — Clone the project and install dependencies

```bash
git clone https://github.com/Othiya/ProjectMudron.git
cd ProjectMudron
npm install
```

### Step 2 — Create the environment file

Copy `.env.example` and rename the copy to `.env`:

```bash
cp .env.example .env
```

Open `.env` and add your PostgreSQL configuration:

```env
PGUSER=postgres
PGHOST=localhost
PGDATABASE=Maindb
PGPASSWORD=your_postgres_password
PGPORT=5432

SESSION_SECRET=any-long-random-string
PORT=3000
BASE_URL=http://localhost:3000

# Optional — the offline heuristic engine works without this
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-opus-5
```

### Step 3 — Create and prepare the database

First, create the database:

```bash
psql -U postgres -c "CREATE DATABASE \"Maindb\";"
```

Then run the three SQL files in order:

```bash
psql -U postgres -d Maindb -f db/001_base.sql
psql -U postgres -d Maindb -f db/002_mudron2.sql
psql -U postgres -d Maindb -f db/003_demo_data.sql
```

The files contain:

1. The base database schema
2. Tables and logic for the newer Mudron features
3. Demo accounts and sample data

If PostgreSQL is running on a different port, add the port to each command. For example:

```bash
psql -U postgres -p 5433 -d Maindb -f db/001_base.sql
```

All three SQL files are idempotent, so they can be run more than once without damaging the database.

### Step 4 — Start the application

```bash
node app.js
```

Then open:

**http://localhost:3000**

---

## 🔑 Demo Accounts

Running `003_demo_data.sql` creates the following accounts.

**Password for every demo account:** `1234`

| Role         | Login page         | Email                  |
| :----------- | :----------------- | :--------------------- |
| ✍️ Author    | `/author/login`    | `demo@mudron.test`     |
| 🏢 Publisher | `/publisher/login` | `batighar@mudron.test` |
| 📝 Editor    | `/editor/login`    | `editor@mudron.test`   |
| 📖 Reader    | `/login_reader`    | `reader@mudron.test`   |

### What each demo account contains

* **Author:** Three books are available in the Writer’s Studio. “বৃষ্টির শহর” already includes a manuscript analysis, publisher matches, beta-reader feedback, submission records, and a universal book link. Sales analytics are also available for two published books.

* **Publisher:** Includes pending publication requests, approval and rejection controls, and a list of top authors.

* **Editor:** Includes an assigned book, “বৃষ্টির শহর,” marked as **In Progress** with a deadline.

* **Reader:** Includes four online books, a 90-day subscription, and sample ratings and reviews.

You can also create a new account from any registration option on the homepage.

---

## 🧩 Tech Stack

| Layer           | Technology                                                                    |
| :-------------- | :---------------------------------------------------------------------------- |
| Backend         | Node.js and Express                                                           |
| Database        | PostgreSQL with functions, procedures, and triggers                           |
| Views           | EJS and a custom CSS design system in `public/css/mudron.css`                 |
| Book formatting | `pdfkit` for PDF, `archiver` for EPUB 3, and `mammoth` for reading DOCX files |
| Security        | `bcryptjs` password hashing, session guards, and ownership checks             |
| Optional AI     | `@anthropic-ai/sdk` with Claude `claude-opus-5`                               |

---

## 📂 Project Structure

```text
ProjectMudron/
├── app.js                  # Main Express application and legacy routes
├── config/db.js            # PostgreSQL connection pool using .env
├── middleware/auth.js      # Password hashing and session guards
├── routes/
│   ├── studio.js           # Manuscripts, Doctor, formatting, integrity, and beta readers
│   ├── submissions.js      # Publisher matching, packages, and submission tracking
│   └── community.js        # Marketplace, book links, analytics, and beta forms
├── services/               # Nine service engines, including Doctor, Matcher, and Formatter
├── views/                  # EJS pages for the studio, beta, marketplace, and book links
├── public/                 # CSS, Bangla fonts, and images
└── db/
    ├── 001_base.sql        # Base schema, tables, functions, and triggers
    ├── 002_mudron2.sql     # Tables and logic for the newer Mudron features
    └── 003_demo_data.sql   # Demo accounts and sample data
```

For a detailed breakdown of the newer features, see [`MUDRON2.md`](MUDRON2.md).

---

<div align="center">

**Mudron — because every manuscript deserves a chance to find its readers. 📚**

</div>
