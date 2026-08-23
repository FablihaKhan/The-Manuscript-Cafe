-- ============================================================================
--  মুদ্রণ — সম্পূর্ণ ডেমো ডেটা  (Mudron full demo dataset)
--  Run AFTER 001_base.sql and migrations/002_mudron2.sql.
--
--    psql -U postgres -p 5433 -d Maindb -f db/003_demo_data.sql
--
--  Everything here is safe to run more than once (idempotent guards).
--  Populates every screen so anyone can explore the app without touching SQL.
--
--  LOGINS (all passwords: 1234)
--    Author    demo@mudron.test        (also lekhok2@ , lekhok3@)
--    Publisher batighar@mudron.test    (also sheba@ , prothoma@ , onno@)
--    Editor    editor@mudron.test
--    Reader    reader@mudron.test
-- ============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Authors
-- ---------------------------------------------------------------------------
INSERT INTO Author (first_name, last_name, gender, email, contact_no, interested_genre, password)
SELECT v.fn, v.ln, v.g, v.email, v.c, v.genre, '1234'
  FROM (VALUES
    ('মারজিয়া','খান','F','demo@mudron.test','01700000000','Fiction'),
    ('তানভীর','আহমেদ','M','lekhok2@mudron.test','01700000002','Thriller'),
    ('শাহনাজ','পারভীন','F','lekhok3@mudron.test','01700000003','Romance')
  ) AS v(fn,ln,g,email,c,genre)
 WHERE NOT EXISTS (SELECT 1 FROM Author a WHERE a.email = v.email);

UPDATE Author SET bio='ঢাকায় বসবাসকারী কথাসাহিত্যিক। মূলত সমকালীন উপন্যাস লেখেন।', country='Bangladesh', pen_name='মারজিয়া খান' WHERE email='demo@mudron.test';
UPDATE Author SET bio='থ্রিলার ও রহস্য-উপন্যাসের লেখক। চট্টগ্রামে থাকেন।', country='Bangladesh', pen_name='তানভীর আহমেদ' WHERE email='lekhok2@mudron.test';
UPDATE Author SET bio='সমকালীন প্রেম ও পারিবারিক গল্পের লেখক।', country='Bangladesh', pen_name='শাহনাজ পারভীন' WHERE email='lekhok3@mudron.test';

-- ---------------------------------------------------------------------------
-- 2. Publishers + matcher profiles
-- ---------------------------------------------------------------------------
INSERT INTO Publisher (name, email, contact_no, password)
SELECT v.name, v.email, v.contact, '1234'
  FROM (VALUES
    ('বাতিঘর প্রকাশনী','batighar@mudron.test','01711111111'),
    ('সেবা প্রকাশনী','sheba@mudron.test','01722222222'),
    ('প্রথমা প্রকাশন','prothoma@mudron.test','01733333333'),
    ('অন্যপ্রকাশ','onno@mudron.test','01744444444')
  ) AS v(name,email,contact)
 WHERE NOT EXISTS (SELECT 1 FROM Publisher p WHERE p.email = v.email);

INSERT INTO Publisher_Profile (publisher_id, is_agent, accepted_genres, languages, audiences, min_words, max_words, country, response_days, submission_guidelines, wants_full_manuscript)
SELECT p.publisher_id, prof.is_agent, prof.genres, prof.langs, prof.auds, prof.minw, prof.maxw, 'Bangladesh', prof.days, prof.guide, prof.wants_full
  FROM Publisher p
  JOIN (VALUES
    ('batighar@mudron.test', FALSE, ARRAY['Fiction','Literary','History'],  ARRAY['bn'],       ARRAY['adult'],       20000, 200000, 25, 'প্রথম তিন অধ্যায়, এক পাতার সারসংক্ষেপ ও লেখক পরিচিতি পাঠান।', FALSE),
    ('sheba@mudron.test',    FALSE, ARRAY['Thriller','Mystery','Romance'],   ARRAY['bn'],       ARRAY['adult','ya'],  15000, 120000, 30, 'সম্পূর্ণ পাণ্ডুলিপি ও সারসংক্ষেপ পাঠান।', TRUE),
    ('prothoma@mudron.test', FALSE, ARRAY['Fiction','Non-fiction','Poetry'], ARRAY['bn','en'],  ARRAY['adult'],       25000, 180000, 45, 'query letter ও নমুনা অধ্যায় ইমেইলে পাঠান।', FALSE),
    ('onno@mudron.test',     TRUE,  ARRAY['Fiction','Literary','Fantasy'],   ARRAY['bn','en'],  ARRAY['adult','ya'],  30000, 220000, 20, 'সাহিত্য এজেন্ট — সম্পূর্ণ পাণ্ডুলিপি ও pitch পাঠান।', TRUE)
  ) AS prof(email, is_agent, genres, langs, auds, minw, maxw, days, guide, wants_full)
    ON prof.email = p.email
 WHERE NOT EXISTS (SELECT 1 FROM Publisher_Profile pp WHERE pp.publisher_id = p.publisher_id);

-- ---------------------------------------------------------------------------
-- 3. Editors
-- ---------------------------------------------------------------------------
INSERT INTO Editor (name, email, contact_no, password)
SELECT v.name, v.email, v.c, '1234'
  FROM (VALUES
    ('নুসরাত সম্পাদক','editor@mudron.test','01799999999'),
    ('রফিকুল সম্পাদক','editor2@mudron.test','01799999998')
  ) AS v(name,email,c)
 WHERE NOT EXISTS (SELECT 1 FROM Editor e WHERE e.email = v.email);

-- ---------------------------------------------------------------------------
-- 4. Manuscripts + chapters (helper procedure keeps this readable)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION _demo_add_ms(
  p_email TEXT, p_title TEXT, p_sub TEXT, p_genre TEXT, p_synopsis TEXT
) RETURNS BIGINT AS $$
DECLARE a_id BIGINT; ms_id BIGINT;
BEGIN
  SELECT id INTO a_id FROM Author WHERE email = p_email;
  SELECT manuscript_id INTO ms_id FROM Manuscript WHERE author_id = a_id AND title = p_title;
  IF ms_id IS NOT NULL THEN RETURN ms_id; END IF;
  INSERT INTO Manuscript (author_id, title, subtitle, genre, language, audience, country, synopsis, status)
  VALUES (a_id, p_title, p_sub, p_genre, 'bn', 'adult', 'Bangladesh', p_synopsis, 'draft')
  RETURNING manuscript_id INTO ms_id;
  RETURN ms_id;
END; $$ LANGUAGE plpgsql;

DO $$
DECLARE ms_id BIGINT;
BEGIN
  -- ---- Manuscript A: বৃষ্টির শহর (demo author) ----
  ms_id := _demo_add_ms('demo@mudron.test','বৃষ্টির শহর','একটি উপন্যাস','Fiction',
    'বহু বছর আগে হারিয়ে যাওয়া বোনকে খুঁজে ফেরা এক তরুণের গল্প। বৃষ্টিভেজা এক শহরের পটভূমিতে গড়ে ওঠা এই কাহিনি স্মৃতি, অনুশোচনা আর ফিরে পাওয়ার গল্প বলে, যা পাঠককে শেষ পাতা পর্যন্ত ধরে রাখে।');
  IF NOT EXISTS (SELECT 1 FROM Manuscript_Chapter WHERE manuscript_id = ms_id) THEN
    INSERT INTO Manuscript_Chapter (manuscript_id, chapter_no, title, content, word_count) VALUES
    (ms_id,1,'অধ্যায় ১',
'রফিক ধীরে ধীরে জানালার পাশে এসে দাঁড়াল। বাইরে বৃষ্টি পড়ছিল। শহরের আলোগুলো বৃষ্টির জলে গলে গিয়ে অদ্ভুত এক ছবি এঁকেছিল কাচের গায়ে।

"তুমি কি সত্যিই যাবে?" মিতা পেছন থেকে জিজ্ঞেস করল। তার কণ্ঠে উদ্বেগ ছিল।

রফিক বলল, "যেতে তো হবেই। এতগুলো বছর ধরে যে প্রশ্নটা আমাকে তাড়া করে বেড়াচ্ছে, তার উত্তর আমাকে খুঁজতেই হবে।" সে ক্লান্ত ছিল, কিন্তু তার চোখে এক অদ্ভুত দৃঢ়তা।

কারণ সে জানত, এই শহরে তার বোন অনিতা কোথাও আছে। বহু বছর আগে এক ঝড়ের রাতে হারিয়ে গিয়েছিল মেয়েটি। সেই থেকে রফিকের বুকে একটা শূন্যতা।

মিতা কাছে এসে তার হাত ধরল। "আমি জানি তুমি ফিরবে। কিন্তু নিজের খেয়াল রেখো।" বৃষ্টি তখন আরও জোরে নামল।',210),
    (ms_id,2,'অধ্যায় ২',
'পরদিন সকালে করিম এলো। বহুদিনের বন্ধু সে, রফিকের ছোটবেলার সঙ্গী। হাতে একটা পুরনো খাম নিয়ে এসেছিল।

"এটা তোমার জন্য," করিম বলল, খামটা এগিয়ে দিয়ে। "গত সপ্তাহে পুরনো বাড়ি পরিষ্কার করতে গিয়ে পেয়েছি।"

রফিক খামটা খুলল। ভেতরে একটা হলুদ হয়ে যাওয়া চিঠি আর একটা ঠিকানা। চিঠিটা অনিতার হাতের লেখা। বুকের ভেতরটা কেঁপে উঠল তার।

চিঠিতে লেখা ছিল একটা মাত্র লাইন: "দাদা, আমি ভালো আছি। আমাকে খুঁজো না, কিন্তু ভুলেও যেও না।"

করিম চুপ করে দাঁড়িয়ে রইল। মিতা রান্নাঘর থেকে চা নিয়ে এলো, কিন্তু কেউ ছুঁলো না কাপগুলো।

"ঠিকানাটা শহরের অন্য প্রান্তে," রফিক অবশেষে বলল। "আজই যাব।"',205),
    (ms_id,3,'অধ্যায় ৩',
'শহরের শেষ প্রান্তে সেই বাড়িটা। পুরনো, শ্যাওলা ধরা দেয়াল, মরচে পড়া লোহার গেট। রফিক দরজায় কড়া নাড়ল। বুকের ভেতর হাতুড়ি পিটছিল।

কিছুক্ষণ পর দরজা খুলল। এক মধ্যবয়সী নারী দাঁড়িয়ে। চুলে পাক ধরেছে, চোখের নিচে ক্লান্তির ছাপ। কিন্তু সেই চোখ — রফিক এক নিমেষে চিনে ফেলল।

"অনিতা," ফিসফিস করে বলল সে। গলা ধরে এলো।

মেয়েটি থমকে গেল। তারপর তার চোখেও জল। "দাদা?" এতগুলো বছর পরেও কণ্ঠটা এক রকম আছে।

দুই ভাইবোন দরজার চৌকাঠে দাঁড়িয়ে রইল। বাইরে আবার বৃষ্টি নামল — যেন সেই পুরনো ঝড়ের রাতটা ফিরে এসেছে, কিন্তু এবার আর কেউ হারায়নি।

অনিতা দরজা আরও খুলে দিল। "ভেতরে এসো, দাদা। অনেক কথা জমে আছে।"',200);
  END IF;

  -- ---- Manuscript B: রাতের ট্রেন (thriller, author 2) ----
  ms_id := _demo_add_ms('lekhok2@mudron.test','রাতের ট্রেন',NULL,'Thriller',
    'শেষ রাতের ট্রেনে এক অচেনা যাত্রীর সঙ্গে দেখা — আর তারপরই শুরু হয় এক রহস্যের জাল, যেখানে প্রতিটি স্টেশন একেকটি নতুন প্রশ্ন।');
  IF NOT EXISTS (SELECT 1 FROM Manuscript_Chapter WHERE manuscript_id = ms_id) THEN
    INSERT INTO Manuscript_Chapter (manuscript_id, chapter_no, title, content, word_count) VALUES
    (ms_id,1,'প্রথম স্টেশন',
'রাত এগারোটার ট্রেন। প্ল্যাটফর্ম প্রায় ফাঁকা। আসিফ জানালার পাশে বসে বাইরের অন্ধকার দেখছিল। হঠাৎ কামরায় ঢুকল এক লোক, কালো কোট গায়ে।

"এই সিটটা কি খালি?" লোকটি জিজ্ঞেস করল।

আসিফ মাথা নাড়ল। লোকটি বসল, তারপর ফিসফিস করে বলল, "আপনি কি জানেন, এই ট্রেনে একজন খুন হতে যাচ্ছে?"

আসিফের বুক ধক করে উঠল। সে ভাবল লোকটা হয়তো পাগল। কিন্তু তার চোখে পাগলামি ছিল না — ছিল ভয়।',120),
    (ms_id,2,'দ্বিতীয় স্টেশন',
'ট্রেন থামল ছোট এক স্টেশনে। কালো কোট পরা লোকটি হঠাৎ উঠে দাঁড়াল। "সময় হয়ে গেছে," বলল সে।

আসিফ জানালা দিয়ে দেখল, প্ল্যাটফর্মে দাঁড়িয়ে আরও দুজন। তাদের হাতেও কালো ব্যাগ। কিছু একটা গোলমাল আছে।

লোকটি নেমে গেল। কিন্তু যাওয়ার আগে আসিফের হাতে একটা চিরকুট গুঁজে দিল। তাতে লেখা: "পরের স্টেশনে নামবেন না। যা-ই ঘটুক।"',105);
  END IF;

  -- ---- Manuscript C: ভালোবাসার শহর (romance, author 3) ----
  ms_id := _demo_add_ms('lekhok3@mudron.test','ভালোবাসার শহর',NULL,'Romance',
    'দুই অচেনা মানুষ, এক পুরনো বইয়ের দোকান, আর একটি চিঠি যা কখনো পাঠানো হয়নি — শহরের কোলাহলে গড়ে ওঠা এক নিঃশব্দ প্রেমের গল্প।');
  IF NOT EXISTS (SELECT 1 FROM Manuscript_Chapter WHERE manuscript_id = ms_id) THEN
    INSERT INTO Manuscript_Chapter (manuscript_id, chapter_no, title, content, word_count) VALUES
    (ms_id,1,'পুরনো বইয়ের দোকান',
'নীলা প্রতিদিন বিকেলে ওই পুরনো বইয়ের দোকানে যেত। ধুলো জমা তাকগুলোর মধ্যে সে খুঁজে বেড়াত হারিয়ে যাওয়া কবিতার বই।

একদিন এক বইয়ের ভাঁজে সে পেল একটা চিঠি। কোনো ঠিকানা নেই, শুধু লেখা: "যে পড়বে, সে যেন জানে — কেউ একজন তাকে খুঁজছিল।"

নীলার মনে হলো, চিঠিটা যেন তারই জন্য লেখা।',95),
    (ms_id,2,'চিঠির খোঁজে',
'পরদিন নীলা আবার এলো। দোকানি বৃদ্ধ হাসলেন। "ওই চিঠি? ওটা এক তরুণ রেখে গিয়েছিল, বছর দুই আগে। বলেছিল, যে মেয়ে কবিতা ভালোবাসে, সে-ই যেন পায়।"

নীলার বুক কেঁপে উঠল। "সে কি আর আসে?"

"আসে," বৃদ্ধ বললেন। "প্রতি শুক্রবার। আজও হয়তো আসবে।"',88);
  END IF;
END $$;

DROP FUNCTION IF EXISTS _demo_add_ms(TEXT,TEXT,TEXT,TEXT,TEXT);

-- ---------------------------------------------------------------------------
-- 5. A pre-computed Doctor analysis + metadata + readiness for বৃষ্টির শহর
--    (so the studio looks alive on first load; other books can be run live)
-- ---------------------------------------------------------------------------
DO $$
DECLARE ms_id BIGINT; an_id BIGINT;
BEGIN
  SELECT m.manuscript_id INTO ms_id FROM Manuscript m
    JOIN Author a ON a.id = m.author_id
   WHERE a.email='demo@mudron.test' AND m.title='বৃষ্টির শহর';
  IF ms_id IS NULL THEN RETURN; END IF;

  IF NOT EXISTS (SELECT 1 FROM Manuscript_Analysis WHERE manuscript_id = ms_id) THEN
    INSERT INTO Manuscript_Analysis (manuscript_id, health_score, engine, language, metrics)
    VALUES (ms_id, 82, 'heuristic', 'bn',
      '{"sub_scores":{"structure":84,"prose":80,"dialogue":88,"originality":90,"clarity":78,"mechanics":72},
        "pacing_curve":[{"chapter":1,"words":210,"dialogue":0.4},{"chapter":2,"words":205,"dialogue":0.35},{"chapter":3,"words":200,"dialogue":0.3}],
        "avg_readability":74,"avg_dialogue_ratio":0.35,"cast":["রফিক","মিতা","করিম","অনিতা"],"total_words":615}'::jsonb)
    RETURNING analysis_id INTO an_id;
    INSERT INTO Manuscript_Issue (analysis_id, chapter_no, category, severity, message, excerpt, suggestion) VALUES
    (an_id,1,'style','medium','অধ্যায় ১-এ কয়েকটি জোরদায়ক শব্দ (খুব, একদম) আছে।','খুব','জোরদায়ক শব্দ বাদ দিলে বাক্য আরও জোরালো হয়।'),
    (an_id,NULL,'character','low','"করিম" শুধু অধ্যায় ২-এ আছে — তার পরিণতি দেখানো হয়েছে কিনা দেখুন।','করিম','চরিত্রটির পরিণতি স্পষ্ট করুন।');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM Book_Metadata WHERE manuscript_id = ms_id) THEN
    INSERT INTO Book_Metadata (manuscript_id, title, subtitle, blurb, keywords, categories, audience, comp_titles, seo_score, language)
    VALUES (ms_id,'বৃষ্টির শহর','একটি উপন্যাস',
      'বহু বছর আগে এক ঝড়ের রাতে হারিয়ে গিয়েছিল অনিতা। তার দাদা রফিক আজও সেই শূন্যতা বয়ে বেড়ায়। একদিন এক পুরনো চিঠি তাকে নিয়ে যায় বৃষ্টিভেজা এক শহরের শেষ প্রান্তে — যেখানে অপেক্ষা করছে হারিয়ে যাওয়া অতীত। স্মৃতি, অনুশোচনা আর ফিরে পাওয়ার এক আবেগঘন গল্প।',
      ARRAY['বৃষ্টি','শহর','পরিবার','হারানো','পুনর্মিলন','সমকালীন উপন্যাস'],
      ARRAY['কথাসাহিত্য > সমকালীন উপন্যাস','Fiction > Literary','Fiction > Family Life'],
      'adult','"পথের পাঁচালী" — পারিবারিক আবেগের জন্য; সমকালীন শহুরে গল্পের পাঠকের জন্য।',
      74,'bn');
  END IF;

  INSERT INTO Readiness_Snapshot (manuscript_id, manuscript_pct, editing_pct, formatting_pct, cover_pct, metadata_pct, overall_pct, blockers)
  SELECT ms_id, 78, 60, 20, 0, 85, 58,
    jsonb_build_array(
      jsonb_build_object('pillar','cover','message','প্রচ্ছদ আপলোড করা হয়নি।','link','/studio/'||ms_id,'weight',2),
      jsonb_build_object('pillar','formatting','message','EPUB তৈরি হয়নি।','link','/studio/'||ms_id||'/format','weight',2)
    )
  WHERE NOT EXISTS (SELECT 1 FROM Readiness_Snapshot WHERE manuscript_id = ms_id);
END $$;

-- ---------------------------------------------------------------------------
-- 6. Submissions with mixed statuses + beta readers + a pro hire
-- ---------------------------------------------------------------------------
DO $$
DECLARE ms_id BIGINT; p1 BIGINT; p2 BIGINT; p3 BIGINT; inv BIGINT; pro BIGINT; a_id BIGINT;
BEGIN
  SELECT m.manuscript_id, m.author_id INTO ms_id, a_id FROM Manuscript m
    JOIN Author a ON a.id=m.author_id WHERE a.email='demo@mudron.test' AND m.title='বৃষ্টির শহর';
  IF ms_id IS NULL THEN RETURN; END IF;
  SELECT publisher_id INTO p1 FROM Publisher WHERE email='batighar@mudron.test';
  SELECT publisher_id INTO p2 FROM Publisher WHERE email='prothoma@mudron.test';
  SELECT publisher_id INTO p3 FROM Publisher WHERE email='onno@mudron.test';

  IF NOT EXISTS (SELECT 1 FROM Submission WHERE manuscript_id=ms_id) THEN
    INSERT INTO Submission (manuscript_id, publisher_id, status, notes) VALUES (ms_id,p1,'requested_full','প্রথম তিন অধ্যায় দেখে পুরো পাণ্ডুলিপি চেয়েছে।');
    INSERT INTO Submission (manuscript_id, publisher_id, status, notes) VALUES (ms_id,p2,'viewed',NULL);
    INSERT INTO Submission (manuscript_id, publisher_id, status, notes) VALUES (ms_id,p3,'submitted',NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM Beta_Invite WHERE manuscript_id=ms_id) THEN
    INSERT INTO Beta_Invite (manuscript_id, reader_name, reader_email, token, from_chapter, to_chapter, status)
      VALUES (ms_id,'সাবরিনা','sabrina@example.com','demotoken_beta_1',1,3,'submitted') RETURNING invite_id INTO inv;
    INSERT INTO Beta_Feedback (manuscript_id, invite_id, reader_name, chapter_no, story, characters, pacing, ending, prose, would_recommend, comment)
      VALUES (ms_id,inv,'সাবরিনা',NULL,9,8,7,9,8,TRUE,'শেষ অধ্যায়টা চোখে জল এনে দিল। রফিক আর অনিতার পুনর্মিলন দারুণ।');
    INSERT INTO Beta_Invite (manuscript_id, reader_name, token, from_chapter, to_chapter, status)
      VALUES (ms_id,'রাকিব','demotoken_beta_2',1,3,'submitted') RETURNING invite_id INTO inv;
    INSERT INTO Beta_Feedback (manuscript_id, invite_id, reader_name, chapter_no, story, characters, pacing, ending, prose, would_recommend, comment)
      VALUES (ms_id,inv,'রাকিব',2,7,7,5,8,7,TRUE,'মাঝের দিকটা একটু ধীর, তবে টান আছে।');
    INSERT INTO Beta_Feedback (manuscript_id, reader_name, chapter_no, story, characters, pacing, ending, prose, would_recommend, comment)
      VALUES (ms_id,'অজানা পাঠক',NULL,8,9,7,8,8,TRUE,'চরিত্রগুলো জীবন্ত।');
  END IF;

  SELECT pro_id INTO pro FROM Service_Pro WHERE role='editor' ORDER BY pro_id LIMIT 1;
  IF pro IS NOT NULL AND NOT EXISTS (SELECT 1 FROM Pro_Hire WHERE manuscript_id=ms_id) THEN
    INSERT INTO Pro_Hire (manuscript_id, pro_id, author_id, status, agreed_rate, brief)
    VALUES (ms_id, pro, a_id, 'in_progress', 900, 'সম্পূর্ণ পাণ্ডুলিপির ডেভেলপমেন্ট এডিট।');
  END IF;

  -- Provenance timeline
  IF NOT EXISTS (SELECT 1 FROM Provenance_Event WHERE manuscript_id=ms_id) THEN
    INSERT INTO Provenance_Event (manuscript_id, chapter_no, event_type, tool, share_pct, note) VALUES
    (ms_id,NULL,'authored',NULL,0,'সম্পূর্ণ পাণ্ডুলিপি লেখকের নিজের লেখা।'),
    (ms_id,1,'edited_by_pro','নুসরাত জাহান',0,'অধ্যায় ১ পেশাদার সম্পাদক দেখেছেন।');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 7. Universal Book Link + retailers + clicks
-- ---------------------------------------------------------------------------
DO $$
DECLARE ms_id BIGINT; ubl BIGINT; r1 BIGINT;
BEGIN
  SELECT m.manuscript_id INTO ms_id FROM Manuscript m JOIN Author a ON a.id=m.author_id
   WHERE a.email='demo@mudron.test' AND m.title='বৃষ্টির শহর';
  IF ms_id IS NULL THEN RETURN; END IF;

  IF NOT EXISTS (SELECT 1 FROM Universal_Book_Link WHERE manuscript_id=ms_id) THEN
    INSERT INTO Universal_Book_Link (manuscript_id, slug, title, blurb)
    VALUES (ms_id,'brishtir-shohor','বৃষ্টির শহর','স্মৃতি আর ফিরে পাওয়ার এক আবেগঘন গল্প।')
    RETURNING ubl_id INTO ubl;
    INSERT INTO UBL_Retailer (ubl_id, retailer, url, region, sort_order) VALUES
      (ubl,'রকমারি','https://rokomari.com/book/demo','BD',1),
      (ubl,'বইঘর','https://boighor.com.bd/demo','BD',2),
      (ubl,'Amazon','https://amazon.com/dp/demo','INTL',3);
    SELECT retailer_id INTO r1 FROM UBL_Retailer WHERE ubl_id=ubl ORDER BY sort_order LIMIT 1;
    INSERT INTO UBL_Click (ubl_id, retailer, referrer)
    SELECT ubl,'রকমারি','https://facebook.com' FROM generate_series(1,18);
    INSERT INTO UBL_Click (ubl_id, retailer) SELECT ubl,'বইঘর' FROM generate_series(1,7);
    INSERT INTO UBL_Click (ubl_id, retailer) SELECT ubl,'Amazon' FROM generate_series(1,3);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 8. Published book with sales + reviews (analytics dashboard)
-- ---------------------------------------------------------------------------
DO $$
DECLARE a_id BIGINT; b_id BIGINT; pub_id BIGINT; ed_id BIGINT;
BEGIN
  SELECT id INTO a_id FROM Author WHERE email='demo@mudron.test';
  SELECT publisher_id INTO pub_id FROM Publisher WHERE email='batighar@mudron.test';
  SELECT editor_id INTO ed_id FROM Editor WHERE email='editor@mudron.test';

  IF NOT EXISTS (SELECT 1 FROM Book WHERE author_id=a_id AND book_title='পুরনো ডায়েরি') THEN
    INSERT INTO Book (author_id, book_title, price, type, date_of_publish)
    VALUES (a_id,'পুরনো ডায়েরি',350,'Fiction',CURRENT_DATE-200) RETURNING book_id INTO b_id;
    INSERT INTO Payment (book_id, book_price, publisher_id, author_id, editor_id, author_gets, editor_gets, publisher_gets, publication_date)
    VALUES (b_id,350,pub_id,a_id,ed_id,40,10,50,CURRENT_DATE-200);
    INSERT INTO Book_sales (book_id, channel, unit_price, sold_at)
    SELECT b_id, (ARRAY['online','store','online'])[1+floor(random()*3)::int], 350, CURRENT_DATE-(floor(random()*180))::int
      FROM generate_series(1,180);
    INSERT INTO Review (book_id, rating, review) VALUES
      (b_id,5,'অসাধারণ একটি বই। শেষ না করে ওঠা যায় না।'),
      (b_id,4,'ভালো লেগেছে, তবে মাঝের দিকটা একটু ধীর।'),
      (b_id,5,'লেখকের ভাষা চমৎকার।'),
      (b_id,4,'দ্বিতীয়বার পড়লাম, এখনও ভালো লাগল।'),
      (b_id,5,'বাংলা সাহিত্যে নতুন কণ্ঠ।');
  END IF;

  -- second published title for a fuller analytics view
  IF NOT EXISTS (SELECT 1 FROM Book WHERE author_id=a_id AND book_title='নীল খাম') THEN
    INSERT INTO Book (author_id, book_title, price, type, date_of_publish)
    VALUES (a_id,'নীল খাম',300,'Fiction',CURRENT_DATE-90) RETURNING book_id INTO b_id;
    INSERT INTO Payment (book_id, book_price, publisher_id, author_id, editor_id, author_gets, editor_gets, publisher_gets, publication_date)
    VALUES (b_id,300,pub_id,a_id,ed_id,40,10,50,CURRENT_DATE-90);
    INSERT INTO Book_sales (book_id, channel, unit_price, sold_at)
    SELECT b_id,'online',300,CURRENT_DATE-(floor(random()*80))::int FROM generate_series(1,70);
    INSERT INTO Review (book_id, rating, review) VALUES (b_id,4,'ভালো প্লট।'),(b_id,5,'টানটান উত্তেজনা।');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 9. Reader side: online author + books + subscribed reader
-- ---------------------------------------------------------------------------
INSERT INTO online_author (author_name, email, contact_no, username, password_hash)
SELECT 'অনলাইন লেখক','onlineauthor@mudron.test','018','onlineauthor','1234'
WHERE NOT EXISTS (SELECT 1 FROM online_author WHERE email='onlineauthor@mudron.test');

INSERT INTO online_book (author_code, book_title, genre, pdf_url)
SELECT oa.author_code, v.title, v.genre, v.url
  FROM online_author oa
  JOIN (VALUES
    ('নিঃসঙ্গ দ্বীপ','Drama','https://example.com/book1.pdf'),
    ('রাতের শহর','Mystery','https://example.com/book2.pdf'),
    ('আলোর পথে','Fantasy','https://example.com/book3.pdf'),
    ('সাগরের ডাক','Science Fiction','https://example.com/book4.pdf')
  ) AS v(title,genre,url) ON oa.email='onlineauthor@mudron.test'
 WHERE NOT EXISTS (SELECT 1 FROM online_book WHERE book_title = v.title);

INSERT INTO online_reader (user_name, email, contact_no, password, subscription_end_date)
SELECT 'ডেমো পাঠক','reader@mudron.test','017','1234',CURRENT_TIMESTAMP + INTERVAL '90 days'
WHERE NOT EXISTS (SELECT 1 FROM online_reader WHERE email='reader@mudron.test');

INSERT INTO online_subscription (user_id, payment, payment_method)
SELECT r.user_id,300,'bKash' FROM online_reader r
 WHERE r.email='reader@mudron.test'
   AND NOT EXISTS (SELECT 1 FROM online_subscription s WHERE s.user_id=r.user_id);

-- ---------------------------------------------------------------------------
-- 10. Editor workflow: request → approve → assign, plus a pending request
-- ---------------------------------------------------------------------------
DO $$
DECLARE a_id BIGINT; pub_id BIGINT; ed_id BIGINT; req_id BIGINT; app_id BIGINT;
BEGIN
  SELECT id INTO a_id FROM Author WHERE email='demo@mudron.test';
  SELECT publisher_id INTO pub_id FROM Publisher WHERE email='batighar@mudron.test';
  SELECT editor_id INTO ed_id FROM Editor WHERE email='editor@mudron.test';
  IF a_id IS NULL OR pub_id IS NULL OR ed_id IS NULL THEN RETURN; END IF;

  IF NOT EXISTS (SELECT 1 FROM Publish_Requested_books WHERE book_name='বৃষ্টির শহর') THEN
    INSERT INTO Publish_Request (author_id, publisher_id) VALUES (a_id,pub_id) RETURNING request_id INTO req_id;
    INSERT INTO Publish_Requested_books (request_id, book_name, genre, pdf_link, status)
      VALUES (req_id,'বৃষ্টির শহর','Fiction','https://example.com/brishti.pdf','Approved');
    INSERT INTO Approved_books (publisher_id, request_id) VALUES (pub_id,req_id) RETURNING approve_id INTO app_id;
    INSERT INTO Editor_Books (editor_id, approve_id, request_id, editing_status, edit_start_date)
      VALUES (ed_id,app_id,req_id,'In Progress',CURRENT_DATE);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM Publish_Requested_books WHERE book_name='পুরনো ডায়েরি ২') THEN
    INSERT INTO Publish_Request (author_id, publisher_id) VALUES (a_id,pub_id) RETURNING request_id INTO req_id;
    INSERT INTO Publish_Requested_books (request_id, book_name, genre, pdf_link, status)
      VALUES (req_id,'পুরনো ডায়েরি ২','Fiction','https://example.com/dairy2.pdf','Pending');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM Publish_Requested_books WHERE book_name='রাতের ট্রেন') THEN
    INSERT INTO Publish_Request (author_id, publisher_id)
      VALUES ((SELECT id FROM Author WHERE email='lekhok2@mudron.test'),
              (SELECT publisher_id FROM Publisher WHERE email='sheba@mudron.test')) RETURNING request_id INTO req_id;
    INSERT INTO Publish_Requested_books (request_id, book_name, genre, pdf_link, status)
      VALUES (req_id,'রাতের ট্রেন','Thriller','https://example.com/train.pdf','Pending');
  END IF;
END $$;

COMMIT;

-- ---------------------------------------------------------------------------
-- Summary
-- ---------------------------------------------------------------------------
SELECT 'authors' AS entity, COUNT(*) FROM Author
UNION ALL SELECT 'publishers', COUNT(*) FROM Publisher
UNION ALL SELECT 'editors', COUNT(*) FROM Editor
UNION ALL SELECT 'manuscripts', COUNT(*) FROM Manuscript
UNION ALL SELECT 'chapters', COUNT(*) FROM Manuscript_Chapter
UNION ALL SELECT 'submissions', COUNT(*) FROM Submission
UNION ALL SELECT 'beta_feedback', COUNT(*) FROM Beta_Feedback
UNION ALL SELECT 'service_pros', COUNT(*) FROM Service_Pro
UNION ALL SELECT 'books', COUNT(*) FROM Book
UNION ALL SELECT 'book_sales', COUNT(*) FROM Book_sales
UNION ALL SELECT 'online_books', COUNT(*) FROM online_book
UNION ALL SELECT 'ubl_clicks', COUNT(*) FROM UBL_Click
UNION ALL SELECT 'pending_requests', COUNT(*) FROM Publish_Requested_books WHERE status='Pending'
UNION ALL SELECT 'editor_assignments', COUNT(*) FROM Editor_Books
ORDER BY entity;
