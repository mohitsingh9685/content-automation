import React, { useEffect, useState } from 'react';
import {
  Send,
  Calendar,
  Download,
  Copy,
  CheckCircle2,
  Clapperboard,
  RefreshCw,
} from 'lucide-react';
import { api } from '../api/client';
import { StatusBadge } from '../components/StatusBadge';

export function PublishingPage({ onNavigateToStudio }) {
  const [videos, setVideos] = useState([]);
  const [selectedVideoId, setSelectedVideoId] = useState(null);
  const [platforms, setPlatforms] = useState({
    youtube_shorts: true,
    instagram_reels: true,
  });
  const [platformTitle, setPlatformTitle] = useState('');
  const [platformCaption, setPlatformCaption] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [copiedField, setCopiedField] = useState('');
  const [feedback, setFeedback] = useState(null);

  const selectVideoForForm = (video) => {
    if (!video) return;
    setSelectedVideoId(video.id);
    setPlatformTitle(video.hindi_title || '');
    const tags = Array.isArray(video.hashtags) ? video.hashtags.join(' ') : '';
    setPlatformCaption(`${video.short_description || ''}\n\n${tags}`.trim());
  };

  const loadPublishingData = async () => {
    try {
      setLoading(true);
      const videosRes = await api.getVideos();
      const list = videosRes.videos || [];
      setVideos(list);

      const current = list.find((v) => v.id === Number(selectedVideoId));
      const initialVideo = current || list.find((v) => v.video_url) || list[0];
      if (initialVideo) {
        selectVideoForForm(initialVideo);
      }
    } catch (err) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPublishingData();
  }, []);

  const currentVideo = videos.find((v) => v.id === Number(selectedVideoId));
  const isApproved = currentVideo?.status === 'approved';

  const handleCopy = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(label);
      setTimeout(() => setCopiedField(''), 2000);
    } catch (_) {
      // fallback
    }
  };

  const handleQuickApprove = async () => {
    if (!currentVideo) return;
    try {
      setPublishing(true);
      setFeedback(null);
      await api.approveVideo(currentVideo.id, 'Approved on Publish & Export page');
      setFeedback({
        type: 'success',
        message: 'Video approved! You can now queue or export it.',
      });
      await loadPublishingData();
    } catch (err) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setPublishing(false);
    }
  };

  const handlePublish = async () => {
    if (!currentVideo) return;
    const chosenPlatforms = Object.entries(platforms)
      .filter(([, enabled]) => enabled)
      .map(([name]) => name);

    if (chosenPlatforms.length === 0) {
      setFeedback({
        type: 'error',
        message: 'Select at least one platform (YouTube Shorts or Instagram Reels).',
      });
      return;
    }

    try {
      setPublishing(true);
      setFeedback(null);
      if (!isApproved) {
        await api.approveVideo(currentVideo.id, 'Auto-approved during publish');
      }
      await api.publishVideo(currentVideo.id, {
        platforms: chosenPlatforms,
        platformTitle,
        platformCaption,
        scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : null,
      });
      setFeedback({
        type: 'success',
        message: scheduledFor
          ? `Scheduled for ${new Date(scheduledFor).toLocaleString()}!`
          : `Queued for ${chosenPlatforms.join(' & ')}!`,
      });
      await loadPublishingData();
    } catch (err) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Export & Publish Video</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Download your finished 9:16 MP4 video, copy Hindi title & hashtags, or schedule for YouTube Shorts & Reels.
          </p>
        </div>
        <button
          onClick={loadPublishingData}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 5 Cols: Video Preview & Direct MP4 Download */}
        <div className="lg:col-span-5 p-5 rounded-2xl bg-slate-900/95 border border-slate-800 flex flex-col items-center space-y-4 shadow-xl">
          <div className="w-full">
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">
              Select Video
            </label>
            <select
              value={selectedVideoId || ''}
              onChange={(e) => {
                const chosen = videos.find((v) => v.id === Number(e.target.value));
                selectVideoForForm(chosen);
              }}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-white cursor-pointer"
            >
              {videos.map((v) => (
                <option key={v.id} value={v.id}>
                  Video #{v.id}: {v.hindi_title?.slice(0, 48)}
                </option>
              ))}
            </select>
          </div>

          {currentVideo && (
            <>
              <div className="w-full flex items-center justify-between text-xs text-slate-400">
                <StatusBadge status={currentVideo.status} />
                <span>{currentVideo.duration_seconds || 32}s • 9:16 Vertical</span>
              </div>

              {currentVideo.video_url ? (
                <video
                  key={currentVideo.video_url}
                  src={currentVideo.video_url}
                  controls
                  playsInline
                  className="w-[260px] aspect-[9/16] rounded-2xl border-2 border-indigo-500/40 bg-black object-cover shadow-2xl"
                />
              ) : (
                <div className="w-[260px] aspect-[9/16] rounded-2xl bg-slate-950 border border-slate-800 flex flex-col items-center justify-center p-5 text-center space-y-3">
                  <p className="text-xs text-slate-400">
                    This video has not been rendered into an MP4 yet.
                  </p>
                  <button
                    onClick={() => onNavigateToStudio(currentVideo.id)}
                    className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold cursor-pointer"
                  >
                    Open Studio to Render
                  </button>
                </div>
              )}

              <div className="w-full flex flex-col sm:flex-row gap-2.5 pt-1">
                {currentVideo.video_url && (
                  <a
                    href={currentVideo.video_url}
                    download={`aashi-short-${currentVideo.id}.mp4`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow transition"
                  >
                    <Download className="w-4 h-4" />
                    Download 9:16 MP4
                  </a>
                )}
                <button
                  onClick={() => onNavigateToStudio(currentVideo.id)}
                  className="inline-flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition cursor-pointer"
                >
                  <Clapperboard className="w-4 h-4" />
                  Edit in Studio
                </button>
              </div>
            </>
          )}
        </div>

        {/* Right 7 Cols: Copy Title/Caption & Schedule Release */}
        <div className="lg:col-span-7 p-5 rounded-2xl bg-slate-900/95 border border-slate-800 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white">
              Ready-to-Post Hindi Title & Caption
            </h2>
            {!isApproved && currentVideo && (
              <button
                onClick={handleQuickApprove}
                disabled={publishing}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Approve Video
              </button>
            )}
          </div>

          {/* Title with 1-Click Copy */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-400">
                YouTube Shorts / Reels Title (Roman Hinglish + English)
              </label>
              <button
                onClick={() => handleCopy(platformTitle, 'title')}
                className="inline-flex items-center gap-1 text-xs text-indigo-300 hover:text-indigo-200 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                {copiedField === 'title' ? 'Copied!' : 'Copy Title'}
              </button>
            </div>
            <input
              type="text"
              value={platformTitle}
              onChange={(e) => setPlatformTitle(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white font-hindi"
            />
          </div>

          {/* Caption & Hashtags with 1-Click Copy */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-400">
                Description &amp; Hashtags
              </label>
              <button
                onClick={() => handleCopy(platformCaption, 'caption')}
                className="inline-flex items-center gap-1 text-xs text-indigo-300 hover:text-indigo-200 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                {copiedField === 'caption' ? 'Copied!' : 'Copy Caption & Tags'}
              </button>
            </div>
            <textarea
              rows={5}
              value={platformCaption}
              onChange={(e) => setPlatformCaption(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 font-hindi leading-relaxed"
            />
          </div>

          {/* Platform & Schedule Options */}
          <div className="pt-3 border-t border-slate-800 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-5">
                <label className="inline-flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={platforms.youtube_shorts}
                    onChange={(e) =>
                      setPlatforms({ ...platforms, youtube_shorts: e.target.checked })
                    }
                    className="rounded border-slate-700"
                  />
                  YouTube Shorts
                </label>

                <label className="inline-flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={platforms.instagram_reels}
                    onChange={(e) =>
                      setPlatforms({ ...platforms, instagram_reels: e.target.checked })
                    }
                    className="rounded border-slate-700"
                  />
                  Instagram Reels
                </label>
              </div>

              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-400" />
                <input
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200"
                />
              </div>
            </div>

            <button
              onClick={handlePublish}
              disabled={publishing}
              className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-lg transition cursor-pointer"
            >
              <Send className="w-4 h-4" />
              {publishing ? 'Saving to Publish Queue...' : 'Approve & Queue for Publishing'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
