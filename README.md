<div align="center">

# 🎯 SIH Problem Statement Helper
### *Local-First AI Productivity Suite & Tracking Layer for Smart India Hackathon*

[![Manifest V3](https://img.shields.io/badge/Chrome_Extension-Manifest_V3-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![SQLite](https://img.shields.io/badge/Database-SQLite3-003B57?logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![Ollama](https://img.shields.io/badge/Local_AI-Ollama-black?logo=ollama&logoColor=white)](https://ollama.ai/)
[![Privacy Friendly](https://img.shields.io/badge/Privacy-100%25_Local-27AE60?logo=shield&logoColor=white)](#-privacy--security-guarantee)

<p align="center">
  A non-invasive, local-first browser extension and persistent backend designed to help student teams review, annotate, track, and strategically analyze <b>Smart India Hackathon (SIH)</b> problem statements directly on the official portal with zero cloud dependencies.
</p>

[The Problem](#-the-problem-what-sih-aspirants-face) •
[The Solution](#-the-solution-how-sih-ps-helper-fixes-it) •
[Architecture](#-system-architecture) •
[Quick Start](#-installation--setup-guide) •
[AI Mentor](#-ai-mentor-capabilities) •
[API Reference](#-backend-api-reference) •
[Troubleshooting](#-troubleshooting--faq)

---

</div>

## 📌 The Problem: What SIH Aspirants Face

Every year, thousands of college teams explore the **Smart India Hackathon (SIH)** problem statement portal ([`sih.gov.in/sih2026PS`](https://sih.gov.in/sih2026PS)) to pick their competition project. While the portal lists hundreds of PSs across diverse ministries and domains, students routinely face significant productivity friction:

1. **Information Overload & Tracking Fatigue**
   * The portal features hundreds of complex Problem Statements (PSs). 
   * There is **no built-in mechanism to bookmark, mark as reviewed, or categorize** problem statements. Students often end up maintaining messy spreadsheets or losing track of previously examined PSs.
2. **Scattered Brainstorming & Lost Notes**
   * When reading a PS description, students come up with preliminary architecture ideas, potential APIs, tech stacks, or questions for their mentors.
   * Because the official portal provides no note-taking layer, notes end up scattered across WhatsApp groups, scratchpads, or Notion pages disconnected from the PS details.
3. **Ambiguity & Difficulty in Feasibility Assessment**
   * Government ministry descriptions are often dense, broad, or jargon-heavy.
   * Student teams struggle to quickly distinguish:
     * *What is explicitly required vs. what is an open-ended suggestion?*
     * *Where can AI/ML/DL/NLP genuinely create value vs. where is it over-engineering?*
     * *What technical questions will the hackathon evaluation jury ask?*
     * *Can a working prototype be realistically delivered in a 36-hour hackathon?*
4. **Data Privacy & Strategy Protection**
   * Students brainstorming competitive hackathon proposals do not want their strategic ideas, notes, or prompts logged by third-party cloud services or public browser extensions.

---

## 💡 The Solution: How SIH PS Helper Fixes It

**SIH PS Helper** injects a modern, unobtrusive productivity layer directly into the official SIH portal modals without breaking or altering any core website functionality.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Official SIH Modal                             │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │  Problem Statement Details (Ministry, Category, Description...)    │ │
│ └────────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│ ═════════════════════ SIH HELPER INJECTED SUITE ══════════════════════ │
│                                                                        │
│  [✓] Mark as Reviewed                  [ 📋 PS Summary Chip ]          │
│  ────────────────────────────────────────────────────────────────────  │
│  📝 Personal Notes (Auto-saved to local SQLite DB with auto-sync)     │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ "Use FastAPI + React, integrate Bhashini API for Indic audio..." │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│  ────────────────────────────────────────────────────────────────────  │
│  🤖 Ask AI about this PS (Streaming Ollama local LLM)                 │
│  [Explain PS] [Suggest Solution] [Judge Questions] [ML Feasibility]   │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 🤖 AI Mentor: Key evaluation challenges for this PS are...       │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

### Key Highlights

* 📝 **Persistent Markdown Notes**: Each PS gets a dedicated personal note editor that auto-saves as you type.
* ✅ **Reviewed Status & Visual Highlights**: Check off reviewed statements to highlight rows in the main data table and track your team's progress.
* 🤖 **Context-Aware Local AI Mentor**: Streams responses directly from your local **Ollama** instance (`qwen3:8b`, `llama3.2`, `mistral`, etc.). It automatically consumes the full PS metadata (Ministry, Category, Theme, Description, Dataset Links) as context without manual copying/pasting.
* 💾 **Dual-Layer Storage Engine**: Primary storage in a local **Python FastAPI + SQLite** database for persistence across browser profiles/restarts, paired with an instant **`chrome.storage.local`** fallback.
* 🔒 **100% Local & Air-Gapped**: Zero cloud telemetry, zero external API keys, zero subscription costs.

---

## 🏛 System Architecture

```mermaid
flowchart TD
    subgraph Browser ["🌐 Chrome / Chromium Browser"]
        SIH["Official SIH Portal<br/>(https://sih.gov.in/sih2026PS)"]
        CS["Content Script<br/>(content_script.js)"]
        CSS["Scoped Styles<br/>(styles.css)"]
        POP["Extension Popup<br/>(popup.html / popup.js)"]
        LS[("chrome.storage.local<br/>(Instant Cache & Offline Fallback)")]

        SIH <-->|Injects UI & Extracts DOM| CS
        CS --- CSS
        CS <-->|Offline Read/Write| LS
        POP <-->|Read Metrics| LS
    end

    subgraph LocalBackend ["🐍 Local Python Backend (Port 7842)"]
        API["FastAPI REST Server<br/>(server.py)"]
        DB[("SQLite Database<br/>(sih_helper.db)")]
        
        API <-->|Async aiosqlite| DB
    end

    subgraph LocalAI ["🤖 Local LLM Engine (Port 11434)"]
        OLLAMA["Ollama Server<br/>(qwen3:8b / llama3 / any model)"]
    end

    CS <-->|HTTP REST (Notes & Status)| API
    POP <-->|Health Check & Aggregates| API
    CS <-->|Streaming HTTP Chat (CORS)| OLLAMA
```

---

## 📂 Project Structure

```
SIH_Website_Helper/
│
├── extension/                       # 🧩 Manifest V3 Chrome Extension
│   ├── manifest.json                # Extension metadata, permissions & match rules
│   ├── content_script.js            # DOM extraction, UI injection, AI streaming, storage sync
│   ├── styles.css                   # Scoped design system matching SIH theme (#f75700 / #3a488b)
│   ├── background.js                # Minimal MV3 service worker
│   ├── popup.html                   # Extension action popup dashboard
│   ├── popup.js                     # Health checker (Backend + Ollama) & stats aggregator
│   └── icons/                       # Extension branding assets
│       ├── icon16.png
│       ├── icon48.png
│       └── icon128.png
│
├── backend/                         # 🐍 Python Persistent Storage Server
│   ├── server.py                    # FastAPI async application with CORS & SQLite CRUD
│   ├── requirements.txt             # Python dependencies (fastapi, uvicorn, aiosqlite)
│   └── start.bat                    # One-click startup script for Windows
│
├── LICENSE                          # MIT License
└── README.md                        # Documentation
```

---

## 🚀 Installation & Setup Guide

### Prerequisites

* **Python 3.10+** ([Download Python](https://www.python.org/downloads/))
* **Google Chrome**, Brave, Edge, or any Chromium-based browser
* **Ollama** ([Download Ollama](https://ollama.ai/)) for local AI capabilities

---

### Step 1: Start the Python Storage Backend

The backend stores all personal notes and completion flags in an async SQLite database.

1. Open a terminal and navigate to the `backend/` directory:
   ```bash
   cd D:\PROJECTS\SIH_Website_Helper\backend
   ```
2. Install the lightweight dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Start the server:
   ```bash
   python server.py
   ```
   *Windows shortcut:* You can simply double-click **`start.bat`**.

4. Verify the backend is running by opening [`http://127.0.0.1:7842/health`](http://127.0.0.1:7842/health) in your browser. You should see:
   ```json
   { "status": "ok", "version": "1.0.0", "db": ".../sih_helper.db" }
   ```

---

### Step 2: Start Ollama with CORS Enabled

To allow the browser extension to stream responses from your local Ollama server, launch Ollama with CORS permissions:

#### On Windows (PowerShell):
```powershell
$env:OLLAMA_ORIGINS="*"
ollama serve
```

#### On Linux / macOS:
```bash
OLLAMA_ORIGINS="*" ollama serve
```

Pull the recommended model (or any model of your choice):
```bash
ollama pull qwen3:8b
```
*(Tip: You can use `llama3.2`, `mistral`, `gemma2`, or `deepseek-r1` by editing `OLLAMA_MODEL` in [`extension/content_script.js`](file:///D:/PROJECTS/SIH_Website_Helper/extension/content_script.js)).*

---

### Step 3: Load the Extension in Chrome

1. Open your browser and navigate to `chrome://extensions`
2. Toggle **Developer mode** in the top-right corner.
3. Click the **Load unpacked** button.
4. Select the [`extension/`](file:///D:/PROJECTS/SIH_Website_Helper/extension) folder from this repository.
5. Pin the **SIH PS Helper** (🎯) to your browser toolbar.

> 💡 **Testing on local offline files?**  
> If you are testing on a downloaded HTML copy of the SIH website, click **Details** on the extension card in `chrome://extensions` and toggle **"Allow access to file URLs"**.

---

### Step 4: Browse SIH Problem Statements!

1. Go to the live SIH portal: [**https://sih.gov.in/sih2026PS**](https://sih.gov.in/sih2026PS) (also works on 2025/2024 portals).
2. Click any Problem Statement title to view details.
3. You will immediately see the injected productivity panel:
   * Toggle **✓ Mark as Reviewed** to highlight the statement across tables.
   * Write observations in **📝 Personal Notes** (auto-saved to SQLite).
   * Click **🤖 Ask AI about this PS** to analyze solutions, architectures, and judge questions!

---

## 🤖 AI Mentor Capabilities

The AI integration uses a specialized **Senior Technical Hackathon Mentor** system prompt that evaluates problem statements from a competitive collegiate hackathon perspective.

### One-Click Quick Actions:

| Action Button | Focus & Purpose |
|---|---|
| **Explain this PS** | Clarifies dense government requirements into plain terms, separating stated facts from assumptions. |
| **Suggest a solution** | Outlines an end-to-end technical proposal tailored for a 36-hour hackathon deliverable. |
| **Find the hardest parts** | Identifies critical bottlenecks (edge cases, offline requirements, hardware constraints, scale). |
| **How can we make this unique?** | Highlights differentiators to stand out from other teams tackling the same PS. |
| **Suggest AI/ML usage** | Evaluates whether AI/ML/NLP/Computer Vision is genuinely needed vs. rule-based logic. |
| **Give me an architecture** | Recommends frontend, backend, database, microservices, and external API stacks. |
| **What would judges question?** | Anticipates tough questions on data security, scalability, accuracy, and deployment. |
| **Estimate difficulty** | Rates feasibility and realistic prototype scope for a 6-member student team. |

---

## 📊 Extension Popup Dashboard

Clicking the extension icon in your browser toolbar opens a quick overview modal:

* 🟢 **Python Backend Status** (online/offline indicator)
* 🟢 **Ollama Model Status** (verifies local AI connectivity and count of models)
* 📈 **Live Statistics**:
  * Total PSs tracked
  * Total PSs marked as Reviewed
  * Total PSs with personal notes
* 🚀 **One-click link** to jump directly to the SIH Problem Statements page.

---

## 📡 Backend API Reference

The FastAPI server provides REST endpoints for programmatic access and external integrations. Interactive OpenAPI documentation is accessible at [`http://127.0.0.1:7842/docs`](http://127.0.0.1:7842/docs).

| Method | Endpoint | Description | Sample Request / Response |
|---|---|---|---|
| `GET` | `/health` | Server & DB health check | `{"status": "ok", "version": "1.0.0"}` |
| `GET` | `/notes/{ps_id}` | Fetch note for a specific PS | `{"ps_id": "26001", "note": "...", "updated_at": "..."}` |
| `PUT` | `/notes/{ps_id}` | Save/Update note for a PS | `{"note": "Draft architecture plan..."}` |
| `DELETE` | `/notes/{ps_id}` | Delete a note | `{"deleted": true, "ps_id": "26001"}` |
| `GET` | `/status/{ps_id}` | Get reviewed boolean | `{"ps_id": "26001", "reviewed": true}` |
| `PUT` | `/status/{ps_id}` | Set reviewed boolean | `{"reviewed": true}` |
| `GET` | `/all` | Aggregate metrics & all records | `{"total": 45, "reviewed_count": 12, "records": [...]}` |

---

## 🛡 Privacy & Security Guarantee

* **No Cloud Telemetry**: Notes, bookmarks, and prompts are never transmitted to external cloud servers.
* **Local LLM Inference**: AI analysis runs on your machine via Ollama.
* **Isolated Execution**: Scoped styles and isolated script execution ensure the extension never interferes with official SIH authentication or forms.
* **Zero Tracking**: No Google Analytics, no tracking pixels, no telemetry beacons.

---

## 🔧 Troubleshooting & FAQ

### Q1: The helper panel is not visible when I open a PS modal.
* **Solution**: Ensure the extension is enabled in `chrome://extensions`. Refresh the SIH webpage. If testing on a locally downloaded HTML file, ensure **"Allow access to file URLs"** is toggled on in the extension's Details page.

### Q2: Chat shows "Ollama is not running or unreachable".
* **Solution**: Ollama must be launched with the `OLLAMA_ORIGINS="*"` environment variable to permit cross-origin requests from the browser:
  ```powershell
  $env:OLLAMA_ORIGINS="*"
  ollama serve
  ```

### Q3: The popup shows "Python Backend: offline".
* **Solution**: Run `start.bat` inside the `backend/` folder or start `python server.py`. While offline, the extension will automatically use `chrome.storage.local` fallback so your work is never lost.

### Q4: Can I change the AI model to Llama 3 or DeepSeek?
* **Solution**: Yes! Pull the model in Ollama (`ollama pull llama3.2`), then change the model name in [`extension/content_script.js`](file:///D:/PROJECTS/SIH_Website_Helper/extension/content_script.js):
  ```javascript
  const OLLAMA_MODEL = 'llama3.2'; // or any model in 'ollama list'
  ```

---

## 📄 License

Distributed under the **MIT License**. Free for all students and participants of Smart India Hackathon.

<div align="center">
  <sub>Built with ❤️ to empower student innovators at Smart India Hackathon.</sub>
</div>
