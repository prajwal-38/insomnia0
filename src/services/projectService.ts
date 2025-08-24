// Project service for backend API integration
import Cookies from 'js-cookie';
import { getApiBaseUrl } from '../config/environment';

export interface BackendProject {
  id: string;
  name: string;
  description?: string;
  thumbnail?: string;
  video_file_name?: string;
  duration?: number;
  scene_count?: number;
  created_at: string;
  updated_at: string;
  last_modified: string;
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  thumbnail?: string;
  video_file_name?: string;
  duration?: number;
  scene_count?: number;
}

class ProjectService {
  private getAuthHeaders(): HeadersInit {
    const token = Cookies.get('auth_token');
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : '',
    };
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      if (response.status === 401) {
        // Token expired or invalid, redirect to login
        Cookies.remove('auth_token');
        window.location.href = '/';
        throw new Error('Authentication required');
      }
      
      const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(errorData.detail || `HTTP ${response.status}`);
    }
    
    return response.json();
  }

  async createProject(projectData: CreateProjectRequest): Promise<BackendProject> {
    const apiUrl = `${getApiBaseUrl()}/api/projects`;
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(projectData),
    });

    return this.handleResponse<BackendProject>(response);
  }

  async getUserProjects(): Promise<BackendProject[]> {
    const apiUrl = `${getApiBaseUrl()}/api/projects`;
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });

    const data = await this.handleResponse<{ projects: BackendProject[] }>(response);
    return data.projects;
  }

  async getProject(projectId: string): Promise<BackendProject> {
    const apiUrl = `${getApiBaseUrl()}/api/projects/${projectId}`;
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });

    return this.handleResponse<BackendProject>(response);
  }

  async updateProject(projectId: string, projectData: UpdateProjectRequest): Promise<BackendProject> {
    const apiUrl = `${getApiBaseUrl()}/api/projects/${projectId}`;
    
    const response = await fetch(apiUrl, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(projectData),
    });

    return this.handleResponse<BackendProject>(response);
  }

  async deleteProject(projectId: string): Promise<void> {
    const apiUrl = `${getApiBaseUrl()}/api/projects/${projectId}`;
    
    const response = await fetch(apiUrl, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    });

    await this.handleResponse<{ message: string; project_id: string }>(response);
  }

  // Sync local project with backend
  async syncProjectWithBackend(localProject: any): Promise<BackendProject> {
    try {
      // Try to get the project from backend first
      const backendProject = await this.getProject(localProject.id);
      return backendProject;
    } catch (error) {
      // If project doesn't exist in backend, create it
      if (error instanceof Error && error.message.includes('404')) {
        return this.createProject({
          name: localProject.name,
          description: localProject.description,
        });
      }
      throw error;
    }
  }
}

export const projectService = new ProjectService();
