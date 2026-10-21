const { query } = require('../../config/db');
const { env, isGeminiConfigured } = require('../../config/env');
const { logger } = require('../../config/logger');
const { deduplicateStories, scoreAndVerifyStory, createFingerprint } = require('./topicRanker');

const VERTEX_PROJECT_ID = env.gemini.vertexProjectId;

/**
 * Curated Most-Searched Indian Topics & Terminologies across Polity/Law, AI/Tech,
 * Mobile Features, Govt Exams (SSC CGL, UPSC), Banking/Economy, and Everyday Systems.
 * PERMANENT RULE: All headlines in clean English + Casual Roman Hinglish (ZERO Devanagari script).
 */
const MOST_SEARCHED_INDIAN_TOPICS = [
  {
    headline: 'Article 370 & 35A Explained: J&K Se Article 370 Kaise Hata Aur Wahan Kya Badla?',
    category: 'delhi_civic',
    summary:
      'Complete constitutional explanation of Article 370 and Article 35A: why temporary special status was granted in 1949, how the August 5, 2019 Presidential Order and J&K Reorganisation Act abrogated it, the Supreme Court 5-judge constitutional bench verdict, and how Indian central laws, domicile rules, and property rights work in J&K today.',
    primary_source: 'Indian Constitution & Supreme Court Explained',
    url: 'https://indianexpress.com/section/explained/',
    trustScore: 99,
    ai_impact_boost: 18,
    public_impact_note: 'One of the most searched constitutional & polity topics in India across students and citizens.',
  },
  {
    headline: 'Machine Learning (ML) Explained: Computer Bina Coding Ke Khud Sochna Kaise Seekhta Hai?',
    category: 'tech_auto',
    summary:
      'Genuine technical breakdown of Machine Learning (ML) vs Traditional Programming: how Training Data, Features, Supervised/Unsupervised Learning, and Neural Network weights find hidden patterns, and how Indians use ML every single day in UPI fraud detection, YouTube recommendations, Google Maps traffic, and Swiggy/Zomato ETA.',
    primary_source: 'AI & Computer Science Terminology Desk',
    url: 'https://news.google.com',
    trustScore: 98,
    ai_impact_boost: 18,
    public_impact_note: 'Most searched AI & computer science terminology among Indian students, engineers, and tech users.',
  },
  {
    headline: 'Vote Chori Issue, Voter List Deletion & EVM-VVPAT Explained: Apna Vote Kaise Check Karein?',
    category: 'delhi_civic',
    summary:
      'Detailed factual explanation of the "Vote Chori" (electoral roll manipulation / missing voter names) controversy in India: how voter addition (Form 6) and deletion (Form 7) work, how Election Commission electoral roll revision happens, how the 3-unit EVM (Ballot Unit, Control Unit, VVPAT slip) prevents tampering, and how citizens verify their EPIC voter status online.',
    primary_source: 'Election Commission of India (ECI) & Civic Explainer',
    url: 'https://indianexpress.com/section/explained/',
    trustScore: 98,
    ai_impact_boost: 18,
    public_impact_note: 'Directly explains voter list verification, Form 6/7 safeguards, and EVM-VVPAT working for crores of Indian voters.',
  },
  {
    headline: 'SSC CGL Exam Complete Explanation: Tier-1 & Tier-2 Pattern, Syllabus, Salary Aur Inspector Posts',
    category: 'sports_viral',
    summary:
      'Complete step-by-step guide to the Staff Selection Commission Combined Graduate Level (SSC CGL) exam: graduation eligibility & age limit, Tier-1 qualifying exam (Maths, Reasoning, English, GK - 200 marks), Tier-2 merit paper & computer proficiency, top Group-B & Group-C central govt posts (Income Tax Inspector, ASO in MEA/CSS, CBI Sub-Inspector, GST/Excise Inspector), and ₹45,000–₹85,000+ in-hand salary.',
    primary_source: 'SSC Official Exam & Career Guide India',
    url: 'https://ssc.gov.in',
    trustScore: 99,
    ai_impact_boost: 18,
    public_impact_note: 'Searched by over 30+ lakh Indian graduates preparing for central government officer & inspector jobs every year.',
  },
  {
    headline: 'Smartphone Virtual RAM Explained: Phone Mein 8GB+8GB Virtual RAM Speed Badhati Hai Ya Marketing Trick Hai?',
    category: 'entertainment',
    summary:
      'Hardware engineering explanation of Smartphone Virtual RAM (RAM Expansion / Memory Fusion): the real difference between ultra-fast physical LPDDR5 RAM and slower UFS flash storage swap space, why Virtual RAM only prevents background apps from closing rather than boosting gaming FPS, and how excessive swap usage affects storage lifespan.',
    primary_source: 'Mobile Hardware & Consumer Tech Explained',
    url: 'https://news.google.com',
    trustScore: 97,
    ai_impact_boost: 17,
    public_impact_note: 'Essential mobile feature explanation for 75+ crore smartphone buyers in India.',
  },
  {
    headline: 'eSIM Technology Explained: Bina Physical SIM Card Ke Phone Mein eSIM Kaise Kaam Karta Hai?',
    category: 'entertainment',
    summary:
      'How an eSIM (Embedded Subscriber Identity Module) works inside modern smartphones: how a tiny rewritable eUICC chip soldered onto the motherboard downloads Jio, Airtel, or Vi network profiles via QR code, supports multiple numbers, and stops thieves from removing the SIM card when a phone is stolen.',
    primary_source: 'Telecom & Smartphone Technology Desk',
    url: 'https://news.google.com',
    trustScore: 97,
    ai_impact_boost: 16,
    public_impact_note: 'High-utility mobile feature explanation for Indian smartphone users.',
  },
  {
    headline: 'Repo Rate & Reverse Repo Rate Explained: RBI Repo Rate Badalne Se Aapki Loan EMI Kaise Badalti Hai?',
    category: 'business_facts',
    summary:
      'Clear financial terminology breakdown of RBI Repo Rate and Reverse Repo Rate: how commercial banks borrow overnight funds from the Reserve Bank of India against government securities, how Repo Rate changes directly alter EBLR-linked home/car loan interest rates and EMIs, and how RBI uses it to control inflation.',
    primary_source: 'RBI Monetary Policy & Banking Explained',
    url: 'https://rbi.org.in',
    trustScore: 98,
    ai_impact_boost: 17,
    public_impact_note: 'Directly impacts every Indian with a home loan, car loan, education loan, or bank FD.',
  },
  {
    headline: '120W Fast Charging Explained: Kya Fast Charger Se Phone Ki Battery Jaldi Kharab Hoti Hai?',
    category: 'entertainment',
    summary:
      'Inside the physics and circuitry of 65W–120W smartphone fast charging: how dual-cell split batteries charge two cells in parallel at half voltage, how GaN chargers and charge-pump ICs reduce heat, why charging slows down after 80% (trickle phase), and how modern lithium-ion batteries retain 80% health over 800–1600 cycles.',
    primary_source: 'Smartphone Battery & Hardware Lab',
    url: 'https://news.google.com',
    trustScore: 96,
    ai_impact_boost: 16,
    public_impact_note: 'Answers the #1 battery health question searched by Indian smartphone users.',
  },
  {
    headline: 'Generative AI & LLM Explained: ChatGPT Aur Gemini Insano Ki Tarah Jawab Kaise Banate Hain?',
    category: 'tech_auto',
    summary:
      'Step-by-step explanation of Generative AI and Large Language Models (LLMs): what Tokens, Transformer self-attention architecture, and billions of neural parameters are, how AI predicts the next most probable token in milliseconds rather than copying from Google, and why AI hallucinations happen.',
    primary_source: 'AI & Deep Learning Explainer India',
    url: 'https://news.google.com',
    trustScore: 97,
    ai_impact_boost: 16,
    public_impact_note: 'Helps Indian students and professionals genuinely understand how ChatGPT and Gemini work under the hood.',
  },
  {
    headline: 'Zero FIR vs Normal FIR Explained: Kisi Bhi Police Station Mein Turant FIR Darj Karane Ka Adhikar',
    category: 'delhi_civic',
    summary:
      'Practical legal literacy guide on Zero FIR in India under Bharatiya Nagarik Suraksha Sanhita (BNSS Section 173): why police cannot refuse to register an FIR citing territorial jurisdiction, how a Zero FIR is recorded with serial number 0 and transferred to the Investigating Officer of the concerned police station, and remedies if refused.',
    primary_source: 'Indian Legal Rights & BNSS Citizen Guide',
    url: 'https://indianexpress.com/section/explained/',
    trustScore: 98,
    ai_impact_boost: 16,
    public_impact_note: 'Every Indian citizen needs to know their legal right to file a Zero FIR anywhere in India.',
  },
  {
    headline: 'CIBIL Credit Score (300–900) Explained: CIBIL Score Kaise Banta Hai Aur 750+ Se Loan Sasta Kaise Milta Hai?',
    category: 'business_facts',
    summary:
      'Complete breakdown of CIBIL Score calculation in India: the exact weightage of Repayment History (35%), Credit Utilization Ratio under 30% (30%), Credit Age & Mix of secured/unsecured loans (25%), and Hard Inquiries (10%), plus how a 750+ score unlocks lower interest rates on home and personal loans.',
    primary_source: 'Personal Finance & Banking Literacy India',
    url: 'https://news.google.com',
    trustScore: 97,
    ai_impact_boost: 16,
    public_impact_note: 'Essential credit & banking terminology for every salaried and self-employed Indian.',
  },
  {
    headline: 'UPSC Civil Services (IAS / IPS / IFS) Exam Explained: Prelims, Mains Aur Interview Ka Poora Pattern',
    category: 'sports_viral',
    summary:
      'Detailed breakdown of the UPSC CSE examination conducted in 3 stages: Prelims (GS Paper-1 cutoff + CSAT 33% qualifying), Mains (1750 marks across Essay, 4 GS papers, 2 Optional papers, plus qualifying Indian language & English), and the 275-mark Personality Test (Interview) that determines final IAS, IPS, and IFS cadre allocation out of 2025 total marks.',
    primary_source: 'UPSC Exam Pattern & Civil Services Guide',
    url: 'https://upsc.gov.in',
    trustScore: 99,
    ai_impact_boost: 17,
    public_impact_note: 'One of the most searched competitive exam explanations in India.',
  },
  {
    headline: 'UPI Architecture (NPCI, VPA & IMPS) Explained: 2 Second Mein Ek Bank Se Dusre Bank Paisa Kaise Jata Hai?',
    category: 'bollywood_celeb',
    summary:
      'How India’s Unified Payments Interface (UPI) processes 1,500+ crore transactions a month in under 2 seconds: the 4-party architecture connecting the Payer PSP App (GPay/PhonePe), NPCI Central Switch, Virtual Payment Address (VPA) mapping, and Issuer/Acquirer bank core banking settlement over IMPS.',
    primary_source: 'NPCI Digital Payments & FinTech Architecture',
    url: 'https://npci.org.in',
    trustScore: 98,
    ai_impact_boost: 16,
    public_impact_note: 'Explains the real technology behind India’s #1 daily payment system.',
  },
];

/**
 * Explainer & Topic Discovery Feeds (Indian Express Explained + Google Search India "Kya Hai / Explained")
 */
const HIGH_IMPACT_FEEDS = [
  {
    name: 'The Indian Express — Explained (Deep Topic & Policy Breakdowns)',
    category: 'delhi_civic',
    site_url: 'https://indianexpress.com/section/explained/',
    feed_url: 'https://indianexpress.com/section/explained/feed/',
    trust_score: 97,
  },
  {
    name: 'Google India Search — Polity, Constitution, Supreme Court & Civic Terms Explained',
    category: 'delhi_civic',
    site_url: 'https://news.google.com',
    feed_url:
      'https://news.google.com/rss/search?q=India+(Explained+OR+%22What+is%22+OR+%22How+it+works%22)+(Constitution+OR+Article+OR+Supreme+Court+OR+Election+OR+EVM+OR+Law+OR+Parliament)&hl=en-IN&gl=IN&ceid=IN:en',
    trust_score: 96,
  },
  {
    name: 'Google India Search — AI, Machine Learning, Smartphones & Tech Terms Explained',
    category: 'tech_auto',
    site_url: 'https://news.google.com',
    feed_url:
      'https://news.google.com/rss/search?q=India+(Explained+OR+%22What+is%22+OR+%22How+does%22)+(AI+OR+%22Machine+Learning%22+OR+Smartphone+OR+eSIM+OR+Chip+OR+Cyber+OR+Battery+OR+5G)&hl=en-IN&gl=IN&ceid=IN:en',
    trust_score: 96,
  },
  {
    name: 'Google India Search — SSC CGL, UPSC, NEET & Govt Exams Explained',
    category: 'sports_viral',
    site_url: 'https://news.google.com',
    feed_url:
      'https://news.google.com/rss/search?q=India+(%22SSC+CGL%22+OR+UPSC+OR+IBPS+OR+Exam+Pattern+OR+Syllabus+OR+Eligibility)+Explained&hl=en-IN&gl=IN&ceid=IN:en',
    trust_score: 96,
  },
  {
    name: 'Google India Search — Repo Rate, Tax, CIBIL, SIP & Money Terms Explained',
    category: 'business_facts',
    site_url: 'https://news.google.com',
    feed_url:
      'https://news.google.com/rss/search?q=India+(Explained+OR+%22What+is%22)+(RBI+OR+%22Repo+Rate%22+OR+CIBIL+OR+Income+Tax+OR+Mutual+Fund+OR+SIP+OR+GDP+OR+Inflation)&hl=en-IN&gl=IN&ceid=IN:en',
    trust_score: 96,
  },
];

/**
 * Ensures the database `news_sources` table uses our Topic Explainer & Most-Searched Terminology feeds
 */
async function syncHighImpactSources() {
  try {
    await query(
      `UPDATE news_sources
       SET is_active = FALSE
       WHERE feed_url LIKE '%livemint.com/rss/companies%'
          OR feed_url LIKE '%gadgets360.com%'
          OR feed_url LIKE '%cities/delhi%'
          OR feed_url LIKE '%espncricinfo%'`
    );

    for (const src of HIGH_IMPACT_FEEDS) {
      const existing = await query(`SELECT id FROM news_sources WHERE feed_url = $1 LIMIT 1`, [src.feed_url]);
      if (existing.rows.length === 0) {
        await query(
          `INSERT INTO news_sources (name, category, site_url, feed_url, trust_score, is_active)
           VALUES ($1, $2, $3, $4, $5, TRUE)`,
          [src.name, src.category, src.site_url, src.feed_url, src.trust_score]
        );
      } else {
        await query(
          `UPDATE news_sources
           SET name = $1, category = $2, trust_score = $3, is_active = TRUE
           WHERE id = $4`,
          [src.name, src.category, src.trust_score, existing.rows[0].id]
        );
      }
    }
  } catch (err) {
    logger.warn('Could not sync explainer topic sources', { error: err.message });
  }
}

/**
 * Strips CDATA wrappers and HTML tags from RSS XML fields
 */
function cleanXmlText(raw = '') {
  return String(raw)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;|&#8217;|&#8216;/g, "'")
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/&#8211;|&#8212;/g, '—')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts tag content from an XML block
 */
function extractTag(xmlBlock, tagName) {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = xmlBlock.match(regex);
  return match ? cleanXmlText(match[1]) : '';
}

/**
 * Parses standard RSS 2.0 <item> or Atom <entry> XML feeds
 */
function parseRssXml(xml, sourceMeta, limit = 8) {
  const items = [];
  const itemMatches = xml.match(/<(item|entry)[\s>][\s\S]*?<\/(item|entry)>/gi) || [];

  for (const block of itemMatches.slice(0, limit)) {
    let headline = extractTag(block, 'title');
    if (!headline || headline.length < 18) continue;

    let extractedSource = sourceMeta.name;
    const googleDashIdx = headline.lastIndexOf(' - ');
    if (sourceMeta.feed_url?.includes('news.google.com') && googleDashIdx > 25) {
      extractedSource = `${headline.slice(googleDashIdx + 3).trim()} (Explained)`;
      headline = headline.slice(0, googleDashIdx).trim();
    }

    let url = extractTag(block, 'link');
    if (!url) {
      const hrefMatch = block.match(/<link[^>]+href=["']([^"']+)["']/i);
      if (hrefMatch) url = hrefMatch[1];
    }

    let description =
      extractTag(block, 'description') ||
      extractTag(block, 'summary') ||
      extractTag(block, 'content:encoded');

    if (!description || description.length < 30 || description.startsWith(headline.slice(0, 25))) {
      description = `${headline}. In-depth topic & terminology explanation for Indian audiences.`;
    }

    const pubDateRaw =
      extractTag(block, 'pubDate') || extractTag(block, 'published') || extractTag(block, 'updated');
    let publishedAt = new Date().toISOString();
    if (pubDateRaw) {
      const parsedDate = new Date(pubDateRaw);
      if (!Number.isNaN(parsedDate.getTime())) {
        publishedAt = parsedDate.toISOString();
      }
    }

    items.push({
      headline,
      summary: description.slice(0, 480),
      url: url || sourceMeta.site_url,
      publishedAt,
      category: sourceMeta.category,
      sourceName: extractedSource,
      trustScore: sourceMeta.trust_score || 95,
    });
  }

  return items;
}

/**
 * Uses Gemini 2.5 Flash to generate or curate the Most-Searched Indian Explainer Topics & Terminologies
 * (Polity/Law, AI/Tech, Mobile Features, Govt Exams like SSC CGL/UPSC, Money/Banking, Science)
 * or build a deep, genuine topic breakdown for a custom user query.
 */
async function generateMostSearchedExplainerTopicsWithAI(customTopicQuery = null, categoryFilter = null) {
  if (!isGeminiConfigured()) {
    return [];
  }

  const apiKey = env.gemini.apiKey.trim();
  const isVertex = apiKey.startsWith('AQ.');
  const url = isVertex
    ? `https://aiplatform.googleapis.com/v1beta1/projects/${VERTEX_PROJECT_ID}/locations/global/publishers/google/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`
    : `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;

  const prompt = customTopicQuery
    ? `You are the Research Head for India's #1 Educational Topic & Terminology Explainer Platform.
The user wants to explain this specific topic/terminology for an Indian audience in a 45-second deep-dive video:
USER TOPIC: "${customTopicQuery}"

Create 1 primary comprehensive explainer topic card for "${customTopicQuery}" PLUS 2 closely related high-search-demand Indian terminology/topic explainer cards.
CRITICAL RULE: NEVER use Devanagari Hindi script anywhere. Write all titles in clean English + Casual Roman Hinglish (English alphabet only).
For each topic, provide:
- "headline": Clear title in English + Casual Roman Hinglish (e.g. "Article 370 Explained: J&K Se Article 370 Kaise Hata Aur Kya Badla?" or "Machine Learning Explained: Computer Bina Coding Ke Khud Sochna Kaise Seekhta Hai?")
- "category": one of ["delhi_civic", "tech_auto", "entertainment", "sports_viral", "business_facts", "bollywood_celeb"] where:
  * "delhi_civic" = Polity, Constitution, Laws & Civic Issues (Article 370, Vote Chori/EVM, Zero FIR, UCC)
  * "tech_auto" = AI, Computer Science & Tech Terms (Machine Learning, LLM, Cloud, API, Semiconductor)
  * "entertainment" = Mobile Features & Consumer Tech (Virtual RAM, eSIM, 120W Fast Charging, AMOLED vs OLED, IP68)
  * "sports_viral" = Govt Exams & Career Guides (SSC CGL, UPSC CSE, IBPS PO, NEET/JEE, NDA)
  * "business_facts" = Money, Banking & Tax Terms (Repo Rate, CIBIL Score, SIP, Index Fund, Inflation)
  * "bollywood_celeb" = Everyday Systems & Science (How UPI Works, GPS/NavIC, Doppler Radar, MRI)
- "summary": A detailed, factual 3-sentence summary in English covering: (1) Exact definition of the term/topic, (2) How its step-by-step mechanism/structure/exam pattern works with real numbers, and (3) Concrete real-life Indian impact or example.
- "primary_source": Authoritative reference source (e.g., "Indian Constitution & SC Verdict", "SSC Official Exam Guide", "IEEE / AI Architecture Desk", "RBI Monetary Policy Desk").
- "public_impact_note": 1 sentence on why lakhs/crores of Indians search for this topic.

Return ONLY valid JSON:
{
  "topics": [
    {
      "headline": "...",
      "category": "...",
      "summary": "...",
      "primary_source": "...",
      "public_impact_note": "..."
    }
  ]
}`
    : `You are the Research Head for India's #1 Topic & Terminology Explainer Channel.
Generate 8 HIGH-SEARCH-VOLUME Indian Topic & Terminology Explainer ideas${categoryFilter ? ` focused on category "${categoryFilter}"` : ' across Polity/Constitution, AI/Computer Science, Smartphone Features, Govt Exams (SSC CGL, UPSC, Banking), and Money/Banking Terms'}.
Focus ONLY on timeless or high-curiosity topics, concepts, exams, civic issues, and technical terminologies that crores of Indians search on Google/YouTube to understand in detail (NOT ephemeral daily gossip or routine politician speeches).
CRITICAL RULE: NEVER use Devanagari Hindi script anywhere. Write all titles in clean English + Casual Roman Hinglish (English alphabet only).

Category mapping:
- "delhi_civic" = Polity, Constitution, Laws & Civic Issues (e.g. Article 370, Vote Chori & EVM-VVPAT process, Zero FIR, Waqf / UCC / Delimitation, Electoral Bonds)
- "tech_auto" = AI, Computer Science & Tech Terms (e.g. Machine Learning, Deep Learning, LLM, Quantum Computing, 6G, Semiconductor Fab)
- "entertainment" = Smartphone Features & Gadgets (e.g. Virtual RAM, eSIM, 120W Fast Charging, OIS vs EIS Camera, AMOLED vs IPS LCD, IP68 Rating)
- "sports_viral" = Govt Exams & Career Guides (e.g. SSC CGL Exam Pattern & Inspector Posts, UPSC IAS/IPS Pattern, IBPS PO, Railway NTPC, NDA)
- "business_facts" = Money, Banking & Economy Terms (e.g. Repo Rate & EMI, CIBIL Score, Nifty 50 Index Fund vs SIP, Sovereign Gold Bond, Old vs New Tax Regime)
- "bollywood_celeb" = Everyday Science & Indian Digital Systems (e.g. How UPI Transfers Money in 2 Seconds, DigiYatra Facial Recognition, FASTag GPS Toll, Kavach Train Anti-Collision System)

Return ONLY valid JSON:
{
  "topics": [
    {
      "headline": "English + Casual Roman Hinglish Explainer Title (NO Devanagari script)",
      "category": "tech_auto",
      "summary": "Detailed 3-sentence factual breakdown covering definition, inner mechanism/numbers, and Indian real-life example.",
      "primary_source": "Authoritative Reference Desk",
      "public_impact_note": "Why crores of Indians search for this explanation"
    }
  ]
}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.35,
          responseMimeType: 'application/json',
          thinkingConfig: {
            thinkingBudget: 0,
          },
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`AI topic generator HTTP ${res.status}`);
    }

    const data = await res.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = JSON.parse(rawText || '{}');
    if (!Array.isArray(parsed.topics)) return [];

    return parsed.topics.map((t) => ({
      headline: String(t.headline || '')
        .replace(/[\u0900-\u097F]+/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim(),
      category: t.category || categoryFilter || 'delhi_civic',
      summary: String(t.summary || '')
        .replace(/[\u0900-\u097F]+/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim(),
      primary_source: t.primary_source || 'India Topic Explainer Desk',
      sourceName: t.primary_source || 'India Topic Explainer Desk',
      url: 'https://indianexpress.com/section/explained/',
      publishedAt: new Date().toISOString(),
      trustScore: 98,
      ai_impact_boost: customTopicQuery ? 22 : 16,
      public_impact_note: t.public_impact_note || 'High-search-volume Indian topic & terminology explainer.',
    }));
  } catch (err) {
    logger.warn('AI topic discovery skipped; using curated most-searched Indian topics', {
      error: err.message,
    });
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Creates or upserts a single custom Explainer Topic directly from a user's topic/terminology input
 * (e.g., "Article 370", "Machine Learning", "Vote chori issue", "SSC CGL exam", "Mobile Virtual RAM")
 * and returns the stored database row immediately.
 */
async function createCustomExplainerTopic({ queryText, category = null }) {
  const cleanQuery = String(queryText || '')
    .replace(/[\u0900-\u097F]+/g, '')
    .trim();
  if (!cleanQuery) {
    throw new Error('Topic or terminology name is required');
  }

  // First check if one of our curated or AI-generated topics matches or generate a rich breakdown via Gemini
  const aiTopics = await generateMostSearchedExplainerTopicsWithAI(cleanQuery, category);
  const primary = aiTopics[0] || {
    headline: `${cleanQuery} Explained: Easy Hinglish Mein Poora Sach Aur Asli Working Mechanism`,
    category: category || 'delhi_civic',
    summary: `Comprehensive 45-second Indian explainer on "${cleanQuery}": definition, origin and core structure, step-by-step inner working mechanism, real-world numbers, and why every Indian should understand it.`,
    primary_source: 'Verified India Topic Explainer Desk',
    sourceName: 'Verified India Topic Explainer Desk',
    url: 'https://indianexpress.com/section/explained/',
    publishedAt: new Date().toISOString(),
    trustScore: 99,
    ai_impact_boost: 24,
    public_impact_note: `Custom requested topic explainer: ${cleanQuery}`,
  };

  const cluster = {
    headline: primary.headline,
    fingerprint: createFingerprint(primary.headline),
    category: category || primary.category || 'delhi_civic',
    summary: primary.summary,
    primary_source: primary.primary_source || 'India Topic Explainer Desk',
    trust_score: 99,
    published_at: new Date().toISOString(),
    ai_impact_boost: 24,
    public_impact_note: primary.public_impact_note,
    source_urls: [
      {
        title: primary.headline,
        url: primary.url || 'https://indianexpress.com/section/explained/',
        source: primary.primary_source || 'India Topic Explainer Desk',
        publishedAt: new Date().toISOString(),
      },
    ],
  };

  const scored = scoreAndVerifyStory(cluster);
  scored.overall_score = 99.0;

  await query(`UPDATE trending_topics SET is_recommended = FALSE`);

  const upsertRes = await query(
    `INSERT INTO trending_topics (
      headline, fingerprint, category, summary, primary_source, source_urls,
      published_at, freshness_score, relevance_score, interest_score,
      credibility_score, visual_storytelling_score, explanatory_value_score,
      overall_score, verification_status, verification_notes, status, is_recommended
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,TRUE)
    ON CONFLICT (fingerprint) DO UPDATE SET
      headline = EXCLUDED.headline,
      category = EXCLUDED.category,
      summary = EXCLUDED.summary,
      primary_source = EXCLUDED.primary_source,
      overall_score = 99.0,
      verification_status = 'verified',
      verification_notes = EXCLUDED.verification_notes,
      is_recommended = TRUE,
      updated_at = NOW()
    RETURNING *`,
    [
      scored.headline,
      scored.fingerprint,
      scored.category,
      scored.summary,
      scored.primary_source,
      JSON.stringify(scored.source_urls),
      scored.published_at,
      scored.freshness_score,
      scored.relevance_score,
      scored.interest_score,
      scored.credibility_score,
      scored.visual_storytelling_score,
      scored.explanatory_value_score,
      scored.overall_score,
      'verified',
      scored.verification_notes,
      'discovered',
    ]
  );

  return upsertRes.rows[0];
}

/**
 * Discovers, curates, and stores India's Most-Searched Explainer Topics & Terminologies
 * (combining curated flagship topics like Article 370, Machine Learning, Vote Chori, SSC CGL,
 * Mobile Features + Gemini AI most-searched topic discovery + live "Explained" RSS feeds).
 */
async function discoverAndStoreTrends(options = {}) {
  const { categoryFilter = null, maxPerSource = 5, customTopicQuery = null } = options;

  await syncHighImpactSources();

  // 1. Always start with our flagship Most-Searched Indian Explainer Topics
  const curatedFlagshipArticles = MOST_SEARCHED_INDIAN_TOPICS.filter(
    (t) => !categoryFilter || t.category === categoryFilter
  ).map((t) => ({
    headline: t.headline,
    summary: t.summary,
    url: t.url,
    publishedAt: new Date().toISOString(),
    category: t.category,
    sourceName: t.primary_source,
    trustScore: t.trustScore || 98,
    ai_impact_boost: t.ai_impact_boost || 18,
    public_impact_note: t.public_impact_note,
  }));

  // 2. Generate fresh Most-Searched Indian Topics via Gemini AI (especially if customTopicQuery is given)
  const aiDiscoveredTopics = await generateMostSearchedExplainerTopicsWithAI(
    customTopicQuery,
    categoryFilter
  );

  // 3. Also fetch "Explained" feeds for timely explainer concepts
  const sourcesRes = await query(
    `SELECT * FROM news_sources
     WHERE is_active = TRUE
     ${categoryFilter ? 'AND category = $1' : ''}
     ORDER BY trust_score DESC`,
    categoryFilter ? [categoryFilter] : []
  );

  const sources = [...sourcesRes.rows];
  if (customTopicQuery && String(customTopicQuery).trim().length > 1) {
    const q = encodeURIComponent(`${String(customTopicQuery).trim()} Explained India`);
    sources.unshift({
      id: null,
      name: `India Topic Search (${customTopicQuery})`,
      category: categoryFilter || 'delhi_civic',
      site_url: 'https://news.google.com',
      feed_url: `https://news.google.com/rss/search?q=${q}&hl=en-IN&gl=IN&ceid=IN:en`,
      trust_score: 97,
    });
  }

  const perFeedArticles = [];
  const feedErrors = [];

  await Promise.all(
    sources.map(async (source) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 7500);
      try {
        const res = await fetch(source.feed_url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            Accept: 'application/rss+xml, application/xml, text/xml, */*',
          },
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const xml = await res.text();
        const parsed = parseRssXml(xml, source, maxPerSource);
        perFeedArticles.push(parsed);

        if (source.id) {
          await query(`UPDATE news_sources SET last_fetched_at = NOW() WHERE id = $1`, [source.id]);
        }
      } catch (err) {
        feedErrors.push({ source: source.name, error: err.message });
      } finally {
        clearTimeout(timeout);
      }
    })
  );

  const collectedArticles = [
    ...aiDiscoveredTopics,
    ...curatedFlagshipArticles,
  ];
  for (let i = 0; i < maxPerSource; i += 1) {
    for (const feedList of perFeedArticles) {
      if (feedList[i]) {
        collectedArticles.push(feedList[i]);
      }
    }
  }

  const deduplicated = deduplicateStories(collectedArticles);
  const scoredStories = deduplicated
    .map(scoreAndVerifyStory)
    .filter((s) => !s.is_niche_filtered);

  const selectedFingerprints = scoredStories.map((s) => s.fingerprint);

  if (selectedFingerprints.length >= 6 && !customTopicQuery && !categoryFilter) {
    await query(
      `DELETE FROM trending_topics t
       WHERE NOT EXISTS (SELECT 1 FROM videos v WHERE v.topic_id = t.id)
         AND NOT (t.fingerprint = ANY($1::text[]))`,
      [selectedFingerprints]
    );
  }

  let insertedCount = 0;
  let updatedCount = 0;

  for (const story of scoredStories) {
    const existing = await query(`SELECT id FROM trending_topics WHERE fingerprint = $1 LIMIT 1`, [
      story.fingerprint,
    ]);
    const isNew = existing.rows.length === 0;

    await query(
      `INSERT INTO trending_topics (
        headline, fingerprint, category, summary, primary_source, source_urls,
        published_at, freshness_score, relevance_score, interest_score,
        credibility_score, visual_storytelling_score, explanatory_value_score,
        overall_score, verification_status, verification_notes, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      ON CONFLICT (fingerprint) DO UPDATE SET
        headline = EXCLUDED.headline,
        category = EXCLUDED.category,
        summary = EXCLUDED.summary,
        primary_source = EXCLUDED.primary_source,
        source_urls = EXCLUDED.source_urls,
        freshness_score = EXCLUDED.freshness_score,
        relevance_score = EXCLUDED.relevance_score,
        interest_score = EXCLUDED.interest_score,
        credibility_score = EXCLUDED.credibility_score,
        visual_storytelling_score = EXCLUDED.visual_storytelling_score,
        explanatory_value_score = EXCLUDED.explanatory_value_score,
        overall_score = EXCLUDED.overall_score,
        verification_notes = EXCLUDED.verification_notes,
        updated_at = NOW()`,
      [
        story.headline,
        story.fingerprint,
        story.category,
        story.summary,
        story.primary_source,
        JSON.stringify(story.source_urls),
        story.published_at,
        story.freshness_score,
        story.relevance_score,
        story.interest_score,
        story.credibility_score,
        story.visual_storytelling_score,
        story.explanatory_value_score,
        story.overall_score,
        story.verification_status,
        story.verification_notes,
        story.status,
      ]
    );

    if (isNew) {
      insertedCount += 1;
    } else {
      updatedCount += 1;
    }
  }

  // Mark the #1 highest-scoring topic as Top Pick
  await query(`UPDATE trending_topics SET is_recommended = FALSE`);
  const topCandidateRes = await query(
    `UPDATE trending_topics
     SET is_recommended = TRUE
     WHERE id = (
       SELECT id FROM trending_topics
       WHERE verification_status = 'verified' AND status != 'flagged'
       ORDER BY overall_score DESC, published_at DESC
       LIMIT 1
     )
     RETURNING *`
  );

  return {
    sourcesChecked: sources.length,
    feedsFetched: sources.length - feedErrors.length,
    rawArticlesFetched: collectedArticles.length,
    rawCount: collectedArticles.length,
    deduplicatedCount: scoredStories.length,
    upsertedCount: insertedCount + updatedCount,
    inserted: insertedCount,
    updated: updatedCount,
    feedErrors,
    recommendedCandidate: topCandidateRes.rows[0] || null,
  };
}

module.exports = {
  MOST_SEARCHED_INDIAN_TOPICS,
  discoverAndStoreTrends,
  createCustomExplainerTopic,
  parseRssXml,
};
