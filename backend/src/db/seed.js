const { query } = require('../config/db');
const { logger } = require('../config/logger');

const DEFAULT_STORYBOARD_SSC_CGL = [
  {
    scene_number: 1,
    scene_id: 'scene_1',
    title: 'Hook & Pattern Interrupt',
    narration_segment:
      'Ruko! Har saal 30 lakh graduates SSC CGL ka form bharte hain, par sirf 1% hi Inspector kyun ban paate hain?',
    narration_hindi:
      'Ruko! Har saal 30 lakh graduates SSC CGL ka form bharte hain, par sirf 1% hi Inspector kyun ban paate hain?',
    on_screen_text: 'SSC CGL Exam: 30 Lakh Aspirants Ka Sach!',
    visual_description:
      'A dramatic 3D Pixar and Zack D. Films style vertical scene where an expressive 3D young Indian graduate stands before a colossal glowing golden 3D Central Secretariat gateway as thousands of luminous application cards swirl upward in volumetric cyan and amber light. Zero written text or letters inside the image.',
    characters_and_environment:
      '3D stylized Indian graduate aspirant and glowing golden Central Secretariat archway',
    camera_angle_and_movement: 'dynamic 3D low-angle push-in with glowing depth of field',
    camera_angle: 'dynamic 3D low-angle push-in',
    animation_action: 'Golden 3D gateway opening with volumetric light beams',
    transition: 'crossfade',
    duration_seconds: 9,
    presenter_config: {
      visible: false,
      presenter_id: 'aashi_official_v1',
      look: 'explainer',
      outfit: 'black_blazer',
      expression: 'speaking',
      framing: 'faceless_3d',
      layout: 'none',
    },
    visual_template: 'public_affairs_data',
    visual_data: {
      badge: 'Govt Exam • SSC CGL',
      stat_label: 'Annual Applicants',
      stat_value: '30 Lakh+ Graduates',
      points: ['Group B & C Central Govt Posts', 'Income Tax, GST & CBI Inspector'],
    },
    required_assets: [],
    asset_source: 'Gemini 3D Visual Generator (MAX 3D Cutaway)',
    license_info: 'Original AI-generated 3D educational visual',
    ai_generated_disclosure: 'Faceless 3D educational explainer visual.',
  },
  {
    scene_number: 2,
    scene_id: 'scene_2',
    title: 'Core Meaning & Posts',
    narration_segment:
      'SSC CGL yaani Combined Graduate Level exam, jisse direct Income Tax Inspector, GST Officer, ASO in MEA aur CBI Sub-Inspector bante hain.',
    narration_hindi:
      'SSC CGL yaani Combined Graduate Level exam, jisse direct Income Tax Inspector, GST Officer, ASO in MEA aur CBI Sub-Inspector bante hain.',
    on_screen_text: 'SSC CGL = Direct Group B & C Officer Posts',
    visual_description:
      'A rich 3D Pixar and Professor of How style diorama showing four distinct 3D Indian officers in crisp uniforms standing on glowing hexagonal platforms representing Income Tax, Customs, Ministry of External Affairs, and CBI headquarters with dramatic rim lighting. Zero written text or letters inside the image.',
    characters_and_environment: 'Four 3D stylized Indian government officers on glowing 3D platforms',
    camera_angle_and_movement: 'smooth 3D orbital camera sweep across the four officer platforms',
    camera_angle: 'smooth 3D orbital sweep',
    animation_action: 'Glowing golden emblems illuminating above each 3D officer platform',
    transition: 'crossfade',
    duration_seconds: 9,
    presenter_config: {
      visible: false,
      presenter_id: 'aashi_official_v1',
      look: 'explainer',
      outfit: 'black_blazer',
      expression: 'explaining',
      framing: 'faceless_3d',
      layout: 'none',
    },
    visual_template: 'timeline_explainer',
    visual_data: {
      badge: 'Top Officer Posts',
      stat_label: 'Pay Level',
      stat_value: 'Level 4 to Level 8',
      points: ['Income Tax & Excise Inspector', 'ASO in Central Ministries'],
    },
    required_assets: [],
    asset_source: 'Gemini 3D Visual Generator (MAX 3D Cutaway)',
    license_info: 'Original AI-generated 3D educational visual',
    ai_generated_disclosure: 'Faceless 3D educational explainer visual.',
  },
  {
    scene_number: 3,
    scene_id: 'scene_3',
    title: 'Tier-1 vs Tier-2 Mechanism',
    narration_segment:
      'Ab asli game dekho! Tier-1 ke 200 marks sirf qualifying hain, par final merit list sirf Tier-2 ke 390 marks aur computer test se banti hai.',
    narration_hindi:
      'Ab asli game dekho! Tier-1 ke 200 marks sirf qualifying hain, par final merit list sirf Tier-2 ke 390 marks aur computer test se banti hai.',
    on_screen_text: 'Tier-1 Qualifying • Tier-2 (390 Marks) Decides Rank!',
    visual_description:
      'A vibrant 3D Zack D. Films style split-level mechanical cutaway where a glowing cyan first-stage filter gate opens into a massive golden second-stage vault engine with rotating precision gears and a 3D computer terminal. Zero written text or letters inside the image.',
    characters_and_environment: '3D two-stage mechanical filter gate and golden merit vault cutaway',
    camera_angle_and_movement: 'cinematic 3D macro zoom from Stage 1 gate into Stage 2 vault core',
    camera_angle: 'cinematic 3D macro zoom',
    animation_action: 'Cyan filter gate opening into high-speed golden merit engine',
    transition: 'crossfade',
    duration_seconds: 9,
    presenter_config: {
      visible: false,
      presenter_id: 'aashi_official_v1',
      look: 'explainer',
      outfit: 'black_blazer',
      expression: 'serious',
      framing: 'faceless_3d',
      layout: 'none',
    },
    visual_template: 'tech_comparison',
    visual_data: {
      badge: 'Exam Pattern',
      stat_label: 'Final Merit Decider',
      stat_value: 'Tier-2 (390 Marks)',
      points: ['Tier-1 (200 Marks): Qualifying Only', 'Tier-2 + Computer Test: Final Selection'],
    },
    required_assets: [],
    asset_source: 'Gemini 3D Visual Generator (MAX 3D Cutaway)',
    license_info: 'Original AI-generated 3D educational visual',
    ai_generated_disclosure: 'Faceless 3D educational explainer visual.',
  },
  {
    scene_number: 4,
    scene_id: 'scene_4',
    title: 'Salary & Real-Life Perks',
    narration_segment:
      'Select hote hi Level-7 Inspector ki in-hand salary 75,000 se 85,000 rupaye mahina hoti hai, saath mein central government power aur job security!',
    narration_hindi:
      'Select hote hi Level-7 Inspector ki in-hand salary 75,000 se 85,000 rupaye mahina hoti hai, saath mein central government power aur job security!',
    on_screen_text: 'In-Hand Salary: Rs 75,000 - Rs 85,000/Month + Perks',
    visual_description:
      'A vibrant 3D Pixar-style scene of a proud 3D Indian Inspector stepping out of an official government building with a glowing golden shield of security, medical cross, and treasury chest floating beside them in warm volumetric lighting. Zero written text or letters inside the image.',
    characters_and_environment: '3D Indian Inspector with glowing golden treasury and security shield',
    camera_angle_and_movement: 'dynamic 3D medium tracking shot with golden rim light',
    camera_angle: 'dynamic 3D medium tracking shot',
    animation_action: 'Golden shield and treasury chest pulsing with warm volumetric rays',
    transition: 'crossfade',
    duration_seconds: 9,
    presenter_config: {
      visible: false,
      presenter_id: 'aashi_official_v1',
      look: 'explainer',
      outfit: 'black_blazer',
      expression: 'confident',
      framing: 'faceless_3d',
      layout: 'none',
    },
    visual_template: 'public_affairs_data',
    visual_data: {
      badge: 'Salary & Perks',
      stat_label: 'Level-7 In-Hand',
      stat_value: 'Rs 75K - 85K / Month',
      points: ['DA + HRA + Transport Allowance', 'CGHS Medical & Central Pension'],
    },
    required_assets: [],
    asset_source: 'Gemini 3D Visual Generator (MAX 3D Cutaway)',
    license_info: 'Original AI-generated 3D educational visual',
    ai_generated_disclosure: 'Faceless 3D educational explainer visual.',
  },
  {
    scene_number: 5,
    scene_id: 'scene_5',
    title: 'Takeaway & Interactive Question',
    narration_segment:
      'Toh ratti-ratayi gk chhodo aur Tier-2 Maths, Reasoning aur English ki speed par focus karo! Aapki dream post kaunsi hai? Comments mein batao!',
    narration_hindi:
      'Toh ratti-ratayi gk chhodo aur Tier-2 Maths, Reasoning aur English ki speed par focus karo! Aapki dream post kaunsi hai? Comments mein batao!',
    on_screen_text: 'Focus on Tier-2 Speed & Accuracy • Comment Your Dream Post!',
    visual_description:
      'A high-energy 3D Pixar and Zack D. Films style finale where a 3D Indian aspirant reaches the glowing golden summit trophy above a 3D stopwatch and precision target board in a dramatic sunlit arena. Zero written text or letters inside the image.',
    characters_and_environment: '3D Indian aspirant with golden trophy, 3D stopwatch, and target board',
    camera_angle_and_movement: 'heroic 3D crane pull-back with celebratory volumetric light',
    camera_angle: 'heroic 3D crane pull-back',
    animation_action: 'Stopwatch hands spinning and golden target bullseye lighting up',
    transition: 'fade_out',
    duration_seconds: 9,
    presenter_config: {
      visible: false,
      presenter_id: 'aashi_official_v1',
      look: 'explainer',
      outfit: 'black_blazer',
      expression: 'smile',
      framing: 'faceless_3d',
      layout: 'none',
    },
    visual_template: 'anchor_studio',
    visual_data: {
      badge: 'Smart Strategy',
      stat_label: 'Winning Formula',
      stat_value: 'Speed + Accuracy',
      points: ['Master Tier-2 Mock Tests', 'Comment Your Target Post Below!'],
    },
    required_assets: [],
    asset_source: 'Gemini 3D Visual Generator (MAX 3D Cutaway)',
    license_info: 'Original AI-generated 3D educational visual',
    ai_generated_disclosure: 'Faceless 3D educational explainer visual.',
  },
];

async function runSeed() {
  try {
    // 1. Seed Trusted Reference & Explainer Sources
    const sources = [
      {
        name: 'The Indian Express — Explained Desk',
        feed_url: 'https://indianexpress.com/section/explained/feed/',
        site_url: 'https://indianexpress.com/section/explained/',
        category: 'delhi_civic',
        trust_score: 98,
      },
      {
        name: 'The Hindu — National & Polity Explained',
        feed_url: 'https://www.thehindu.com/news/national/feeder/default.rss',
        site_url: 'https://www.thehindu.com/news/national/',
        category: 'delhi_civic',
        trust_score: 97,
      },
      {
        name: 'Indian Express — Technology & AI Explained',
        feed_url: 'https://indianexpress.com/section/technology/feed/',
        site_url: 'https://indianexpress.com/section/technology/',
        category: 'tech_auto',
        trust_score: 95,
      },
      {
        name: 'Indian Express — Education, SSC & UPSC Desk',
        feed_url: 'https://indianexpress.com/section/education/feed/',
        site_url: 'https://indianexpress.com/section/education/',
        category: 'sports_viral',
        trust_score: 96,
      },
      {
        name: 'The Hindu — Economy, RBI & Personal Finance',
        feed_url: 'https://www.thehindu.com/business/Economy/feeder/default.rss',
        site_url: 'https://www.thehindu.com/business/Economy/',
        category: 'business_facts',
        trust_score: 96,
      },
      {
        name: 'The Hindu — Science & Everyday Systems',
        feed_url: 'https://www.thehindu.com/sci-tech/science/feeder/default.rss',
        site_url: 'https://www.thehindu.com/sci-tech/science/',
        category: 'bollywood_celeb',
        trust_score: 96,
      },
    ];

    for (const src of sources) {
      await query(
        `INSERT INTO news_sources (name, feed_url, site_url, category, trust_score)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (feed_url) DO UPDATE SET
           name = EXCLUDED.name,
           category = EXCLUDED.category,
           trust_score = EXCLUDED.trust_score`,
        [src.name, src.feed_url, src.site_url, src.category, src.trust_score]
      );
    }

    // 2. Seed Trending Topics if empty
    const existingTopics = await query('SELECT COUNT(*)::int AS count FROM trending_topics');
    if (existingTopics.rows[0].count === 0) {
      const seedTopics = [
        {
          headline:
            'SSC CGL Exam Explained in 45s: Tier-1 vs Tier-2 Pattern, Inspector Posts & In-Hand Salary',
          fingerprint: 'ssc-cgl-exam-explained-tier1-tier2-inspector-salary',
          category: 'sports_viral',
          summary:
            'Complete 45-second breakdown of the Staff Selection Commission Combined Graduate Level (SSC CGL) examination: Group B and Group C officer posts (Income Tax Inspector, GST Inspector, ASO in MEA, CBI Sub-Inspector), Tier-1 qualifying nature vs Tier-2 390-mark merit calculation, and Level-7 in-hand salary structure.',
          primary_source: 'SSC Official Exam Guide',
          source_urls: JSON.stringify([
            {
              title: 'SSC CGL Exam Pattern, Posts & Pay Matrix Explained',
              url: 'https://ssc.gov.in/',
              source: 'SSC Official Portal',
            },
          ]),
          published_at: new Date(Date.now() - 1 * 3600 * 1000).toISOString(),
          freshness_score: 98,
          relevance_score: 99,
          interest_score: 98,
          credibility_score: 99,
          visual_storytelling_score: 97,
          explanatory_value_score: 99,
          overall_score: 98.4,
          is_recommended: true,
          verification_status: 'verified',
          verification_notes:
            'RECOMMENDED EXPLAINER: Verified against official SSC CGL notification and 7th CPC pay matrix.',
          status: 'video_ready',
        },
        {
          headline:
            'Article 370 & 35A Explained: J&K Se Article 370 Kaise Hata Aur Wahan Kya Badla?',
          fingerprint: 'article-370-35a-explained-jammu-kashmir-constitution',
          category: 'delhi_civic',
          summary:
            'Constitutional deep dive into Article 370 and Article 35A: why temporary provisions were introduced in 1949, how the August 5, 2019 Presidential Order and J&K Reorganisation Act ended special status, the Supreme Court 5-judge constitutional bench ruling, and how central laws apply in J&K today.',
          primary_source: 'Indian Constitution & Supreme Court Explained',
          source_urls: JSON.stringify([
            {
              title: 'Article 370 Abrogation & Supreme Court Verdict Explained',
              url: 'https://indianexpress.com/section/explained/',
              source: 'The Indian Express Explained',
            },
          ]),
          published_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
          freshness_score: 96,
          relevance_score: 98,
          interest_score: 97,
          credibility_score: 99,
          visual_storytelling_score: 95,
          explanatory_value_score: 98,
          overall_score: 97.2,
          is_recommended: false,
          verification_status: 'verified',
          verification_notes: 'Verified constitutional and Supreme Court record.',
          status: 'discovered',
        },
        {
          headline:
            'Machine Learning (ML) Explained: Computer Bina Explicit Coding Ke Khud Sochna Kaise Seekhta Hai?',
          fingerprint: 'machine-learning-ml-explained-neural-networks-india',
          category: 'tech_auto',
          summary:
            'How Machine Learning actually works under the hood: Traditional Programming vs Machine Learning training data, features, weights, and loss function optimization, plus how UPI fraud detection, YouTube recommendations, and ChatGPT use ML every second.',
          primary_source: 'AI & Computer Science Explainer Desk',
          source_urls: JSON.stringify([
            {
              title: 'How Machine Learning & Neural Networks Work',
              url: 'https://indianexpress.com/section/technology/',
              source: 'Tech Explained',
            },
          ]),
          published_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
          freshness_score: 95,
          relevance_score: 96,
          interest_score: 96,
          credibility_score: 97,
          visual_storytelling_score: 98,
          explanatory_value_score: 97,
          overall_score: 96.5,
          is_recommended: false,
          verification_status: 'verified',
          verification_notes: 'Verified computer science and AI engineering fundamentals.',
          status: 'discovered',
        },
        {
          headline:
            'Smartphone Virtual RAM (8GB + 8GB Extended RAM) Explained: Asli Speed Boost Ya Marketing Gimmick?',
          fingerprint: 'smartphone-virtual-ram-extended-ram-explained-ufs-lpddr',
          category: 'entertainment',
          summary:
            'Hardware explanation of Smartphone Virtual RAM / RAM Expansion: how a phone borrows UFS internal storage as swap space, why physical LPDDR5X RAM is 10x faster than flash storage, and why Virtual RAM only keeps background apps alive instead of boosting gaming FPS.',
          primary_source: 'Mobile Hardware & SoC Architecture Desk',
          source_urls: JSON.stringify([
            {
              title: 'Virtual RAM vs Physical LPDDR5 RAM Explained',
              url: 'https://indianexpress.com/section/technology/',
              source: 'Mobile Tech Explained',
            },
          ]),
          published_at: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
          freshness_score: 94,
          relevance_score: 95,
          interest_score: 96,
          credibility_score: 96,
          visual_storytelling_score: 97,
          explanatory_value_score: 96,
          overall_score: 95.8,
          is_recommended: false,
          verification_status: 'verified',
          verification_notes: 'Verified semiconductor and mobile architecture breakdown.',
          status: 'discovered',
        },
        {
          headline:
            'Vote Chori Issue, Voter List Deletion & EVM-VVPAT Verification Explained: Asli System Kaise Kaam Karta Hai?',
          fingerprint: 'vote-chori-issue-voter-list-evm-vvpat-explained',
          category: 'delhi_civic',
          summary:
            'Step-by-step technical and legal breakdown of Indian elections: how electoral roll additions/deletions work under Form 6 and Form 7, why standalone EVM Control Units have zero wireless/internet connectivity, how the 7-second VVPAT paper slip works, and how booth agents verify seals.',
          primary_source: 'Election Commission of India (ECI) Technical FAQ',
          source_urls: JSON.stringify([
            {
              title: 'EVM-VVPAT & Electoral Roll Verification Process',
              url: 'https://www.eci.gov.in/',
              source: 'Election Commission of India',
            },
          ]),
          published_at: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
          freshness_score: 93,
          relevance_score: 96,
          interest_score: 95,
          credibility_score: 98,
          visual_storytelling_score: 94,
          explanatory_value_score: 97,
          overall_score: 95.4,
          is_recommended: false,
          verification_status: 'verified',
          verification_notes: 'Verified against Election Commission of India manuals and SC rulings.',
          status: 'discovered',
        },
        {
          headline:
            'RBI Repo Rate Explained: RBI Ke Ek Faisle Se Aapki Home Loan Aur Car Loan EMI Kaise Badal Jaati Hai?',
          fingerprint: 'rbi-repo-rate-reverse-repo-home-loan-emi-explained',
          category: 'business_facts',
          summary:
            'Clear financial breakdown of Repo Rate and Reverse Repo Rate: how the Reserve Bank of India lends overnight liquidity to commercial banks, how Repo Rate hikes fight inflation by making loans costlier, and how EBLR-linked Home Loan EMIs change immediately.',
          primary_source: 'RBI Monetary Policy Explainer Desk',
          source_urls: JSON.stringify([
            {
              title: 'RBI Monetary Policy & Repo Rate Transmission Explained',
              url: 'https://www.rbi.org.in/',
              source: 'Reserve Bank of India',
            },
          ]),
          published_at: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
          freshness_score: 92,
          relevance_score: 95,
          interest_score: 94,
          credibility_score: 98,
          visual_storytelling_score: 93,
          explanatory_value_score: 96,
          overall_score: 94.8,
          is_recommended: false,
          verification_status: 'verified',
          verification_notes: 'Verified RBI Monetary Policy Committee framework.',
          status: 'discovered',
        },
        {
          headline:
            'Viral Rumor: WhatsApp Forward Claims Government Giving Free Rs 25,000 To All Smartphone Users',
          fingerprint: 'viral-rumor-unverified-free-cash-smartphone-claim',
          category: 'delhi_civic',
          summary:
            'A viral social media rumor claims that every smartphone user is getting Rs 25,000 deposited automatically via a phishing link. PIB Fact Check has confirmed no such scheme exists and warned citizens against clicking unverified links.',
          primary_source: 'Social Media Rumor Monitor',
          source_urls: JSON.stringify([
            {
              title: 'PIB Fact Check Warning on Viral WhatsApp Phishing Forward',
              url: 'https://pib.gov.in/factcheck.aspx',
              source: 'PIB Fact Check',
            },
          ]),
          published_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
          freshness_score: 88,
          relevance_score: 40,
          interest_score: 60,
          credibility_score: 32,
          visual_storytelling_score: 40,
          explanatory_value_score: 45,
          overall_score: 49.5,
          is_recommended: false,
          verification_status: 'flagged',
          verification_notes:
            'FLAGGED / UNVERIFIED CLAIM: Confirmed hoax by PIB Fact Check. Automatic video publishing is blocked.',
          status: 'flagged',
        },
      ];

      for (const t of seedTopics) {
        await query(
          `INSERT INTO trending_topics
           (headline, fingerprint, category, summary, primary_source, source_urls, published_at,
            freshness_score, relevance_score, interest_score, credibility_score,
            visual_storytelling_score, explanatory_value_score, overall_score,
            is_recommended, verification_status, verification_notes, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
           ON CONFLICT (fingerprint) DO NOTHING`,
          [
            t.headline,
            t.fingerprint,
            t.category,
            t.summary,
            t.primary_source,
            t.source_urls,
            t.published_at,
            t.freshness_score,
            t.relevance_score,
            t.interest_score,
            t.credibility_score,
            t.visual_storytelling_score,
            t.explanatory_value_score,
            t.overall_score,
            t.is_recommended,
            t.verification_status,
            t.verification_notes,
            t.status,
          ]
        );
      }

      // 3. Seed 1 complete 45-second Roman Hinglish Explainer Video Package
      const firstTopicRes = await query(
        `SELECT id, source_urls FROM trending_topics WHERE fingerprint = 'ssc-cgl-exam-explained-tier1-tier2-inspector-salary' LIMIT 1`
      );

      if (firstTopicRes.rows.length > 0) {
        const topicId = firstTopicRes.rows[0].id;
        const segments = [
          {
            start: 0,
            end: 9,
            text: 'Ruko! Har saal 30 lakh graduates SSC CGL ka form bharte hain, par sirf 1% hi Inspector kyun ban paate hain?',
          },
          {
            start: 9,
            end: 18,
            text: 'SSC CGL yaani Combined Graduate Level exam, jisse direct Income Tax Inspector, GST Officer, ASO in MEA aur CBI Sub-Inspector bante hain.',
          },
          {
            start: 18,
            end: 27,
            text: 'Ab asli game dekho! Tier-1 ke 200 marks sirf qualifying hain, par final merit list sirf Tier-2 ke 390 marks aur computer test se banti hai.',
          },
          {
            start: 27,
            end: 36,
            text: 'Select hote hi Level-7 Inspector ki in-hand salary 75,000 se 85,000 rupaye mahina hoti hai, saath mein central government power aur job security!',
          },
          {
            start: 36,
            end: 45,
            text: 'Toh ratti-ratayi gk chhodo aur Tier-2 Maths, Reasoning aur English ki speed par focus karo! Aapki dream post kaunsi hai? Comments mein batao!',
          },
        ];

        const srt = `1
00:00:00,000 --> 00:00:09,000
Ruko! Har saal 30 lakh graduates SSC CGL ka form bharte hain, par sirf 1% hi Inspector kyun ban paate hain?

2
00:00:09,000 --> 00:00:18,000
SSC CGL yaani Combined Graduate Level exam, jisse direct Income Tax Inspector, GST Officer, ASO in MEA aur CBI Sub-Inspector bante hain.

3
00:00:18,000 --> 00:00:27,000
Ab asli game dekho! Tier-1 ke 200 marks sirf qualifying hain, par final merit list sirf Tier-2 ke 390 marks aur computer test se banti hai.

4
00:00:27,000 --> 00:00:36,000
Select hote hi Level-7 Inspector ki in-hand salary 75,000 se 85,000 rupaye mahina hoti hai, saath mein central government power aur job security!

5
00:00:36,000 --> 00:00:45,000
Toh ratti-ratayi gk chhodo aur Tier-2 Maths, Reasoning aur English ki speed par focus karo! Aapki dream post kaunsi hai? Comments mein batao!`;

        const videoInsert = await query(
          `INSERT INTO videos
           (topic_id, video_format, hindi_title, opening_hook, what_happened, background_timeline, why_it_matters, conclusion_text,
            narration_script, storyboard, subtitles_srt, subtitles_segments,
            short_description, hashtags, thumbnail_concept, call_to_action, source_links,
            fact_check_report, ai_model_used, presenter_settings, synthetic_disclosure, estimated_cost_usd, duration_seconds, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
           RETURNING id`,
          [
            topicId,
            'vertical_9_16',
            'SSC CGL Exam Kya Hai? 45 Seconds Mein Full Breakdown (Pattern, Posts & Salary)!',
            'Ruko! Har saal 30 lakh graduates SSC CGL ka form bharte hain, par sirf 1% hi Inspector kyun ban paate hain?',
            'SSC CGL central ministries aur departments mein Group B aur Group C officers (Income Tax, GST, CBI, MEA) select karne ka sabse bada graduate exam hai.',
            JSON.stringify([
              'Step 1: Tier-1 (200 Marks, 60 Mins) sirf qualifying nature ka hota hai — iske marks final merit mein nahi judte.',
              'Step 2: Tier-2 (390 Marks — Maths, Reasoning, English, GA + Computer Test) se hi 100% final merit aur post decide hoti hai.',
              'Step 3: Level-7 Inspector posts par 75,000 se 85,000 rupaye monthly in-hand salary aur central allowances milte hain.',
            ]),
            'Lakhs students Tier-1 mein top karne ke baad bhi Tier-2 Computer Test ya speed ki wajah se chook jaate hain.',
            'Tier-2 ki speed, accuracy aur Computer qualifying cutoff par shuru se focus karna hi 1% toppers ka asli secret hai.',
            segments.map((s) => s.text).join('\n\n'),
            JSON.stringify(DEFAULT_STORYBOARD_SSC_CGL),
            srt,
            JSON.stringify(segments),
            'SSC CGL Exam Explained in 45 Seconds: Tier-1 vs Tier-2 Pattern, Income Tax & GST Inspector Posts, and In-Hand Salary!',
            JSON.stringify(['#SSCCGL', '#GovtJobsIndia', '#IncomeTaxInspector', '#IndianExplainer', '#ShortsIndia']),
            '3D Golden Central Secretariat Archway with Indian Inspector vs 30 Lakh Aspirants',
            'Aapki dream SSC CGL post kaunsi hai — Income Tax ya MEA? Comments mein batao!',
            JSON.stringify(firstTopicRes.rows[0].source_urls),
            JSON.stringify({
              confirmed_facts: [
                'SSC CGL Tier-1 (200 marks) is qualifying in nature.',
                'Final merit is based on Tier-2 (390 marks) subject to qualifying Computer Knowledge and Data Entry tests.',
              ],
              allegations_or_unverified: [],
              sources_agree: true,
              safe_to_publish: true,
              notes: 'Verified against official SSC CGL Notification and 7th Pay Commission matrix.',
            }),
            'gemini-2.5-flash',
            JSON.stringify({
              personaId: 'aashi_official_v1',
              name: 'Aashi',
              outfit: 'black_blazer',
              look: 'explainer',
              defaultExpression: 'explaining',
              avatarProvider: 'veo-3.1-fast-generate-001',
            }),
            'Faceless 3D educational visual explainer generated with AI.',
            0.003,
            45,
            'awaiting_approval',
          ]
        );

        const videoId = videoInsert.rows[0].id;
        await query(
          `INSERT INTO analytics_metrics
           (video_id, platform, views, likes, comments, shares, avg_view_duration_sec, retention_pct)
           VALUES
           ($1, 'youtube_shorts', 48200, 3910, 412, 1180, 39.4, 87.5),
           ($1, 'instagram_reels', 31900, 2840, 275, 940, 37.8, 84.0)`,
          [videoId]
        );
      }

      logger.info('Seeded initial Indian Topic Explainer stories, 5-scene MAX-3D storyboard, and sample analytics.');
    }
  } catch (err) {
    logger.error('Seed failed', { error: err.message });
    throw err;
  }
}

if (require.main === module) {
  runSeed()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { runSeed, DEFAULT_STORYBOARD_SSC_CGL };
