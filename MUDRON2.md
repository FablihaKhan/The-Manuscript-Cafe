# মুদ্রণ ২.০ — নতুন যা যোগ হলো

ProjectMudron এখন শুধু publish-request ব্যবস্থাপনা নয় — পাণ্ডুলিপি থেকে প্রকাশিত বই পর্যন্ত
লেখকের একটি সম্পূর্ণ **publishing copilot**। নিচের আটটি feature-ই তৈরি ও পরীক্ষিত।

## নতুন লেখক-যাত্রা (Writer's Studio)

```
আপলোড → ডক্টর → বিটা রিডার → প্রস্তুতি স্কোর → ফরম্যাট
      → প্রচ্ছদ ও Metadata → প্রকাশক মিল → ট্র্যাকার → বুক লিংক → বিক্রয় বিশ্লেষণ
```

| # | Feature | ঠিকানা | কী করে |
|---|---------|--------|--------|
| ১ | **AI Manuscript Doctor** | `/studio/:id/doctor` | অধ্যায় ধরে ধরে plot hole, গতি, পুনরাবৃত্তি, চরিত্রের অসঙ্গতি, দুর্বল সংলাপ, স্পষ্টতা, বানান — সব ধরে **Health Score /১০০** দেয়। লেখা কখনো নতুন করে লিখে দেয় না। |
| ২ | **Publishing Readiness Score** | `/studio/:id` | পাণ্ডুলিপি → সম্পাদনা → ফরম্যাটিং → প্রচ্ছদ → Metadata — পাঁচ স্তম্ভে স্কোর ও "কী কী ঠিক করতে হবে" তালিকা (প্রতিটি clickable)। |
| ৩ | **Smart Publisher/Agent Matcher** | `/studio/:id/matches` | ধরন, ভাষা, পাঠক, শব্দসংখ্যা, দেশ, অনুমোদনের হার — ছয় অক্ষে স্কোর ও **প্রতিটি স্কোরের ব্যাখ্যা**। |
| ৪ | **Submission Package Generator** | `/studio/:id/package` | এক ক্লিকে query letter, synopsis, pitch, bio, proposal, comp titles, নমুনা অধ্যায়। বানানো তথ্য কখনো ঢোকায় না। |
| ৫ | **Submission Tracker** | `/studio/:id/submissions` | পাঠানো → দেখা → পাণ্ডুলিপি চাওয়া → প্রস্তাব → গৃহীত/প্রত্যাখ্যাত; deadline ও follow-up alert সহ (DB trigger দিয়ে স্বয়ংক্রিয় ইতিহাস)। |
| ৬ | **One-click Formatter** | `/studio/:id/format` | DOCX/TXT/MD → **EPUB 3 + PDF (A5) + ছাপার PDF (৬×৯")** — শিরোনাম পাতা, কপিরাইট, সূচিপত্র, পৃষ্ঠা নম্বর, বাংলা ফন্ট এমবেড করা। নিখুঁত বাংলার জন্য browser-print পাতা। |
| ৭ | **Metadata / Discoverability** | `/studio/:id/metadata` | title, subtitle, blurb, keyword, category, comp titles + **Discoverability Score**। |
| ৮ | **Copyright + AI Provenance** | `/studio/:id/integrity` | অন্য পাণ্ডুলিপির সঙ্গে মিল, দায়স্বীকারহীন উদ্ধৃতি, AI-সদৃশতার সংকেত (সৎ framing সহ), এবং উৎসের timeline। |

### বাড়তি

- **বিটা রিডার + ফিডব্যাক** — `/studio/:id/beta` থেকে token-লিংক পাঠান; পাঠক লগইন ছাড়াই গল্প/চরিত্র/গতি/সমাপ্তি/গদ্য রেট করে।
- **পেশাজীবী মার্কেটপ্লেস** — `/marketplace` — সম্পাদক, প্রুফরিডার, প্রচ্ছদশিল্পী, অনুবাদক, বিপণনকারী।
- **Universal Book Link** — `/studio/:id/link` → `/b/:slug` — এক লিংক থেকে সব দোকান + ক্লিক analytics।
- **বিক্রয় ও পাঠক বিশ্লেষণ** — `/studio/analytics`।
- **🇧🇩 Bangla-first** — সাধু/চলিত মিশ্রণ, বাংলা বানান, দাঁড়ি যাচাই, বাংলা readability, বাংলা সংখ্যা, বাংলা EPUB/PDF।

## নিরাপত্তা সংশোধন

- পাসওয়ার্ড এখন **bcrypt** দিয়ে hash করা; পুরনো plaintext অ্যাকাউন্ট প্রথম লগইনেই hash-এ upgrade হয় ও plaintext মুছে যায়।
- DB credential আর hardcoded নয় — `.env` থেকে আসে।
- সব studio route-এ auth + ownership guard।
- `Final Tables.txt`-এ leak হওয়া পাসওয়ার্ড দুটি সরানো হয়েছে।

## চালু করা

```bash
npm install
cp .env.example .env        # DB পাসওয়ার্ড ও (ঐচ্ছিক) ANTHROPIC_API_KEY বসান
psql -U postgres -d Maindb -f db/002_mudron2.sql
node app.js                 # http://localhost:3000  → /studio
```

**AI ছাড়াই সব কাজ করে** — heuristic ইঞ্জিন offline চলে, বাংলা সমর্থিত। `ANTHROPIC_API_KEY`
থাকলে ডক্টর, metadata ও submission package আরও গভীর হয় (Claude, model `claude-opus-5`)।

## প্রযুক্তি

- নতুন dependency: `multer` (আপলোড), `mammoth` (DOCX পড়া), `pdfkit` (PDF), `archiver` (EPUB),
  `bcryptjs`, `dotenv`, `@anthropic-ai/sdk` (ঐচ্ছিক)।
- নতুন কোড: `services/` (৯টি ইঞ্জিন), `routes/` (৩টি রাউটার), `middleware/auth.js`,
  `config/db.js`, `db/002_mudron2.sql`, `views/studio|beta|marketplace|ubl/`।
- পুরনো কোনো feature ভাঙা হয়নি — সব নতুন টেবিল/রুট আলাদা।
