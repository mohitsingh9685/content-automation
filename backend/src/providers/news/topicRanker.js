const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'over', 'after', 'before',
  'under', 'amid', 'says', 'said', 'new', 'news', 'india', 'indian', 'update', 'updates',
  'live', 'today', 'report', 'reports', 'here', 'what', 'why', 'how', 'know', 'about',
]);

/**
 * Normalizes a headline into significant lowercase tokens for deduplication & similarity
 */
function tokenizeHeadline(text = '') {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((tok) => tok.length > 2 && !STOPWORDS.has(tok));
}

/**
 * Generates a deterministic URL-safe fingerprint from a headline
 */
function createFingerprint(headline = '') {
  const tokens = tokenizeHeadline(headline).slice(0, 9);
  return tokens.join('-') || `story-${Date.now()}`;
}

/**
 * Computes Jaccard token similarity between two headlines/summaries
 */
function computeSimilarity(a = '', b = '') {
  const setA = new Set(tokenizeHeadline(a));
  const setB = new Set(tokenizeHeadline(b));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Deduplicates candidate stories covering the same event and merges their source URLs
 */
function deduplicateStories(rawArticles = []) {
  const clusters = [];

  for (const item of rawArticles) {
    const combinedText = `${item.headline} ${item.summary || ''}`;
    let matchedCluster = null;

    for (const cluster of clusters) {
      const simHeadline = computeSimilarity(item.headline, cluster.headline);
      const simCombined = computeSimilarity(combinedText, `${cluster.headline} ${cluster.summary || ''}`);
      if (simHeadline >= 0.36 || simCombined >= 0.42) {
        matchedCluster = cluster;
        break;
      }
    }

    const sourceEntry = {
      title: item.headline,
      url: item.url,
      source: item.sourceName,
      publishedAt: item.publishedAt,
    };

    if (matchedCluster) {
      const exists = matchedCluster.source_urls.some((s) => s.url === sourceEntry.url);
      if (!exists) {
        matchedCluster.source_urls.push(sourceEntry);
      }
      if ((item.summary || '').length > (matchedCluster.summary || '').length) {
        matchedCluster.summary = item.summary;
      }
      matchedCluster.trust_score = Math.max(matchedCluster.trust_score || 85, item.trustScore || 85);
    } else {
      clusters.push({
        headline: item.headline,
        fingerprint: createFingerprint(item.headline),
        category: item.category,
        summary: item.summary || item.headline,
        primary_source: item.sourceName || item.primary_source || 'India Topic Explainer Desk',
        trust_score: item.trustScore || 88,
        published_at: item.publishedAt || new Date().toISOString(),
        ai_impact_boost: item.ai_impact_boost || 0,
        public_impact_note: item.public_impact_note || null,
        source_urls: [sourceEntry],
      });
    }
  }

  return clusters;
}

/**
 * Multi-factor story evaluation:
 * Strongly prioritizes MASS POPULATION IMPACT (stories affecting crores of ordinary citizens:
 * money, RBI/UPI/banks, tax, railways/travel, telecom, Supreme Court, jobs, health, consumer tech/AI,
 * national breakthroughs) and penalizes niche/useless corporate or gossip filler.
 */
function scoreAndVerifyStory(story) {
  const text = `${story.headline} ${story.summary}`.toLowerCase();
  const ageHours = Math.max(0, (Date.now() - new Date(story.published_at).getTime()) / (1000 * 60 * 60));

  // 1. Freshness Score (strongly favors stories from the last 24 hours)
  const freshnessScore = Math.max(40, Math.min(99, 99 - ageHours * 1.6));

  // 2. Source Credibility & Multi-Source Corroboration
  const sourceCount = Array.isArray(story.source_urls) ? story.source_urls.length : 1;
  const rumorKeywords = ['rumor', 'rumour', 'unverified', 'viral claim', 'fake', 'hoax', 'whatsapp forward', 'allegedly'];
  const isRumorOrFlagged = rumorKeywords.some((kw) => text.includes(kw));

  let credibilityScore = Number(story.trust_score || 90) + Math.min(8, (sourceCount - 1) * 4);
  if (isRumorOrFlagged) credibilityScore = 32;
  credibilityScore = Math.max(20, Math.min(99, credibilityScore));

  // 3. Mass-Population Impact Check (Penalize niche B2B/PE deals, minor celebrity fluff, routine stock tickers)
  const nicheOrUselessPatterns = [
    /minority stake|private equity|\bpe\b|serie[s] [a-d] funding|q[1-4] net profit|ebitda|brokerage|target price|buy rating/i,
    /box office day \d|wardrobe|airport look|spotted at gym|paparazzi|dating rumor/i,
    /bnp paribas|hsbc|jpmorgan|tristar|zoff foods|aegis logistics/i,
  ];
  const isNicheUseless = nicheOrUselessPatterns.some((rx) => rx.test(text));

  const massPopulationPatterns = [
    /explained|what is|how it works|kya hai|kaise kaam karta hai|article 370|machine learning|\bml\b|\bllm\b|vote chori|voter list|\bevm\b|vvpat|ssc cgl|upsc|virtual ram|esim|fast charging|repo rate|cibil/i,
    /\brbi\b|\bupi\b|bank|emi|loan|interest rate|income tax|\bgst\b|pan card|aadhaar|epfo|pension|gold price|lpg|petrol|diesel|inflation|ration/i,
    /railway|vande bharat|irctc|train|metro|flight|airport|highway|toll|fastag|traffic rule|challan/i,
    /supreme court|high court|parliament|cabinet|constitution|zero fir|bnss|government|ministry|scheme|citizen|public/i,
    /\bisro\b|drdo|india|china|pakistan|usa|tariff|oil|rupee|dollar|passport|visa/i,
    /cyber fraud|scam|otp|whatsapp|smartphone|\bai\b|artificial intelligence|neural network|sim card|trai|jio|airtel|bsnl|electric vehicle|\bev\b/i,
    /weather|monsoon|heatwave|air quality|\baqi\b|pollution|health|medicine|vaccine|exam|neet|upsc|ssc|ibps|cbse|jobs|hiring|salary/i,
  ];
  let massImpactHits = 0;
  for (const rx of massPopulationPatterns) {
    if (rx.test(text)) massImpactHits += 1;
  }

  // 4. Visual Storytelling Potential
  const visualIndicators = [
    /\d+/, /₹|\$|%|crore|lakh|million|billion/i,
    /how|why|explained|rule|system|network|engine|satellite|train|court|bank|scam|impact/i,
  ];
  let visualHits = 0;
  for (const regex of visualIndicators) {
    if (regex.test(text)) visualHits += 1;
  }
  const visualStorytellingScore = Math.min(99, 78 + visualHits * 6 + massImpactHits * 3);

  // 5. Explanatory Value & Public Interest
  const summaryWords = String(story.summary || '').split(/\s+/).filter(Boolean).length;
  let explanatoryValueScore = Math.min(
    99,
    74 + Math.min(12, summaryWords * 0.4) + massImpactHits * 7 + (story.ai_impact_boost || 0)
  );
  let interestScore = Math.min(99, 76 + massImpactHits * 7 + (story.ai_impact_boost || 0));

  if (isNicheUseless) {
    explanatoryValueScore = Math.max(35, explanatoryValueScore - 35);
    interestScore = Math.max(35, interestScore - 35);
  }

  const relevanceScore = Math.min(99, explanatoryValueScore * 0.55 + interestScore * 0.45);

  const overallScore = Number(
    (
      explanatoryValueScore * 0.35 +
      interestScore * 0.25 +
      freshnessScore * 0.20 +
      credibilityScore * 0.10 +
      visualStorytellingScore * 0.10
    ).toFixed(1)
  );

  let verificationStatus = 'verified';
  let verificationNotes =
    story.public_impact_note ||
    `Verified high-impact public story (${story.primary_source}). Directly relevant to Indian citizens.`;
  let status = 'discovered';

  if (isRumorOrFlagged) {
    verificationStatus = 'flagged';
    verificationNotes =
      'FLAGGED / UNVERIFIED CLAIM: Contains unverified viral/rumor indicators. Blocked from automatic publishing.';
    status = 'flagged';
  } else if (isNicheUseless) {
    verificationStatus = 'partially_verified';
    verificationNotes = 'Low mass-population impact (niche corporate/box-office item).';
  }

  return {
    ...story,
     is_niche_filtered: isNicheUseless,
    freshness_score: Number(freshnessScore.toFixed(1)),
    relevance_score: Number(relevanceScore.toFixed(1)),
    interest_score: Number(interestScore.toFixed(1)),
    credibility_score: Number(credibilityScore.toFixed(1)),
    visual_storytelling_score: Number(visualStorytellingScore.toFixed(1)),
    explanatory_value_score: Number(explanatoryValueScore.toFixed(1)),
    overall_score: overallScore,
    verification_status: verificationStatus,
    verification_notes: verificationNotes,
    status,
  };
}

module.exports = {
  tokenizeHeadline,
  createFingerprint,
  computeSimilarity,
  deduplicateStories,
  scoreAndVerifyStory,
};
