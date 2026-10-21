import React, { useState } from 'react';
import {
  LayoutDashboard,
  Flame,
  Clapperboard,
  Share2,
  BarChart3,
  Sparkles,
} from 'lucide-react';
import { DashboardPage } from './pages/DashboardPage';
import { TrendingTopicsPage } from './pages/TrendingTopicsPage';
import { VideoStudioPage } from './pages/VideoStudioPage';
import { PublishingPage } from './pages/PublishingPage';
import { AnalyticsPage } from './pages/AnalyticsPage';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
  { id: 'trends', label: 'Explainer Topics', icon: Flame },
  { id: 'studio', label: '45s Video Studio', icon: Clapperboard },
  { id: 'publishing', label: 'Publish & Export', icon: Share2 },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedVideoId, setSelectedVideoId] = useState(null);

  const handleOpenVideoInStudio = (videoId) => {
    if (videoId) {
      setSelectedVideoId(Number(videoId));
    }
    setActiveTab('studio');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row">
      {/* Clean Creator Sidebar */}
      <aside className="w-full md:w-60 bg-slate-900/95 border-b md:border-b-0 md:border-r border-slate-800/80 flex flex-col justify-between shrink-0">
        <div>
          <div
            onClick={() => setActiveTab('dashboard')}
            className="p-4 border-b border-slate-800/80 flex items-center gap-3 cursor-pointer hover:bg-slate-800/40 transition"
          >
            <img
              src="/assets/presenter/hero_anchor.jpg"
              alt="Aashi"
              className="w-10 h-10 rounded-full object-cover object-top border-2 border-indigo-500 shadow"
            />
            <div>
              <div className="text-sm font-bold text-white leading-tight flex items-center gap-1.5">
                Aashi AI Studio
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              </div>
              <div className="text-[11px] text-slate-400">
                45s Viral Topic Explainer
              </div>
            </div>
          </div>

          <nav className="p-3 flex md:flex-col gap-1.5 overflow-x-auto">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950/50'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/70'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="hidden md:block p-3.5 m-3 rounded-xl bg-slate-950/90 border border-slate-800/80 space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-indigo-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            AI Video Engine Active
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            45s Genuine Hindi Topic Explainer • Faceless 3D Visuals • Veo 3.1
          </p>
        </div>
      </aside>

      {/* Main Workspace */}
      <main className="flex-1 p-4 md:p-7 overflow-y-auto max-w-7xl mx-auto w-full">
        {activeTab === 'dashboard' && (
          <DashboardPage
            onNavigate={setActiveTab}
            onOpenVideoInStudio={handleOpenVideoInStudio}
          />
        )}
        {activeTab === 'trends' && (
          <TrendingTopicsPage onOpenVideoInStudio={handleOpenVideoInStudio} />
        )}
        {activeTab === 'studio' && (
          <VideoStudioPage
            selectedVideoId={selectedVideoId}
            onSelectVideoId={setSelectedVideoId}
            onNavigate={setActiveTab}
          />
        )}
        {activeTab === 'publishing' && (
          <PublishingPage onNavigateToStudio={handleOpenVideoInStudio} />
        )}
        {activeTab === 'analytics' && <AnalyticsPage />}
      </main>
    </div>
  );
}
