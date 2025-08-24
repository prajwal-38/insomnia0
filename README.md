# 🎬 Insomnia - AI-Powered Video Editing Platform

> Transforming video editing through intelligent automation and visual AI agent orchestration

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Python](https://img.shields.io/badge/Python-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-005571?logo=fastapi)](https://fastapi.tiangolo.com/)

## 🚀 Overview

Insomnia is a revolutionary video editing platform that combines the power of artificial intelligence with professional-grade editing tools. Upload your video, let AI automatically segment it into scenes, and apply specialized AI agents through an intuitive visual interface.

### ✨ Key Features

- **🤖 Intelligent Scene Detection** - Automatic video segmentation using AI and computer vision
- **🎯 AI Agent System** - 11 specialized agents for different editing tasks
- **🌐 Dual Interface** - Visual Story Web + Professional Timeline Editor
- **🗣️ Real-time Audio Translation** - Multi-language support with voice synthesis
- **⚡ Cloud-Powered Processing** - Scalable AI processing with real-time feedback
- **🎨 Professional Output** - Export-ready videos with professional quality

## 📸 Screenshots

### Story Web Interface
*[Screenshot placeholder - Visual node-based interface showing AI agents connected to video scenes]*

### Timeline Editor
*[Screenshot placeholder - Professional timeline interface with tracks and editing tools]*

### AI Agent Panel
*[Screenshot placeholder - Minimalistic AI agents selection panel]*

### Scene Analysis Results
*[Screenshot placeholder - Video analysis results showing detected scenes]*

## 🏗️ Architecture

### System Overview
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │    │    Backend       │    │   AI Services   │
│   (React/TS)    │◄──►│   (FastAPI)      │◄──►│  (Cloud APIs)   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ Story Web View  │    │ Video Analysis   │    │ Google Cloud    │
│ Timeline Editor │    │ Scene Detection  │    │ Gemini AI       │
│ Real-time UI    │    │ AI Processing    │    │ Speech/Translate│
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### AI Agent Types
- **🎬 Video Enhancer** - Quality improvement and stabilization
- **🎵 Audio Processor** - Noise reduction and enhancement
- **📝 Subtitle Generator** - Automatic caption generation
- **🌍 Audio Translator** - Multi-language audio translation
- **🎨 Color Grader** - Professional color correction
- **🔍 Object Detector** - Visual element identification
- **📊 Content Analyzer** - Scene and content analysis
- **✂️ Auto Editor** - Intelligent editing suggestions
- **🎭 Scene Classifier** - Content categorization
- **🔄 Transition Suggester** - Smart transition recommendations
- **🔇 Noise Reducer** - Audio cleanup and enhancement

## 🛠️ Technology Stack

### Frontend
- **React 18** with TypeScript
- **React Flow** for visual node interface
- **Remotion** for video rendering
- **Tailwind CSS** for styling
- **Vite** for build tooling

### Backend
- **Python FastAPI** for API server
- **FFmpeg** for video processing
- **MoviePy** for Python video manipulation
- **PySceneDetect** for scene analysis
- **OpenCV** for computer vision

### AI & Cloud Services
- **Google Cloud Speech API** for transcription
- **Google Cloud Translate API** for text translation
- **Gemini AI** for content generation and TTS
- **Custom AI models** for scene detection

### Infrastructure
- **WebSocket** for real-time communication
- **Async processing** for video operations
- **Cloud storage** integration
- **Docker** containerization ready

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm/yarn
- Python 3.9+
- FFmpeg installed
- Google Cloud credentials (optional for full AI features)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Insomnia38/insomv23
   cd insomv23
   ```

2. **Setup Backend**
   ```bash
   cd backend
   pip install -r requirements.txt
   python main.py
   ```

3. **Setup Remotion Renderer** (New Terminal)
   ```bash
   cd backend/remotion-renderer
   npm install
   npm start
   ```

4. **Setup Frontend** (New Terminal)
   ```bash
   npm install
   npm run dev
   ```

5. **Configure Environment** (Optional - for full AI features)
   ```bash
   # Create backend/.env file
   GEMINI_API_KEY=your_gemini_api_key
   GOOGLE_APPLICATION_CREDENTIALS=path_to_your_service_account.json
   ```

6. **Access the Application**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:8080
   - Remotion Renderer: http://localhost:3000

## 📖 Usage Guide

### Basic Workflow

1. **Upload Video** - Drag and drop your video file
2. **Automatic Analysis** - AI segments video into scenes
3. **Apply AI Agents** - Drag agents onto scenes in Story Web view
4. **Fine-tune in Timeline** - Switch to Timeline for precise editing
5. **Export** - Download your enhanced video

### AI Agent Usage

Each AI agent can be applied to individual scenes or entire videos:

- **Drag and Drop** - Visual connection in Story Web
- **Configure Settings** - Adjust agent parameters
- **Real-time Processing** - See progress and results
- **Preview Results** - Interactive scene preview

## 🔧 Development

### Project Structure
```
insomnia/
├── src/                    # Frontend React application
│   ├── components/         # Reusable UI components
│   ├── features/          # Feature-specific components
│   ├── services/          # API and business logic
│   └── types.ts           # TypeScript definitions
├── backend/               # Python FastAPI backend
│   ├── main.py           # API server entry point
│   ├── video_analysis/   # Video processing modules
│   └── multi_tool_agent/ # AI agent implementations
└── docs/                 # Documentation
```

### Key Components

- **Story Web** (`src/App.tsx`) - Main visual interface
- **Timeline Editor** (`src/features/editor/`) - Professional editing interface
- **AI Processing** (`src/services/aiProcessingManager.ts`) - Agent orchestration
- **Video Analysis** (`backend/video_analysis/`) - Scene detection and analysis
- **Audio Translator** (`backend/multi_tool_agent/audio-translator.py`) - Translation pipeline

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🙏 Acknowledgments

- **PySceneDetect** for scene detection algorithms
- **Google Cloud** for AI services
- **React Flow** for visual node interface
- **Remotion** for video rendering capabilities
- **FFmpeg** for video processing foundation

---

<div align="center">
  <strong>Made with ❤️ for the future of video editing</strong>
</div>
