import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { motion } from 'framer-motion';
import { ProjectManager, type ProjectMetadata } from '@/utils/projectManager';
import { useAuth } from '@/contexts/AuthContext';
import GoogleSignIn from '@/components/GoogleSignIn';
import UserProfile from '@/components/UserProfile';
import { VideoUploadModal } from '@/components/VideoUploadModal';
import type { ApiAnalysisResponse } from '@/types';

const StartingPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated, isGuest, isLoading: authLoading } = useAuth();
  const [projects, setProjects] = useState<ProjectMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [showVideoUpload, setShowVideoUpload] = useState(false);

  // Load previous projects from localStorage
  useEffect(() => {
    const loadProjects = async () => {
      try {
        await new Promise(resolve => setTimeout(resolve, 300));
        // Load projects for the authenticated user, or all projects for guests
        const recentProjects = ProjectManager.getRecentProjects(8, user?.id);
        setProjects(recentProjects);

        // Migrate existing projects to the authenticated user if they don't have a userId
        if (isAuthenticated && user) {
          ProjectManager.migrateProjectsToUser(user.id);
          // Also sync with backend
          ProjectManager.syncWithBackend(user.id).catch(error => {
            console.error('Failed to sync with backend:', error);
          });
        }
      } catch (error) {
        console.error('Error loading projects:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (!authLoading) {
      loadProjects();
    }
  }, [user, isAuthenticated, authLoading]);

  // Refresh projects when the page becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && !authLoading) {
        const recentProjects = ProjectManager.getRecentProjects(8, user?.id);
        setProjects(recentProjects);
      }
    };
    const handleFocus = () => {
      if (!authLoading) {
        const recentProjects = ProjectManager.getRecentProjects(8, user?.id);
        setProjects(recentProjects);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [user, authLoading]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key === 'n') {
        event.preventDefault();
        handleCreateNewProject();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleCreateNewProject = () => {
    if (!isAuthenticated && !isGuest) {
      setShowAuthPrompt(true);
      return;
    }

    // Show video upload modal instead of creating project immediately
    setShowVideoUpload(true);
  };

  const handleVideoUploadComplete = async (result: ApiAnalysisResponse) => {
    console.log('🎯 StartingPage: handleVideoUploadComplete called with result:', {
      analysisId: result?.analysisId,
      fileName: result?.fileName,
      sceneCount: result?.scenes?.length || 0
    });

    try {
      // Clear all existing project data before creating new project
      console.log('🧹 StartingPage: Clearing existing project data...');

      // Import and use the project data manager's clear corrupted data function
      const { ProjectDataManager } = await import('./utils/projectDataManager');
      ProjectDataManager.clearCorruptedData();

      // Clear legacy data that might cause migration issues
      localStorage.removeItem('storyboard-project-nodes');
      localStorage.removeItem('storyboard-project-edges');
      localStorage.removeItem('storyboard-current-analysis');
      localStorage.removeItem('storyboard-project-viewport');
      localStorage.removeItem('storyboard-unsaved-metadata');

      // Clear optimized system data
      localStorage.removeItem('storyboard-project-v2');
      localStorage.removeItem('storyboard-project-backup-v2');
      localStorage.removeItem('storyboard-migration-completed');

      // Clear any timeline data
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (
          key.startsWith('timeline-') ||
          key.startsWith('storyboard_timeline_') ||
          key.includes('scene-') ||
          key.startsWith('storyboard-project-nodes-') ||
          key.startsWith('storyboard-project-edges-')
        )) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));

      console.log(`✅ StartingPage: Cleared ${keysToRemove.length + 7} localStorage entries`);

      const newProject = await ProjectManager.createNewProject(
        `Project ${new Date().toLocaleDateString()}`,
        'New video editing project',
        user?.id // Will be undefined for guests, which is fine for localStorage-only projects
      );

      console.log('✅ StartingPage: Project created:', newProject.id);

      // Store the new analysis data directly in the optimized format
      const { projectDataManager } = await import('./utils/projectDataManager');
      await projectDataManager.createFromAnalysis(result);

      console.log('✅ StartingPage: Analysis data saved to optimized system');

      // Store analysis ID and project ID for the editor
      localStorage.setItem('storyboard-current-analysis', result.analysisId);
      localStorage.setItem('storyboard-current-project-id', newProject.id);

      console.log('🚀 StartingPage: Navigating to editor...');
      navigate(`/editor/${newProject.id}`);
    } catch (error) {
      console.error('❌ StartingPage: Failed to create project:', error);
    }
  };

  const handleVideoUploadError = (error: string) => {
    console.error('❌ StartingPage: Video upload error:', error);
    // Could show a toast notification here if needed
  };

  const handleOpenProject = (project: ProjectMetadata) => {
    localStorage.setItem('storyboard-current-project-id', project.id);
    navigate(`/editor/${project.id}`);
  };

  const handleAuthSuccess = () => {
    setShowAuthPrompt(false);
    // Refresh projects after authentication
    if (user) {
      const recentProjects = ProjectManager.getRecentProjects(8, user.id);
      setProjects(recentProjects);
    }
  };

  const handleHelp = () => {
    window.open('https://docs.storyboard-os.com', '_blank');
  };

  const handleSettings = () => {
    console.log('Settings clicked');
    // Potentially navigate to a settings page or open a modal
  };

  const features = [
    {
      title: "AI-Powered Scene Analysis",
      description: "Automatically detect and analyze video scenes with advanced AI technology.",
      icon: "🤖",
      gradient: "from-sky-500 to-indigo-600"
    },
    {
      title: "Interactive Timeline",
      description: "Professional timeline editor with precise frame-level control and intuitive UX.",
      icon: "⏱️",
      gradient: "from-purple-500 to-pink-500"
    },
    {
      title: "Smart Metadata Management",
      description: "Organize your content with intelligent tagging and lightning-fast search capabilities.",
      icon: "🏷️",
      gradient: "from-emerald-500 to-teal-600"
    },
    {
      title: "Real-time Collaboration",
      description: "Work together with your team in real-time, no matter where they are.",
      icon: "👥",
      gradient: "from-amber-500 to-orange-600"
    },
    {
      title: "Export & Integration",
      description: "Export to multiple formats and integrate seamlessly with popular video platforms.",
      icon: "📤",
      gradient: "from-rose-500 to-red-600"
    },
    {
      title: "Cloud Storage & Sync",
      description: "Secure cloud storage with automatic backup, version history, and project sync.",
      icon: "☁️",
      gradient: "from-violet-500 to-fuchsia-600"
    }
  ];

  return (
    <div className="h-screen overflow-hidden flex flex-col lg:flex-row" style={{
      background: 'linear-gradient(135deg, #0a0a0a 0%, #111111 50%, #1a1a1a 100%)',
      color: '#f0f0f0'
    }}>
      {/* Sidebar */}
      <motion.div
        initial={{ x: -300, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="w-full lg:w-80 lg:min-h-screen flex flex-col shadow-2xl relative"
        style={{
          background: 'linear-gradient(180deg, #000000 0%, #111111 100%)',
          borderRight: '1px solid rgba(34, 197, 94, 0.2)'
        }}
      >
        {/* Glowing border effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-green-500/10 to-transparent opacity-50 blur-sm pointer-events-none"></div>

        <div className="relative z-10 p-6 flex flex-col h-full">
          {/* Logo/Brand */}
          <div className="mb-8">
            <div className="flex items-center mb-3">
              <div className="w-10 h-10 rounded-xl mr-3 flex items-center justify-center relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent"></div>
                {/* Primary Logo - Film strip graphic */}
                <img
                  src="/gc.jpeg"
                  alt="InsomnIA Logo"
                  className="w-8 h-8 relative z-10 object-contain"
                />
                <div className="absolute inset-0 shadow-lg shadow-cyan-500/50"></div>
              </div>
              <div>
                {/* Wordmark in Cyan */}
                <h1 className="text-2xl font-bold" style={{ color: '#40E0D0' }}>
                  INSOMNIA
                </h1>
                <div className="text-xs opacity-60 mt-0.5" style={{ color: '#40E0D0' }}>v2.0.0 Beta</div>
              </div>
            </div>
            <p className="text-sm opacity-70">Professional Video Editing Suite</p>
          </div>

          {/* Authentication Section */}
          <div className="mb-6">
            {isAuthenticated ? (
              <div className="flex items-center justify-between p-3 rounded-xl"
                   style={{
                     background: 'linear-gradient(135deg, rgba(64, 224, 208, 0.1) 0%, rgba(255, 105, 180, 0.1) 100%)',
                     border: '1px solid rgba(64, 224, 208, 0.2)'
                   }}>
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-pink-500 flex items-center justify-center text-white text-sm font-semibold">
                    {user?.name?.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-cyan-400">{user?.name}</p>
                    <p className="text-xs opacity-60">{user?.email}</p>
                  </div>
                </div>
                <UserProfile />
              </div>
            ) : isGuest ? (
              <div className="flex items-center justify-between p-3 rounded-xl"
                   style={{
                     background: 'linear-gradient(135deg, rgba(255, 105, 180, 0.1) 0%, rgba(64, 224, 208, 0.1) 100%)',
                     border: '1px solid rgba(255, 105, 180, 0.2)'
                   }}>
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 to-cyan-500 flex items-center justify-center text-white text-sm font-semibold">
                    G
                  </div>
                  <div>
                    <p className="text-sm font-medium text-pink-400">Guest User</p>
                    <p className="text-xs opacity-60">Local storage only</p>
                  </div>
                </div>
                <UserProfile />
              </div>
            ) : (
              <div className="text-center">
                <p className="text-sm opacity-70 mb-4">Continue as guest to access all features</p>
                <GoogleSignIn variant="custom" onSuccess={handleAuthSuccess} />
              </div>
            )}
          </div>

          {/* Main Actions */}
          <div className="mb-8">
            <Button
              onClick={handleCreateNewProject}
              className="w-full h-12 font-semibold text-white transition-all duration-300 rounded-xl text-base relative overflow-hidden group"
              style={{
                background: '#FF69B4',
                boxShadow: '0 8px 32px rgba(255, 105, 180, 0.4)'
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <span className="relative z-10">Create New Project</span>
            </Button>
          </div>

          {/* Previous Projects */}
          <div className="flex-1 mb-8 min-h-0">
            <h3 className="text-lg font-semibold mb-4" style={{ color: '#40E0D0' }}>Recent Projects</h3>
            <div className="space-y-2 max-h-[calc(100vh-450px)] lg:max-h-96 overflow-y-auto pr-1"
                 style={{ scrollbarWidth: 'thin', scrollbarColor: '#22c55e transparent' }}>
              {isLoading ? (
                <div className="text-center py-8 opacity-60">
                  <div className="animate-spin w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full mx-auto mb-3"></div>
                  <p className="text-sm">Loading projects...</p>
                </div>
              ) : projects.length > 0 ? (
                projects.map((project) => (
                  <motion.div
                    key={project.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    whileHover={{ scale: 1.02 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Card
                      className="cursor-pointer transition-all duration-300 rounded-xl border-0 relative overflow-hidden group"
                      onClick={() => handleOpenProject(project)}
                      style={{
                        background: 'linear-gradient(135deg, #1a1a1a 0%, #111111 100%)',
                        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)'
                      }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 to-pink-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                      <div className="absolute inset-0 border border-cyan-500/20 group-hover:border-cyan-500/40 rounded-xl transition-colors duration-300"></div>
                      <CardContent className="p-4 relative z-10">
                        <h4 className="font-medium text-sm truncate mb-1">{project.name}</h4>
                        <p className="text-xs opacity-60 mb-1">
                          {project.lastModified.toLocaleDateString()}
                        </p>
                        {project.description && (
                          <p className="text-xs opacity-50 truncate">
                            {project.description}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                ))
              ) : (
                <div className="text-center py-8 opacity-60">
                  <p className="text-sm">No recent projects found.</p>
                  <p className="text-xs mt-1 opacity-70">Start by creating a new project.</p>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Actions */}
          <div className="space-y-3 mt-auto">
            <Button
              variant="outline"
              onClick={handleHelp}
              className="w-full transition-all duration-300 rounded-xl border-0 relative overflow-hidden group"
              style={{
                background: 'linear-gradient(135deg, #1a1a1a 0%, #111111 100%)',
                border: '1px solid rgba(64, 224, 208, 0.3)'
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <span className="relative z-10 flex items-center justify-center" style={{ color: '#40E0D0' }}>
                <span className="mr-2">📚</span>
                Help & Docs
              </span>
            </Button>
            <Button
              variant="outline"
              onClick={handleSettings}
              className="w-full transition-all duration-300 rounded-xl border-0 relative overflow-hidden group"
              style={{
                background: 'linear-gradient(135deg, #1a1a1a 0%, #111111 100%)',
                border: '1px solid rgba(64, 224, 208, 0.3)'
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <span className="relative z-10 flex items-center justify-center" style={{ color: '#40E0D0' }}>
                <span className="mr-2">⚙️</span>
                Settings
              </span>
            </Button>

            <div className="mt-6 pt-4" style={{ borderTop: '1px solid rgba(138, 43, 226, 0.2)' }}>
              <p className="text-xs text-center opacity-50">
                Press <kbd className="px-2 py-1 rounded-md text-xs font-mono"
                          style={{ background: 'rgba(64, 224, 208, 0.2)', color: '#40E0D0' }}>Ctrl+N</kbd> for new project
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto relative"
           style={{
             background: 'linear-gradient(135deg, #0a0a0a 0%, #000000 50%, #111111 100%)',
             scrollbarWidth: 'thin',
             scrollbarColor: '#22c55e transparent'
           }}>
        {/* Ambient glow effects */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl"></div>
        <div className="absolute top-1/3 right-1/4 w-64 h-64 bg-pink-500/5 rounded-full blur-3xl"></div>

        <div className="max-w-6xl mx-auto p-6 lg:p-10 relative z-10">
          {/* Hero Section */}
          <motion.div
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-center mb-16"
          >
            <h1 className="text-5xl lg:text-7xl font-bold mb-6 bg-clip-text text-transparent leading-tight"
                style={{
                  backgroundImage: 'linear-gradient(90deg, #40E0D0 0%, #FF69B4 100%)'
                }}>
              Welcome to InsomnIA
            </h1>
            <p className="text-xl mb-12 max-w-3xl mx-auto leading-relaxed" style={{ color: '#E0E0E0' }}>
              The next-generation video editing platform combining AI-powered analysis with professional tools to revolutionize your creative workflow.
            </p>

            <div className="relative max-w-4xl mx-auto mb-12">
              <div className="aspect-video rounded-2xl flex items-center justify-center backdrop-blur-md relative overflow-hidden group cursor-pointer"
                   style={{
                     background: 'linear-gradient(135deg, rgba(26, 26, 26, 0.8) 0%, rgba(17, 17, 17, 0.8) 100%)',
                     border: '1px solid rgba(64, 224, 208, 0.3)',
                     boxShadow: '0 12px 40px rgba(64, 224, 208, 0.15)'
                   }}>
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-pink-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <div className="text-center p-8 relative z-10">
                  <div className="w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center relative overflow-hidden group-hover:scale-110 transition-transform duration-300"
                       style={{
                         background: '#40E0D0',
                         boxShadow: '0 6px 24px rgba(64, 224, 208, 0.4)'
                       }}>
                    <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent"></div>
                    <div className="relative z-10 w-0 h-0 border-l-[12px] border-l-white border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent ml-1"></div>
                  </div>
                  <p className="text-xl font-medium mb-2" style={{ color: '#40E0D0' }}>Watch the Intro</p>
                  <p className="text-sm opacity-60">
                    Discover how InsomnIA transforms video editing. (Video coming soon)
                  </p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Stats Section */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="mb-20"
          >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
              {[
                { number: "10+", label: "Beta Testers" },
                { number: "500+", label: "Videos Processed" },
                { number: "99.9%", label: "Uptime SLA" },
                { number: "24/7", label: "Support" }
              ].map((stat, index) => (
                <motion.div
                  key={stat.label}
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.5, delay: 0.1 * index + 0.3 }}
                  className="text-center p-6 rounded-2xl relative overflow-hidden group"
                  style={{
                    background: 'linear-gradient(135deg, rgba(26, 26, 26, 0.6) 0%, rgba(17, 17, 17, 0.6) 100%)',
                    border: '1px solid rgba(34, 197, 94, 0.2)',
                    boxShadow: '0 6px 24px rgba(0, 0, 0, 0.25)'
                  }}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 to-pink-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  <div className="relative z-10">
                    <div className="text-3xl md:text-4xl font-bold mb-2" style={{ color: '#40E0D0' }}>
                      {stat.number}
                    </div>
                    <div className="text-sm opacity-70">{stat.label}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Features Grid */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="mb-20"
          >
            <h2 className="text-4xl font-bold text-center mb-12 bg-clip-text text-transparent"
                style={{
                  backgroundImage: 'linear-gradient(90deg, #40E0D0 0%, #FF69B4 100%)'
                }}>
              Powerful Features, Seamlessly Integrated
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.map((feature, index) => (
                <motion.div
                  key={feature.title}
                  initial={{ y: 30, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.5, delay: 0.1 * index + 0.4 }}
                  whileHover={{ y: -5 }}
                >
                  <Card className="h-full backdrop-blur-sm transition-all duration-300 rounded-2xl border-0 relative overflow-hidden group"
                        style={{
                          background: 'linear-gradient(135deg, rgba(26, 26, 26, 0.6) 0%, rgba(17, 17, 17, 0.6) 100%)',
                          border: '1px solid rgba(64, 224, 208, 0.2)',
                          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
                        }}>
                    <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-pink-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                    <CardHeader className="items-center text-center md:items-start md:text-left relative z-10">
                      <div className="w-16 h-16 flex items-center justify-center rounded-2xl mb-4 relative overflow-hidden"
                           style={{
                             background: `linear-gradient(135deg, ${feature.gradient.includes('sky') ? '#40E0D0, #20B2AA' :
                                                                   feature.gradient.includes('purple') ? '#FF69B4, #FF1493' :
                                                                   feature.gradient.includes('emerald') ? '#40E0D0, #20B2AA' :
                                                                   feature.gradient.includes('amber') ? '#FF69B4, #FF1493' :
                                                                   feature.gradient.includes('rose') ? '#FF69B4, #FF1493' :
                                                                   '#40E0D0, #20B2AA'})`,
                             boxShadow: '0 8px 32px rgba(64, 224, 208, 0.3)'
                           }}>
                        <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent"></div>
                        <span className="text-3xl relative z-10">{feature.icon}</span>
                      </div>
                      <CardTitle className="text-xl">{feature.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-center md:text-left relative z-10">
                      <CardDescription className="opacity-70 text-sm leading-relaxed">
                        {feature.description}
                      </CardDescription>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Testimonials */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.5 }}
            className="mb-20"
          >
            <h2 className="text-4xl font-bold text-center mb-12 bg-clip-text text-transparent"
                style={{
                  backgroundImage: 'linear-gradient(90deg, #40E0D0 0%, #FF69B4 100%)'
                }}>
              Trusted by Creators
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {[
                { quote: "InsomnIA has completely transformed our video production. The AI analysis saves us countless hours.", role: "CEO", company: "InsomnIA" },
                { quote: "The timeline editor is incredibly intuitive and powerful. We can finally focus on creativity.", role: "Video Editor" },
                { quote: "Real-time collaboration is a game-changer for our distributed team. Highly recommended!", role: "Marketing Director" }
              ].map((testimonial, index) => (
                <motion.div
                  key={`testimonial-${index}`}
                  initial={{ y: 30, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.5, delay: 0.1 * index + 0.5 }}
                  whileHover={{ y: -5 }}
                >
                  <Card className="h-full backdrop-blur-sm rounded-2xl border-0 relative overflow-hidden group"
                        style={{
                          background: 'linear-gradient(135deg, rgba(26, 26, 26, 0.6) 0%, rgba(17, 17, 17, 0.6) 100%)',
                          border: '1px solid rgba(64, 224, 208, 0.2)',
                          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
                        }}>
                    <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-pink-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                    <CardContent className="p-6 relative z-10">
                      <p className="mb-6 italic text-base leading-relaxed opacity-90">"{testimonial.quote}"</p>
                      <div className="pt-4" style={{ borderTop: '1px solid rgba(34, 197, 94, 0.2)' }}>
                        <p className="font-semibold">{testimonial.author}</p>
                        <p className="text-sm opacity-70 mt-1">{testimonial.role}</p>
                        <p className="text-xs mt-1" style={{ color: '#40E0D0' }}>{testimonial.company}</p>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Call to Action */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.6 }}
            className="text-center"
          >
            <Card className="max-w-2xl mx-auto backdrop-blur-md rounded-2xl border-0 relative overflow-hidden"
                  style={{
                    background: 'linear-gradient(135deg, rgba(64, 224, 208, 0.15) 0%, rgba(255, 105, 180, 0.15) 100%)',
                    border: '1px solid rgba(64, 224, 208, 0.3)',
                    boxShadow: '0 12px 40px rgba(64, 224, 208, 0.15)'
                  }}>
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-pink-500/10"></div>
              <CardContent className="p-8 md:p-12 relative z-10">
                <h3 className="text-3xl font-bold mb-4 bg-clip-text text-transparent"
                    style={{
                      backgroundImage: 'linear-gradient(90deg, #40E0D0 0%, #FF69B4 100%)'
                    }}>
                  Ready to Elevate Your Vision?
                </h3>
                <p className="opacity-80 mb-8 leading-relaxed">
                  Join thousands of creators using InsomnIA to bring their stories to life. Start your journey today.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Button
                    onClick={handleCreateNewProject}
                    size="lg"
                    className="font-semibold text-white transition-all duration-300 rounded-xl px-8 py-3 text-base relative overflow-hidden group"
                    style={{
                      background: '#FF69B4',
                      boxShadow: '0 6px 24px rgba(255, 105, 180, 0.4)'
                    }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    <span className="relative z-10">Start Creating Now</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={handleHelp}
                    className="transition-all duration-300 rounded-xl px-8 py-3 text-base border-0 relative overflow-hidden group"
                    style={{
                      background: 'linear-gradient(135deg, rgba(26, 26, 26, 0.8) 0%, rgba(17, 17, 17, 0.8) 100%)',
                      border: '1px solid rgba(64, 224, 208, 0.4)',
                      color: '#40E0D0'
                    }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    <span className="relative z-10">Learn More</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Footer */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.7 }}
            className="mt-20 pt-10 text-center"
            style={{ borderTop: '1px solid rgba(138, 43, 226, 0.2)' }}
          >
            <div className="flex flex-col md:flex-row justify-between items-center max-w-4xl mx-auto text-sm">
              <div className="mb-4 md:mb-0">
                <p className="opacity-60">
                  © {new Date().getFullYear()} InsomnIA OS. All rights reserved.
                </p>
              </div>
              <div className="flex space-x-6 opacity-60">
                <a href="#" className="hover:opacity-100 transition-all duration-300"
                   style={{ color: '#9d4edd' }}>
                  Privacy Policy
                </a>
                <a href="#" className="hover:opacity-100 transition-all duration-300"
                   style={{ color: '#9d4edd' }}>
                  Terms of Service
                </a>
                <a href="#" className="hover:opacity-100 transition-all duration-300"
                   style={{ color: '#9d4edd' }}>
                  Contact
                </a>
                <a href="https://github.com/prajwal-38" target="_blank" rel="noopener noreferrer"
                   className="hover:opacity-100 transition-all duration-300"
                   style={{ color: '#9d4edd' }}>
                  GitHub
                </a>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Authentication Dialog */}
      <Dialog open={showAuthPrompt} onOpenChange={setShowAuthPrompt}>
        <DialogContent className="sm:max-w-md" style={{
          background: 'linear-gradient(135deg, #1a1a1a 0%, #111111 100%)',
          border: '1px solid rgba(64, 224, 208, 0.3)'
        }}>
          <DialogHeader>
            <DialogTitle className="text-center text-xl font-bold bg-clip-text text-transparent"
                         style={{
                           backgroundImage: 'linear-gradient(90deg, #40E0D0 0%, #FF69B4 100%)'
                         }}>
              Welcome to InsomnIA
            </DialogTitle>
            <DialogDescription className="text-center opacity-80">
              Continue as a guest to create and manage your projects locally.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center space-y-4 py-4">
            <GoogleSignIn
              variant="custom"
              onSuccess={() => {
                handleAuthSuccess();
                // Automatically create project after successful auth
                setTimeout(async () => {
                  if (user) {
                    try {
                      const newProject = await ProjectManager.createNewProject(
                        `Project ${new Date().toLocaleDateString()}`,
                        'New video editing project',
                        user.id
                      );
                      localStorage.removeItem('storyboard-project-v2');
                      localStorage.removeItem('storyboard-project-backup-v2');
                      localStorage.removeItem('storyboard-current-analysis');
                      localStorage.setItem('storyboard-current-project-id', newProject.id);
                      navigate(`/editor/${newProject.id}`);
                    } catch (error) {
                      console.error('Failed to create project after auth:', error);
                    }
                  }
                }, 100);
              }}
              onError={(error) => {
                console.error('Authentication error:', error);
              }}
            />
            <p className="text-xs text-center opacity-60 max-w-sm">
              Your projects will be stored locally in your browser. No account required.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Video Upload Modal */}
      <VideoUploadModal
        isOpen={showVideoUpload}
        onClose={() => setShowVideoUpload(false)}
        onUploadComplete={handleVideoUploadComplete}
        onUploadError={handleVideoUploadError}
      />
    </div>
  );
};

export default StartingPage;