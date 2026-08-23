<div align="center">

# 📖 মুদ্রণ · Mudron

### পাণ্ডুলিপি থেকে প্রকাশিত বই পর্যন্ত — লেখকের সহযাত্রী

*A Bangla-first book publishing platform that walks a writer all the way from a rough manuscript to a published, discoverable book.*

</div>

---

## এটা আসলে কী? · What is this?

একজন লেখক একটা পাণ্ডুলিপি লেখেন — তারপর? সম্পাদনা, প্রচ্ছদ, প্রকাশক খোঁজা, সাবমিশন, ফরম্যাটিং, বিপণন — প্রতিটা ধাপ আলাদা, বিভ্রান্তিকর, আর বেশিরভাগ টুল বাংলাকে দ্বিতীয় শ্রেণির নাগরিক ভাবে।

**মুদ্রণ** সেই পুরো যাত্রাটাকে এক জায়গায় নিয়ে আসে — এবং বাংলাকে প্রথম শ্রেণির নাগরিক হিসেবে ধরে।

> Think of it as a *publishing copilot*: the writer uploads a manuscript, and Mudron helps diagnose it, score its readiness, format it into a real EPUB/PDF, write its blurb and keywords, find the right publisher, generate the whole submission package, track every submission, and finally sell it — with everything working in **Bangla**, offline, out of the box.

মুদ্রণে চারটি ভূমিকা, প্রত্যেকের নিজস্ব রঙ, ড্যাশবোর্ড ও দায়িত্ব:

| ভূমিকা | কাজ |
|:--|:--|
| ✍️ **লেখক** · Author | পাণ্ডুলিপি লেখা → ডক্টর → ফরম্যাট → প্রকাশক মিল → সাবমিশন → বিক্রয় |
| 🏢 **প্রকাশক** · Publisher | অনুরোধ পর্যালোচনা → অনুমোদন/প্রত্যাখ্যান → সম্পাদকের কাছে পাঠানো |
| 📝 **সম্পাদক** · Editor | বরাদ্দকৃত বই সম্পাদনা → অবস্থা ও ডেডলাইন |
| 📖 **পাঠক** · Reader | সাবস্ক্রিপশনে বই পড়া → রেটিং ও রিভিউ |

---

## ✨ যা যা পারে · Features

লেখকের **রাইটার্স স্টুডিও**তে আছে:

- 🧠 **AI Manuscript Doctor** — অধ্যায় ধরে ধরে plot hole, গতি, পুনরাবৃত্তি, চরিত্রের অসঙ্গতি, দুর্বল সংলাপ ও বানান ধরে **Health Score /১০০** দেয়। *(আপনার লেখা কখনো নতুন করে লিখে দেয় না — শুধু দেখায় কোথায় সমস্যা।)*
- 📊 **Publishing Readiness Score** — পাণ্ডুলিপি → সম্পাদনা → ফরম্যাট → প্রচ্ছদ → Metadata, পাঁচ স্তম্ভে স্কোর আর "কী কী বাকি" তালিকা।
- 🎯 **Publisher / Agent Matcher** — ধরন, ভাষা, পাঠক, শব্দসংখ্যা মিলিয়ে উপযুক্ত প্রকাশক, প্রতিটি স্কোরের ব্যাখ্যা সহ।
- 📦 **Submission Package Generator** — এক ক্লিকে query letter, synopsis, pitch, bio, proposal।
- 📚 **One-click Formatter** — DOCX/TXT → **EPUB 3 + PDF + ছাপার PDF**, বাংলা ফন্ট এমবেড করা।
- 🔎 **Metadata / Discoverability** — blurb, keyword, category + Discoverability Score।
- 🛡️ **Copyright + AI Provenance** — মিল, উদ্ধৃতি, AI-সংকেত (সৎ framing সহ), উৎসের timeline।
- 👥 **বিটা রিডার + পেশাজীবী মার্কেটপ্লেস** · 🔗 **Universal Book Link** · 📈 **বিক্রয় বিশ্লেষণ**।

🇧🇩 **Bangla-first, everywhere** — সাধু-চলিত মিশ্রণ শনাক্ত করা, বাংলা বানান ও দাঁড়ি যাচাই, বাংলা readability, বাংলা সংখ্যা, বাংলা টাইপোগ্রাফিতে EPUB/PDF।

> 💡 **AI অপশনাল।** কোনো API key ছাড়াই সব ফিচার চলে — একটি offline heuristic ইঞ্জিন বাংলা বুঝে কাজ করে। `ANTHROPIC_API_KEY` দিলে ডক্টর, metadata ও submission package আরও গভীর হয়।

---

## 🚀 চালু করা · Getting Started

### যা লাগবে · Prerequisites

- **Node.js** 18+ (তৈরি হয়েছে v24-এ)
- **PostgreSQL** 14+ (লোকাল মেশিনে)

### ধাপ ১ — কোড ও প্যাকেজ

```bash
git clone https://github.com/Othiya/ProjectMudron.git
cd ProjectMudron
npm install
```

### ধাপ ২ — পরিবেশ ফাইল (`.env`)

`.env.example` কপি করে `.env` বানান, আর আপনার PostgreSQL তথ্য বসান:

```bash
cp .env.example .env
```

```env
PGUSER=postgres
PGHOST=localhost
PGDATABASE=Maindb
PGPASSWORD=your_postgres_password
PGPORT=5432

SESSION_SECRET=any-long-random-string
PORT=3000
BASE_URL=http://localhost:3000

# ঐচ্ছিক — না দিলে offline heuristic ইঞ্জিন চলবে
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-opus-5
```

### ধাপ ৩ — ডেটাবেস তৈরি + ডেমো ডেটা

```bash
# একবার ডেটাবেস বানান
psql -U postgres -c "CREATE DATABASE \"Maindb\";"

# তিনটি ফাইল ক্রমানুসারে চালান (স্কিমা → নতুন ফিচার → ডেমো ডেটা)
psql -U postgres -d Maindb -f db/001_base.sql
psql -U postgres -d Maindb -f db/002_mudron2.sql
psql -U postgres -d Maindb -f db/003_demo_data.sql
```

> `-p 5433` বা অন্য পোর্ট হলে প্রতিটি কমান্ডে `-p <port>` যোগ করুন।
> তিনটি ফাইলই বারবার চালানো নিরাপদ (idempotent) — কিছু নষ্ট হবে না।

### ধাপ ৪ — চালু করুন 🎉

```bash
node app.js
```

ব্রাউজারে খুলুন 👉 **http://localhost:3000**

---

## 🔑 ডেমো লগইন · Try it out

`003_demo_data.sql` চালালে নিচের অ্যাকাউন্টগুলো তৈরি হয় — **সব পাসওয়ার্ড `1234`**:

| ভূমিকা | লগইন পেজ | ইমেইল |
|:--|:--|:--|
| ✍️ লেখক | `/author/login` | `demo@mudron.test` |
| 🏢 প্রকাশক | `/publisher/login` | `batighar@mudron.test` |
| 📝 সম্পাদক | `/editor/login` | `editor@mudron.test` |
| 📖 পাঠক | `/login_reader` | `reader@mudron.test` |

### প্রতি ভূমিকায় কী দেখবেন

- **লেখক** → স্টুডিওতে ৩টি বই ("বৃষ্টির শহর" ইতিমধ্যে বিশ্লেষণ করা, প্রকাশক মিল, বিটা ফিডব্যাক, সাবমিশন ও বুক লিংক সহ), ২টি প্রকাশিত বইয়ের বিক্রয় বিশ্লেষণ।
- **প্রকাশক** → অপেক্ষমাণ প্রকাশ-অনুরোধ, অনুমোদন/প্রত্যাখ্যান, শীর্ষ লেখক।
- **সম্পাদক** → বরাদ্দকৃত বই "বৃষ্টির শহর" (In Progress, ডেডলাইন সহ)।
- **পাঠক** → ৪টি অনলাইন বই, ৯০ দিনের সাবস্ক্রিপশন, রিভিউ-রেটিং।

> চাইলে হোমপেজের যেকোনো কার্ড থেকে **নিবন্ধন** করে নিজের অ্যাকাউন্টও বানাতে পারেন।

---

## 🧩 প্রযুক্তি · Tech Stack

| স্তর | ব্যবহার |
|:--|:--|
| Backend | Node.js · Express |
| Database | PostgreSQL (functions, procedures, triggers) |
| Views | EJS + একটি কাস্টম CSS ডিজাইন সিস্টেম (`public/css/mudron.css`) |
| ফরম্যাটিং | `pdfkit` (PDF) · `archiver` (EPUB 3) · `mammoth` (DOCX পড়া) |
| নিরাপত্তা | `bcryptjs` পাসওয়ার্ড হ্যাশিং · session guard · ownership check |
| AI (ঐচ্ছিক) | `@anthropic-ai/sdk` — Claude `claude-opus-5` |

---

## 📂 প্রজেক্ট কাঠামো · Structure

```
ProjectMudron/
├── app.js                  # মূল Express অ্যাপ ও পুরনো রুট
├── config/db.js            # PostgreSQL পুল (.env থেকে)
├── middleware/auth.js      # পাসওয়ার্ড হ্যাশিং + session guard
├── routes/
│   ├── studio.js           # পাণ্ডুলিপি, ডক্টর, ফরম্যাট, ইন্টিগ্রিটি, বিটা
│   ├── submissions.js      # প্রকাশক মিল, প্যাকেজ, ট্র্যাকার
│   └── community.js        # মার্কেটপ্লেস, বুক লিংক, বিশ্লেষণ, বিটা ফর্ম
├── services/               # ৯টি ইঞ্জিন (doctor, matcher, formatter, ...)
├── views/                  # EJS পেজ (studio/, beta/, marketplace/, ubl/)
├── public/                 # CSS, বাংলা ফন্ট, ছবি
└── db/
    ├── 001_base.sql        # মূল স্কিমা (টেবিল, ফাংশন, ট্রিগার)
    ├── 002_mudron2.sql     # মুদ্রণ ২.০ নতুন টেবিল ও লজিক
    └── 003_demo_data.sql   # সম্পূর্ণ ডেমো ডেটা
```

আরও বিস্তারিত: [`MUDRON2.md`](MUDRON2.md) — মুদ্রণ ২.০-তে ঠিক কী কী যোগ হয়েছে।

---

<div align="center">

**মুদ্রণ** — প্রতিটি পাণ্ডুলিপির একটি পাঠক প্রাপ্য। 📚

</div>
