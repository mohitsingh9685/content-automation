import React, { useEffect, useState } from 'react';
import {
  Flame,
  Clapperboard,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  Play,
  Download,
  ArrowRight,
  Award,
  Trash2,
} from 'lucide-react';
import { api } from '../api/client';
import { StatusBadge, CATEGORY_LABELS } from '../components/StatusBadge';

export function DashboardPage({ onNavigate, onOpenVideoInStudio }) {
  const [summary, setSummary] = useState(null);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError('');
      const [summaryData, videosData] = await Promise.all([
        api.getDashboardSummary(),
        api.getVideos(),
      ]);
      setSummary(summaryData);
      setVideos(videosData.videos || []);
    } catch (err) {
      if (!silent) setError(err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  // Poll every 2.5s if any video is currently rendering so percentage updates live on Dashboard too
  useEffect(() => {
    const anyProcessing = videos.some(
      (v) => v.status === 'processing' || v.render_progress?.active
    );
    if (!anyProcessing) return;
    const timer = setInterval(() => {
      loadDashboard(true);
    }, 2500);
    return () => clearInterval(timer);
  }, [videos]);

  const handleDeleteVideo = async (video) => {
    const confirmed = window.confirm(
      `Delete Video #${video.id} ("${video.hindi_title?.slice(0, 50)}")?`
    );
    if (!confirmed) return;
    try {
      await api.deleteVideo(video.id);
      setVideos((prev) => prev.filter((v) => v.id !== video.id));
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading && !summary) {
    return (
      <div className="p-12 flex items-center justify-center text-slate-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2.5 text-indigo-400" />
        Loading Aashi AI Studio...
      </div>
    );
  }

  const metrics = summary?.metrics || {};
  const recommended = summary?.recommendedTopic || null;
  const renderedVideos = videos.filter((v) => v.video_url);
  const latestRenderedVideo = renderedVideos[0] || videos[0] || null;

  return (
    <div className="space-y-6">
      {/* Hero Banner with Aashi */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/60 to-slate-900 border border-indigo-500/30 shadow-xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <img
            src="/assets/presenter/hero_anchor.jpg"
            alt="Aashi AI Presenter"
            className="w-20 h-24 sm:w-24 sm:h-28 object-cover object-top rounded-2xl border-2 border-indigo-400 shadow-lg shrink-0"
          />
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              Indian Topic &amp; Terminology Explainer Studio • 45s Deep Dive
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-white">
              45-Second Genuine Hindi Topic &amp; Terminology Explainers
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              Explain India&apos;s most-searched topics &amp; terminologies —{' '}
              <strong className="text-indigo-300">
                Article 370, Machine Learning, Vote Chori &amp; EVM-VVPAT, SSC CGL Exam, Mobile Features &amp; RBI Terms
              </strong>{' '}
              — in genuine 45-second (5 × 9s) Hindi videos with{' '}
              <strong className="text-emerald-300">Faceless 3D Cutaways (No Face)</strong> or optional Studio Presenter.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          <button
            onClick={() => onNavigate('trends')}
            className="flex-1 lg:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold border border-slate-700 transition cursor-pointer"
          >
            <Flame className="w-4 h-4 text-amber-400" />
            Browse Explainer Topics
          </button>
          <button
            onClick={() =>
              latestRenderedVideo
                ? onOpenVideoInStudio(latestRenderedVideo.id)
                : onNavigate('studio')
            }
            className="flex-1 lg:flex-initial inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold shadow-lg shadow-indigo-950/60 transition cursor-pointer"
          >
            <Clapperboard className="w-4 h-4" />
            Open Video Studio
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">
          {error}
        </div>
      )}

      {/* 3 Simple Creator Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <button
          onClick={() => onNavigate('trends')}
          className="text-left p-5 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition flex items-center justify-between cursor-pointer group"
        >
          <div>
            <div className="text-xs font-medium text-slate-400">Trending Stories Ready</div>
            <div className="text-3xl font-bold text-white mt-1">
              {metrics.totalTopicsDiscovered ?? 0}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 group-hover:scale-105 transition">
            <Flame className="w-6 h-6" />
          </div>
        </button>

        <button
          onClick={() => onNavigate('studio')}
          className="text-left p-5 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition flex items-center justify-between cursor-pointer group"
        >
          <div>
            <div className="text-xs font-medium text-slate-400">AI Videos in Studio</div>
            <div className="text-3xl font-bold text-white mt-1">{videos.length}</div>
          </div>
          <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 group-hover:scale-105 transition">
            <Clapperboard className="w-6 h-6" />
          </div>
        </button>

        <button
          onClick={() => onNavigate('publishing')}
          className="text-left p-5 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition flex items-center justify-between cursor-pointer group"
        >
          <div>
            <div className="text-xs font-medium text-slate-400">Ready to Export / Publish</div>
            <div className="text-3xl font-bold text-white mt-1">{renderedVideos.length}</div>
          </div>
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 group-hover:scale-105 transition">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </button>
      </div>

      {/* Your Recent AI Videos Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Play className="w-4 h-4 text-emerald-400" />
              Your AI Videos
            </h2>
            <p className="text-xs text-slate-400">
              Watch your rendered 9:16 shorts right here, edit scenes in Studio, or delete old drafts.
            </p>
          </div>
          <button
            onClick={() => loadDashboard()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {videos.map((v) => {
            const firstSceneThumb =
              Array.isArray(v.storyboard) && v.storyboard[0]?.keyframe_url
                ? v.storyboard[0].keyframe_url
                : '/assets/presenter/hero_anchor.jpg';
            const isRendering = v.status === 'processing' || Boolean(v.render_progress?.active);
            const pct = v.render_progress?.percent ?? (isRendering ? 12 : 100);

            return (
              <div
                key={v.id}
                className="rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-indigo-500/40 overflow-hidden flex flex-col justify-between transition shadow-lg"
              >
                <div>
                  {/* Video Player or Preview Cover */}
                  <div className="relative bg-black aspect-[9/12] max-h-72 w-full flex items-center justify-center border-b border-slate-800">
                    {v.video_url ? (
                      <video
                        key={v.video_url}
                        src={v.video_url}
                        controls
                        playsInline
                        preload="metadata"
                        className="h-full w-full object-contain bg-black"
                      />
                    ) : (
                      <div className="relative w-full h-full flex flex-col items-center justify-center p-4 text-center">
                        <img
                          src={firstSceneThumb}
                          alt={v.hindi_title}
                          className="w-20 h-24 object-cover object-top rounded-xl border border-slate-700 opacity-60 mb-2"
                        />
                        <span className="text-xs text-amber-300 font-medium">
                          {isRendering
                            ? `Rendering Video (${pct}%)...`
                            : 'Script Ready • Click Open Studio to Render MP4'}
                        </span>
                      </div>
                    )}
                    <div className="absolute top-3 left-3 flex items-center gap-1.5">
                      <StatusBadge status={isRendering ? 'processing' : v.status} />
                    </div>
                  </div>

                  {/* Card Info */}
                  <div className="p-4 space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>{CATEGORY_LABELS[v.topic_category] || 'Trending News'}</span>
                      <span>{v.duration_seconds || 32}s • 9:16</span>
                    </div>
                    <h3 className="text-sm font-bold text-white font-hindi line-clamp-2 leading-snug">
                      {v.hindi_title}
                    </h3>

                    {isRendering && (
                      <div className="pt-1 space-y-1">
                        <div className="flex items-center justify-between text-[11px] text-indigo-300 font-semibold">
                          <span className="truncate">
                            {v.render_progress?.stage || 'Rendering Veo 3.1 Video...'}
                          </span>
                          <span>{pct}%</span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-950 overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-500 rounded-full"
                            style={{ width: `${Math.max(5, Math.min(100, pct))}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Actions */}
                <div className="p-4 pt-0 flex items-center gap-2">
                  <button
                    onClick={() => onOpenVideoInStudio(v.id)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition cursor-pointer"
                  >
                    <Clapperboard className="w-3.5 h-3.5" />
                    {v.video_url ? 'Edit in Studio' : 'Render in Studio'}
                  </button>
                  {v.video_url && (
                    <a
                      href={v.video_url}
                      download={`aashi-video-${v.id}.mp4`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                      title="Download MP4"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                  )}
                  <button
                    onClick={() => handleDeleteVideo(v)}
                    title="Delete Video"
                    className="inline-flex items-center justify-center p-2 rounded-xl bg-rose-950/40 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 transition cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top Recommended Story */}
      {recommended && (
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-emerald-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-xs font-semibold">
              <Award className="w-3.5 h-3.5" />
              Top Recommended News Story
            </div>
            <h3 className="text-base font-bold text-white">{recommended.headline}</h3>
            <p className="text-xs text-slate-400">
              Source: <strong className="text-slate-200">{recommended.primary_source}</strong> •{' '}
              {CATEGORY_LABELS[recommended.category] || recommended.category}
            </p>
          </div>
          <button
            onClick={() => onNavigate('trends')}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shrink-0 cursor-pointer"
          >
            View All Trending Stories
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
