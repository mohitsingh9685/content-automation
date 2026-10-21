import React, { useEffect, useState } from 'react';
import {
  Sparkles,
  ExternalLink,
  ShieldAlert,
  Search,
  Clock,
  Clapperboard,
  RefreshCw,
  Award,
  Radio,
  Trash2,
  BookOpen,
  EyeOff,
  UserCheck,
  PlusCircle,
} from 'lucide-react';
import { api } from '../api/client';
import { StatusBadge, CATEGORY_LABELS } from '../components/StatusBadge';

const CATEGORY_TABS = [
  { id: 'all', label: 'All Most-Searched Topics' },
  { id: 'delhi_civic', label: 'Polity, Law & Civic (Article 370, EVM)' },
  { id: 'tech_auto', label: 'AI, CS & Tech (Machine Learning)' },
  { id: 'entertainment', label: 'Mobile Features (Virtual RAM, eSIM)' },
  { id: 'sports_viral', label: 'Govt Exams (SSC CGL, UPSC)' },
  { id: 'business_facts', label: 'Money, RBI & Banking (Repo Rate)' },
  { id: 'bollywood_celeb', label: 'Everyday Science & UPI' },
];

const QUICK_TOPIC_SUGGESTIONS = [
  { label: 'Article 370 & 35A Explained', query: 'Article 370 and 35A Constitutional History & Abrogation Explained', category: 'delhi_civic' },
  { label: 'Machine Learning (ML) Explained', query: 'Machine Learning (ML) Explained: How AI Algorithms Learn from Data', category: 'tech_auto' },
  { label: 'Vote Chori Issue & EVM-VVPAT', query: 'Vote Chori Issue, Voter List Deletion & EVM-VVPAT Verification Explained', category: 'delhi_civic' },
  { label: 'SSC CGL Exam Complete Guide', query: 'SSC CGL Exam Complete Explanation: Tier-1/Tier-2 Pattern, Syllabus, Salary & Inspector Posts', category: 'sports_viral' },
  { label: 'Mobile Virtual RAM / RAM Boost', query: 'Smartphone Virtual RAM / Extended RAM Boost Feature Explained: Real Speed or Marketing?', category: 'entertainment' },
  { label: 'eSIM vs Physical SIM Card', query: 'eSIM Technology in Smartphones Explained: How Digital SIM Profiles & Security Work', category: 'entertainment' },
  { label: 'RBI Repo Rate & Home Loan EMI', query: 'Repo Rate & Reverse Repo Rate Explained: How RBI Controls Inflation and Your Home Loan EMI', category: 'business_facts' },
  { label: 'Zero FIR vs Normal FIR', query: 'Zero FIR vs Normal FIR Explained under Bharatiya Nagarik Suraksha Sanhita (BNSS)', category: 'delhi_civic' },
];

export function TrendingTopicsPage({ onOpenVideoInStudio }) {
  const [topics, setTopics] = useState([]);
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [presenterMode, setPresenterMode] = useState('faceless');
  const [customQuery, setCustomQuery] = useState('');
  const [customCategory, setCustomCategory] = useState('delhi_civic');
  const [creatingCustom, setCreatingCustom] = useState(false);
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [generatingTopicId, setGeneratingTopicId] = useState(null);
  const [feedback, setFeedback] = useState(null);

  const loadTrends = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const data = await api.getTrends({
        category,
        search,
      });
      setTopics(data.topics || []);
    } catch (err) {
      if (!silent) setFeedback({ type: 'error', message: err.message });
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadTrends();
  }, [category]);

  // Poll every 2s when any topic is actively generating a video
  useEffect(() => {
    const anyActive =
      generatingTopicId !== null ||
      topics.some((t) => t.render_progress?.active || t.status === 'generating');
    if (!anyActive) return;

    const timer = setInterval(async () => {
      try {
        const data = await api.getTrends({ category, search });
        const nextTopics = data.topics || [];
        setTopics(nextTopics);

        if (generatingTopicId) {
          const tracked = nextTopics.find((t) => t.id === generatingTopicId);
          if (tracked && tracked.latest_video_id && !tracked.render_progress?.active) {
            setGeneratingTopicId(null);
            if (onOpenVideoInStudio) {
              onOpenVideoInStudio(tracked.latest_video_id);
            }
          }
        }
      } catch (_) {
        // ignore transient poll error
      }
    }, 2000);

    return () => clearInterval(timer);
  }, [generatingTopicId, topics, category, search]);

  const handleDiscoverLiveRss = async () => {
    try {
      setDiscovering(true);
      setFeedback(null);
      const res = await api.discoverLiveTrends(search.trim() ? { query: search.trim() } : {});
      const s = res.stats || {};
      const curatedCount = s.deduplicatedCount ?? s.upsertedCount ?? s.inserted ?? 0;
      setFeedback({
        type: 'success',
        message: `Curated ${curatedCount} most-searched Indian topics & terminologies (Polity, AI/ML, Mobile Features, SSC/UPSC Exams, RBI & Finance) ready for 45-second explainer videos.`,
      });
      await loadTrends();
    } catch (err) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setDiscovering(false);
    }
  };

  const handleCreateCustomTopic = async (autoGenerateVideo = false, overrideQuery = null, overrideCategory = null) => {
    const targetQuery = (overrideQuery ?? customQuery).trim();
    const targetCategory = overrideCategory ?? customCategory;
    if (!targetQuery || targetQuery.length < 2) {
      setFeedback({
        type: 'error',
        message: 'Please enter a topic or terminology to explain (e.g., "Article 370", "Machine Learning", "SSC CGL").',
      });
      return;
    }

    try {
      setCreatingCustom(true);
      setFeedback({
        type: 'success',
        message: autoGenerateVideo
          ? `Researching "${targetQuery}" & generating a genuine 45-second (${presenterMode === 'faceless' ? 'Faceless 3D Visual' : 'With Studio Presenter'}) Hindi explainer video...`
          : `Researching & adding verified Indian explainer topic: "${targetQuery}"...`,
      });
      const res = await api.createCustomTopic({
        query: targetQuery,
        category: targetCategory,
        generateNow: autoGenerateVideo,
        autoGenerateVideo,
        presenterMode,
      });
      setCustomQuery('');
      if (autoGenerateVideo && res.topic?.id) {
        setGeneratingTopicId(res.topic.id);
      }
      await loadTrends(true);
    } catch (err) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setCreatingCustom(false);
    }
  };

  const handleGenerateVideo = async (topic, modeOverride = null) => {
    const modeToUse = modeOverride || presenterMode;
    try {
      setGeneratingTopicId(topic.id);
      setFeedback({
        type: 'success',
        message: `Creating genuine 45-second (${modeToUse === 'faceless' ? 'Faceless 3D Visuals • No Face' : 'Studio Presenter'}) Hindi explainer video for "${topic.headline.slice(0, 55)}..."`,
      });
      await api.generateVideoFromTrend(topic.id, {
        videoFormat: '9:16',
        presenterMode: modeToUse,
        autoRender: true,
      });
      await loadTrends(true);
    } catch (err) {
      setFeedback({ type: 'error', message: err.message });
      setGeneratingTopicId(null);
    }
  };

  const handleDeleteIdea = async (topic) => {
    const confirmed = window.confirm(
      `Delete this topic ("${topic.headline.slice(0, 60)}") and any draft video attached to it?`
    );
    if (!confirmed) return;
    try {
      await api.deleteTrend(topic.id);
      setTopics((prev) => prev.filter((t) => t.id !== topic.id));
      setFeedback({
        type: 'success',
        message: `Deleted topic: "${topic.headline.slice(0, 50)}..."`,
      });
    } catch (err) {
      setFeedback({ type: 'error', message: err.message });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header + Face Mode Toggle */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 text-xs font-semibold mb-2">
            <BookOpen className="w-3.5 h-3.5" />
            Most-Searched Indian Topic &amp; Terminology Explainer (45-Second Deep Dive)
          </div>
          <h1 className="text-2xl font-bold text-white">
            Topics &amp; Terminologies Explained for India
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Genuine, fact-packed 45-second (5 scenes × 9s) Hindi/Hinglish explanations of Polity, Law, Machine Learning, Mobile Features, SSC/UPSC Exams &amp; Finance.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Faceless vs With Face Mode Selector */}
          <div className="inline-flex items-center rounded-xl bg-slate-900 p-1 border border-slate-800">
            <button
              type="button"
              onClick={() => setPresenterMode('faceless')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                presenterMode === 'faceless'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Pure 3D Educational Cutaways & Diagrams with Zero Human Face"
            >
              <EyeOff className="w-3.5 h-3.5" />
              Faceless 3D Visuals (No Face)
            </button>
            <button
              type="button"
              onClick={() => setPresenterMode('with_face')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                presenterMode === 'with_face'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Include AI Educator Aashi in Scene 1"
            >
              <UserCheck className="w-3.5 h-3.5" />
              With Presenter Face
            </button>
          </div>

          <button
            onClick={handleDiscoverLiveRss}
            disabled={discovering}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold shadow transition cursor-pointer"
          >
            <Radio className={`w-4 h-4 ${discovering ? 'animate-ping' : ''}`} />
            {discovering ? 'Curating Topics...' : 'Refresh Most-Searched Topics'}
          </button>

          <button
            onClick={() => loadTrends()}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
            title="Refresh list"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Custom Topic / Terminology Creator Card */}
      <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-950/50 via-slate-900 to-slate-900 border border-indigo-500/40 space-y-4 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <PlusCircle className="w-4 h-4 text-emerald-400" />
              Explain Any Topic, Terminology, Exam or Mobile Feature in 45 Seconds
            </h2>
            <p className="text-xs text-slate-300 mt-0.5">
              Type any topic Indians search for (e.g., Article 370, Machine Learning, Vote Chori &amp; EVM-VVPAT, SSC CGL Exam, Virtual RAM, eSIM) or click a quick chip below:
            </p>
          </div>
          <span className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold self-start sm:self-center">
            Mode: {presenterMode === 'faceless' ? 'Faceless 3D Visuals (45s)' : 'With Presenter Face'}
          </span>
        </div>

        {/* Quick Topic Chips */}
        <div className="flex flex-wrap gap-2">
          {QUICK_TOPIC_SUGGESTIONS.map((chip, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setCustomQuery(chip.query);
                setCustomCategory(chip.category);
              }}
              className="text-xs px-3 py-1.5 rounded-xl bg-slate-950/90 hover:bg-indigo-950/80 text-indigo-200 border border-indigo-500/30 transition cursor-pointer"
            >
              + {chip.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2.5">
          <input
            type="text"
            value={customQuery}
            onChange={(e) => setCustomQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateCustomTopic(false)}
            placeholder="Type any topic or term to explain (e.g., Article 370, Machine Learning, Vote Chori issue, SSC CGL, eSIM, 120W Fast Charging)..."
            className="flex-1 bg-slate-950 border border-indigo-500/40 focus:border-indigo-400 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none"
          />

          <select
            value={customCategory}
            onChange={(e) => setCustomCategory(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-200 cursor-pointer"
          >
            <option value="delhi_civic">Polity, Law &amp; Civic</option>
            <option value="tech_auto">AI, CS &amp; Tech Terms</option>
            <option value="entertainment">Mobile Features &amp; Gadgets</option>
            <option value="sports_viral">Govt Exams (SSC CGL, UPSC)</option>
            <option value="business_facts">Money, RBI &amp; Banking</option>
            <option value="bollywood_celeb">Everyday Science &amp; UPI</option>
          </select>

          <button
            type="button"
            onClick={() => handleCreateCustomTopic(false)}
            disabled={creatingCustom}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs sm:text-sm font-semibold border border-slate-700 whitespace-nowrap transition cursor-pointer"
          >
            <PlusCircle className="w-4 h-4 text-indigo-400" />
            {creatingCustom ? 'Adding...' : 'Add Topic Card'}
          </button>

          <button
            type="button"
            onClick={() => handleCreateCustomTopic(true)}
            disabled={creatingCustom}
            className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-semibold whitespace-nowrap shadow-lg transition cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            {creatingCustom ? 'Starting 45s Video...' : 'Explain in 45s Video Now'}
          </button>
        </div>
      </div>

      {/* Category Pills & Search */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {CATEGORY_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setCategory(tab.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                category === tab.id
                  ? 'bg-indigo-600 text-white shadow'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 rounded-xl px-3.5 py-2.5">
          <Search className="w-4 h-4 text-slate-500 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadTrends()}
            placeholder="Filter topics (e.g. Article 370, Machine Learning, Vote Chori, SSC CGL, Virtual RAM, eSIM, Repo Rate)... Press Enter"
            className="bg-transparent text-sm text-white focus:outline-none w-full"
          />
          {search && (
            <button
              onClick={() => {
                setSearch('');
                setTimeout(() => loadTrends(), 50);
              }}
              className="text-xs text-slate-400 hover:text-white"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-xl border text-sm ${
            feedback.type === 'error'
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* Clean Topic Explainer List */}
      <div className="space-y-4">
        {topics.map((topic) => {
          const isFlagged =
            topic.verification_status === 'flagged' || topic.verification_status === 'disputed';
          const isRecommended = Boolean(topic.is_recommended);
          const sourceList = Array.isArray(topic.source_urls) ? topic.source_urls : [];
          const hasVideo = Boolean(topic.latest_video_id);
          const isGenerating =
            generatingTopicId === topic.id ||
            Boolean(topic.render_progress?.active) ||
            topic.status === 'generating';
          const progressPercent = topic.render_progress?.percent ?? (isGenerating ? 8 : 0);
          const progressStage =
            topic.render_progress?.stage ||
            'Generating 45s Genuine Hindi Explainer Script & Parallel 3D Video...';

          return (
            <div
              key={topic.id}
              className={`p-5 rounded-2xl border transition space-y-4 ${
                isFlagged
                  ? 'bg-rose-950/15 border-rose-500/30'
                  : isRecommended
                    ? 'bg-gradient-to-r from-slate-900 via-indigo-950/30 to-slate-900 border-indigo-500/40 shadow-lg'
                    : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                <div className="space-y-2.5 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {isRecommended && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-bold">
                        <Award className="w-3.5 h-3.5" />
                        Most Searched
                      </span>
                    )}
                    <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 text-xs font-medium">
                      {CATEGORY_LABELS[topic.category] || topic.category}
                    </span>
                    <StatusBadge status={topic.verification_status} />
                    <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                      <Clock className="w-3.5 h-3.5" />
                      {topic.primary_source}
                    </span>
                  </div>

                  <h3 className="text-base sm:text-lg font-bold text-white leading-snug">
                    {topic.headline}
                  </h3>
                  <p className="text-sm text-slate-300 leading-relaxed line-clamp-3">
                    {topic.summary}
                  </p>

                  {/* Source links */}
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    {sourceList.slice(0, 2).map((src, idx) => (
                      <a
                        key={idx}
                        href={src.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300"
                      >
                        {src.source || 'Reference Source'}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ))}
                    {isFlagged && topic.verification_notes && (
                      <span className="inline-flex items-center gap-1 text-xs text-rose-300">
                        <ShieldAlert className="w-3.5 h-3.5" />
                        {topic.verification_notes}
                      </span>
                    )}
                  </div>
                </div>

                {/* Action Area: Open/Create + Delete Topic */}
                <div className="flex flex-wrap items-center gap-2.5 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-800">
                  {hasVideo ? (
                    <>
                      <button
                        onClick={() => onOpenVideoInStudio(topic.latest_video_id)}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-semibold shadow-md transition cursor-pointer"
                      >
                        <Clapperboard className="w-4 h-4" />
                        Open 45s Explainer
                      </button>
                      <button
                        onClick={() => handleGenerateVideo(topic)}
                        disabled={isGenerating}
                        title={`Regenerate as ${presenterMode === 'faceless' ? 'Faceless 3D Visuals (45s)' : 'With Presenter Face'}`}
                        className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                        {isGenerating ? `${progressPercent}%...` : 'Redo 45s'}
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleGenerateVideo(topic)}
                      disabled={isGenerating || isFlagged}
                      className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer ${
                        isFlagged
                          ? 'bg-rose-950/40 text-rose-400 border border-rose-500/30 cursor-not-allowed'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md'
                      }`}
                    >
                      {presenterMode === 'faceless' ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Sparkles className="w-4 h-4" />
                      )}
                      {isFlagged
                        ? 'Unverified (Blocked)'
                        : isGenerating
                          ? `Creating (${progressPercent}%)...`
                          : presenterMode === 'faceless'
                            ? 'Explain in 45s (Faceless 3D)'
                            : 'Explain in Video (With Face)'}
                    </button>
                  )}

                  <button
                    onClick={() => handleDeleteIdea(topic)}
                    title="Delete this Topic"
                    className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-rose-950/40 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 text-xs font-semibold transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                </div>
              </div>

              {/* Live Creation Percentage Progress Bar on Topic Card */}
              {isGenerating && (
                <div className="p-3.5 rounded-xl bg-indigo-950/40 border border-indigo-500/40 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-indigo-200 font-semibold flex items-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                      {progressStage}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-indigo-600 text-white font-bold">
                      {progressPercent}%
                    </span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-slate-950 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400 transition-all duration-500 rounded-full"
                      style={{ width: `${Math.max(5, Math.min(100, progressPercent))}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
