# ExplainIndia 45s — Indian Viral Topic Explainer Studio

Full-stack AI-powered **45-second vertical video explainer studio** for **YouTube Shorts** and **Instagram Reels**. Built for Indian creators explaining high-search topics (SSC CGL, Article 370, Machine Learning, Smartphone Features, Vote Chori & EVM-VVPAT, RBI Repo Rate, and live trending topics) in **Casual, High-Retention Roman Hinglish + Simple English** with **Full-Bleed 9:16 Cinematic 3D Cutaway Visuals**.

---

## Key Features

- **High-Search Indian Topic Discovery + Custom Topic Engine**:
  - Curated library of high-demand Indian explainer topics across **Tech & AI**, **Constitution & Law**, **Exams & Career**, **Mobile & Gadgets**, **Civic & Politics**, and **Finance & Economy**, plus live RSS trend discovery and 1-click custom topic creation.
- **100% Roman Hinglish + English Script Engine (Zero Devanagari)**:
  - Generates ultra-interactive 45-second scripts with a **0–3s Shock/Myth-Buster Hook**, **5 structured scenes** (Hook, Core Meaning, How It Works, Indian Real-Life Impact, Takeaway & Question CTA), and micro-hooks between every scene.
  - Strictly enforces Roman Hinglish + English across all titles, hooks, narrations, and subtitles.
- **MAX-Quality 9:16 Cinematic 3D Storytelling Visuals (95%+ Error-Free)**:
  - Generates full-bleed `1080x1920` 3D cutaway scenes (Zack D. Films / Professor of How / Pixar style) via **Vertex AI Veo 3.1** and **Gemini 2.5 Flash Image** with continuous 24fps camera motion and zero gibberish AI text inside the artwork.
- **Neural Voiceover + Raised Viral Shorts Subtitles**:
  - Synthesizes energetic Indian neural voiceovers (`edge-tts` / Google Cloud TTS) with word-level synced **ASS/SRT viral captions** (`3–4 words per cue`, raised above Shorts/Reels player controls at `MarginV: 420`).
- **Editorial Approval Gate, Publishing & Analytics**:
  - Built-in Video Studio with script editor, approval workflow (`draft` -> `approved` -> `published`), YouTube Shorts & Instagram Reels publishing integration, and self-hosted **n8n** workflow templates.

---

## Quick Start

### 1. Start PostgreSQL & Self-Hosted n8n (Docker)
```bash
docker compose up -d
```
- **PostgreSQL 16**: `localhost:5432` (`hindi_trend_ai`)
- **n8n Automation UI**: `http://localhost:5678`

### 2. Configure Environment Variables
```bash
cp .env.example .env
```
Open `.env` and set your `GEMINI_API_KEY` (and optional `VERTEX_PROJECT_ID` if using Vertex AI Veo 3.1).

### 3. Install Dependencies & Initialize Database
```bash
npm run install:all
npm run db:setup
```

### 4. Start Both Backend (`:4000`) & Frontend (`:5180`)
From the root directory:
```bash
npm run dev
```
- **Frontend Studio UI**: `http://localhost:5180`
- **Backend API**: `http://localhost:4000/api/health`

---

## Available Root Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts both Backend (`http://localhost:4000`) and Frontend (`http://localhost:5180`) |
| `npm run stop` | Stops any running servers on ports `4000` and `5180` |
| `npm test` | Runs the backend integration test suite |
| `npm run build` | Builds the production frontend bundle (`frontend/dist`) |
| `npm run db:setup` | Initializes the PostgreSQL schema and seeds initial explainer topics |

---

## Project Structure

```text
content-automation/
├── backend/                  # Express + PostgreSQL + FFmpeg + Gemini/Veo 3.1 API
│   ├── src/
│   │   ├── config/           # Environment & binary resolution config
│   │   ├── controllers/      # REST API controllers (Dashboard, Trends, Videos, Publish, Analytics)
│   │   ├── db/               # PostgreSQL pool, schema.sql, and Roman Hinglish seed data
│   │   ├── providers/        # AI (Gemini), Video (Veo 3.1 / Imagen / FFmpeg), TTS, News, YouTube, Instagram
│   │   └── routes/           # Express API routes
│   └── tests/                # Automated API & pipeline integration tests
├── frontend/                 # React 19 + Vite + Lucide UI Dashboard
│   └── src/
│       ├── api/              # API client
│       └── pages/            # Dashboard, Topic Explorer, Video Studio, Publishing, Analytics
├── n8n/                      # Self-hosted n8n workflow JSON exports
├── storage/                  # Local git-ignored media storage (videos, scenes, audio, subtitles)
└── docker-compose.yml        # PostgreSQL 16 + n8n containers
```
