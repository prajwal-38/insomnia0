export interface ProjectMetadata {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  lastModified: Date;
  thumbnail?: string;
  videoFileName?: string;
  duration?: number;
  sceneCount?: number;
  userId?: string; // User ID for project ownership
}

export class ProjectManager {
  private static readonly PROJECTS_KEY = 'storyboard-projects';
  private static readonly MAX_RECENT_PROJECTS = 10;

  // Sync projects with backend when user is authenticated
  static async syncWithBackend(userId: string): Promise<void> {
    try {
      const { projectService } = await import('../services/projectService');
      const backendProjects = await projectService.getUserProjects();

      // Convert backend projects to local format
      const localProjects: ProjectMetadata[] = backendProjects.map(bp => ({
        id: bp.id,
        name: bp.name,
        description: bp.description,
        createdAt: new Date(bp.created_at),
        lastModified: new Date(bp.last_modified),
        thumbnail: bp.thumbnail,
        videoFileName: bp.video_file_name,
        duration: bp.duration,
        sceneCount: bp.scene_count,
        userId: userId
      }));

      // Update localStorage with backend data
      localStorage.setItem(this.PROJECTS_KEY, JSON.stringify(localProjects));
      console.log(`✅ Synced ${localProjects.length} projects from backend`);
    } catch (error) {
      console.error('❌ Failed to sync projects with backend:', error);
    }
  }

  static getAllProjects(userId?: string): ProjectMetadata[] {
    try {
      const saved = localStorage.getItem(this.PROJECTS_KEY);
      if (!saved) return [];

      const allProjects = JSON.parse(saved).map((p: any) => ({
        ...p,
        createdAt: new Date(p.createdAt),
        lastModified: new Date(p.lastModified)
      }));

      // Filter by user ID if provided
      if (userId) {
        return allProjects.filter((p: ProjectMetadata) => p.userId === userId);
      }

      return allProjects;
    } catch (error) {
      console.error('Error loading projects:', error);
      return [];
    }
  }

  static saveProject(project: ProjectMetadata): void {
    try {
      const projects = this.getAllProjects();
      const existingIndex = projects.findIndex(p => p.id === project.id);
      
      if (existingIndex >= 0) {
        projects[existingIndex] = project;
      } else {
        projects.unshift(project);
      }

      // Keep only the most recent projects
      const trimmedProjects = projects
        .sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime())
        .slice(0, this.MAX_RECENT_PROJECTS);

      localStorage.setItem(this.PROJECTS_KEY, JSON.stringify(trimmedProjects));
    } catch (error) {
      console.error('Error saving project:', error);
    }
  }

  static deleteProject(projectId: string): void {
    try {
      const projects = this.getAllProjects();
      const filtered = projects.filter(p => p.id !== projectId);
      localStorage.setItem(this.PROJECTS_KEY, JSON.stringify(filtered));
    } catch (error) {
      console.error('Error deleting project:', error);
    }
  }

  static async createNewProject(name: string, description?: string, userId?: string): Promise<ProjectMetadata> {
    const project: ProjectMetadata = {
      id: `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      description,
      createdAt: new Date(),
      lastModified: new Date(),
      userId
    };

    // Save locally first
    this.saveProject(project);

    // If user is authenticated, also create in backend
    if (userId) {
      try {
        const { projectService } = await import('../services/projectService');
        const backendProject = await projectService.createProject({
          name,
          description
        });

        // Update local project with backend ID and data
        const updatedProject: ProjectMetadata = {
          ...project,
          id: backendProject.id,
          createdAt: new Date(backendProject.created_at),
          lastModified: new Date(backendProject.last_modified)
        };

        this.saveProject(updatedProject);
        console.log('✅ Project created in backend:', backendProject.id);
        return updatedProject;
      } catch (error) {
        console.error('❌ Failed to create project in backend:', error);
        // Return local project even if backend fails
      }
    }

    return project;
  }

  static updateProjectMetadata(projectId: string, updates: Partial<ProjectMetadata>): void {
    try {
      const projects = this.getAllProjects();
      const projectIndex = projects.findIndex(p => p.id === projectId);
      
      if (projectIndex >= 0) {
        projects[projectIndex] = {
          ...projects[projectIndex],
          ...updates,
          lastModified: new Date()
        };
        localStorage.setItem(this.PROJECTS_KEY, JSON.stringify(projects));
      }
    } catch (error) {
      console.error('Error updating project metadata:', error);
    }
  }

  static getRecentProjects(limit: number = 5, userId?: string): ProjectMetadata[] {
    return this.getAllProjects(userId)
      .sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime())
      .slice(0, limit);
  }

  // Migration function to add userId to existing projects
  static migrateProjectsToUser(userId: string): void {
    try {
      const projects = this.getAllProjects();
      const migratedProjects = projects.map(project => ({
        ...project,
        userId: project.userId || userId // Only add userId if it doesn't exist
      }));

      localStorage.setItem(this.PROJECTS_KEY, JSON.stringify(migratedProjects));
      console.log(`Migrated ${projects.length} projects to user ${userId}`);
    } catch (error) {
      console.error('Error migrating projects:', error);
    }
  }
}
