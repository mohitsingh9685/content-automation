import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  Eye,
  Heart,
  MessageSquare,
  Clock,
  Sparkles,
  TrendingUp,
  RefreshCw,
} from 'lucide-react';
import { api } from '../api/client';
import { CATEGORY_LABELS } from '../components/StatusBadge';

export function AnalyticsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const res = await api.getAnalytics();
      setData(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, []);

  if (loading && !data) {
    return <div className="p-8 text-slate-400">Loading Analytics & AI Topic Recommendations...</div>;
  }

  const totals = data?.totals || {};
  const byVideo = data?.byVideo || [];
  const byCategory = data?.byCategory || [];
  const recommendations = data?.recommendations || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Performance Analytics & AI Recommendations</h1>
          <p className="text-sm text-slate-400 mt-1">
            Views, likes, comments, average view duration, retention rate, and data-driven future topic recommendations.
          </p>
        </div>
        <button
          onClick={loadAnalytics}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium border border-slate-700 cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh Metrics
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">
          {error}
        </div>
      )}

      {/* Top Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl bg-slate-900/85 border border-slate-800">
          <div className="flex items-center justify-between text-sky-400">
            <span className="text-xs font-medium text-slate-400">Total Views</span>
            <Eye className="w-4 h-4" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white">
            {Number(totals.total_views || 0).toLocaleString()}
          </div>
        </div>

        <div className="p-5 rounded-xl bg-slate-900/85 border border-slate-800">
          <div className="flex items-center justify-between text-rose-400">
            <span className="text-xs font-medium text-slate-400">Total Likes</span>
            <Heart className="w-4 h-4" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white">
            {Number(totals.total_likes || 0).toLocaleString()}
          </div>
        </div>

        <div className="p-5 rounded-xl bg-slate-900/85 border border-slate-800">
          <div className="flex items-center justify-between text-indigo-400">
            <span className="text-xs font-medium text-slate-400">Total Comments</span>
            <MessageSquare className="w-4 h-4" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white">
            {Number(totals.total_comments || 0).toLocaleString()}
          </div>
        </div>

        <div className="p-5 rounded-xl bg-slate-900/85 border border-slate-800">
          <div className="flex items-center justify-between text-emerald-400">
            <span className="text-xs font-medium text-slate-400">Avg Retention / Duration</span>
            <Clock className="w-4 h-4" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white">
            {totals.avg_retention_pct || 0}%{' '}
            <span className="text-sm font-normal text-slate-400">({totals.avg_view_duration_sec || 0}s)</span>
          </div>
        </div>
      </div>

      {/* Performance by Topic & Video + Recommendations */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 p-5 rounded-xl bg-slate-900/85 border border-slate-800 space-y-4">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-indigo-400" />
            Performance by Video & Platform
          </h2>

          <div className="space-y-3">
            {byVideo.map((row) => (
              <div key={row.id} className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 font-medium">
                    {row.platform === 'youtube_shorts' ? 'YouTube Shorts' : 'Instagram Reels'}
                  </span>
                  <span className="text-xs text-slate-400">
                    {CATEGORY_LABELS[row.topic_category] || row.topic_category}
                  </span>
                </div>

                <div className="text-sm font-semibold text-white font-hindi">{row.hindi_title}</div>

                <div className="grid grid-cols-4 gap-2 pt-1 text-xs">
                  <div className="p-2 rounded bg-slate-900">
                    <span className="text-slate-400 block">Views</span>
                    <strong className="text-white">{Number(row.views).toLocaleString()}</strong>
                  </div>
                  <div className="p-2 rounded bg-slate-900">
                    <span className="text-slate-400 block">Likes</span>
                    <strong className="text-white">{Number(row.likes).toLocaleString()}</strong>
                  </div>
                  <div className="p-2 rounded bg-slate-900">
                    <span className="text-slate-400 block">Comments</span>
                    <strong className="text-white">{Number(row.comments).toLocaleString()}</strong>
                  </div>
                  <div className="p-2 rounded bg-slate-900">
                    <span className="text-slate-400 block">Retention</span>
                    <strong className="text-emerald-400">{row.retention_pct}%</strong>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {byCategory.length > 0 && (
            <div className="pt-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Category Aggregates
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {byCategory.map((cat) => (
                  <div
                    key={cat.category}
                    className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between"
                  >
                    <div>
                      <div className="text-xs font-semibold text-white">
                        {CATEGORY_LABELS[cat.category] || cat.category}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {Number(cat.views).toLocaleString()} views • {Number(cat.likes).toLocaleString()} likes
                      </div>
                    </div>
                    <span className="text-xs font-bold text-emerald-400">{cat.avg_retention_pct}% ret.</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* AI Topic Recommendations */}
        <div className="lg:col-span-5 p-5 rounded-xl bg-slate-900/85 border border-slate-800 space-y-4">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            AI Recommendations for Future Topics
          </h2>
          <p className="text-xs text-slate-400">
            Generated from observed retention and engagement patterns across Indian viewer segments:
          </p>

          <div className="space-y-3">
            {recommendations.map((rec, idx) => (
              <div
                key={idx}
                className="p-4 rounded-xl bg-indigo-950/20 border border-indigo-500/30 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-indigo-300">
                    {CATEGORY_LABELS[rec.category] || rec.category}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase text-emerald-300">
                    <TrendingUp className="w-3 h-3" /> {rec.priority} priority
                  </span>
                </div>
                <div className="text-sm font-bold text-white font-hindi">{rec.title}</div>
                <p className="text-xs text-slate-300 leading-relaxed font-hindi">{rec.reason}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
