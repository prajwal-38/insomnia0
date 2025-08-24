// src/Sidebar.tsx
import React, { useRef } from 'react';
import VideoUploader from './VideoUploader';
import type { AppNodeData } from './App'; // For onAddNode type
import type { ApiAnalysisResponse, AnalyzedScene, UnsavedMetadataChanges, SearchMatch } from './types';
import SceneList from './SceneList';
import MetadataEditor from './MetaDataEditor';
import SceneSearchAndFilter from './components/SceneSearchAndFilter';
import AIAgentsPanel from './components/AIAgentsPanel';
import type { AIAgentType } from './types';

export type PanelKey = 'storyWeb' | 'sceneBlocks' | 'video' | 'sceneList' | 'metadataEditor' | 'controls' | 'settings' | 'search' | 'aiAgents' | 'aiChat';

interface SidebarProps {
  activePanelKey: PanelKey | null;
  onTogglePanel: (key: PanelKey) => void;
  onToggleSidebarVisibility: () => void;
  onNavigateToRootNode: () => void;
  onZoomToFit: () => void;
  onResetAppData: () => void;
  onAddNode: (type: AppNodeData['type']) => void;
  snapToGrid: boolean;
  onToggleSnapToGrid: (checked: boolean) => void;
  onDeleteSelected: () => void;
  hasSelection: boolean;
  onAnalysisComplete: (data: ApiAnalysisResponse) => void;
  onAnalysisError: (error: string) => void;
  currentAnalysisData: ApiAnalysisResponse | null;
  onSceneSelect: (scene: AnalyzedScene) => void;
  unsavedChangesForCurrentAnalysis: UnsavedMetadataChanges[string] | undefined; // Changes for current analysis, keyed by sceneId
  selectedSceneIdsInEditor: Set<string>;
  onMetadataEditorSceneChange: (sceneId: string, updates: UnsavedSceneChanges) => void;
  onSaveAllMetadataChanges: () => void; // analysisId is implicit from currentAnalysisData in App.tsx
  onMetadataEditorSelectionChange: (sceneId: string, selected: boolean) => void;
  onBulkTagScenes: (sceneIds: string[], tag: string) => void; // analysisId implicit
  searchTerm: string;
  activeTagFilters: Set<string>;
  searchResults: SearchMatch[];
  currentMatchIndex: number | null;
  onSearchTermChange: (term: string) => void;
  onTagFilterChange: (tag: string, isActive: boolean) => void;
  onClearAllFilters: () => void;
  onSearchResultClick: (match: SearchMatch) => void;
  onNavigateMatch: (direction: 'next' | 'previous') => void;
  apiHealthy: boolean;
  onExportProject: () => void;
  onImportProject: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onAddAIAgent: (agentType: AIAgentType) => void;
  geminiApiConnected: boolean;
  // makeSceneMetadataUpdateRequest is not directly used by Sidebar, but passed down from App to CustomSceneNode if needed
  // For MetadataEditor, it uses onMetadataEditorSceneChange which App.tsx uses to trigger its own API calls.
}

const iconMap: Record<PanelKey | 'collapse' | 'export' | 'import', { icon: string; title: string; panelTitle?: string }> = {
  search: { icon: '🔍', title: 'Search & Filter Scenes', panelTitle: 'Search & Filter' },
  storyWeb: { icon: '🕸️', title: 'Story Web View', panelTitle: 'Story Web Tools' },
  sceneBlocks: { icon: '🧩', title: 'Scene Blocks View (Concept)', panelTitle: 'Scene Blocks (Concept)' },
  video: { icon: '🎞️', title: 'Analyze New Video', panelTitle: 'Analyze Video' },
  sceneList: { icon: '📋', title: 'Current Scene List', panelTitle: 'Analyzed Scenes' },
  metadataEditor: { icon: '✏️', title: 'Edit Scene Metadata', panelTitle: 'Scene Metadata Editor' },
  controls: { icon: '🎛️', title: 'Canvas Controls', panelTitle: 'Canvas Controls' },
  aiAgents: { icon: '🤖', title: 'AI Agents for Video Editing', panelTitle: 'AI Agents' },
  aiChat: { icon: '💬', title: 'AI Chat Assistant', panelTitle: 'AI Assistant' },
  settings: { icon: '⚙️', title: 'Project & App Settings', panelTitle: 'Project & App Settings' },
  collapse: { icon: '', title: 'Collapse Sidebar' },
  export: { icon: '💾', title: 'Export Project' },
  import: { icon: '📂', title: 'Import Project' },
};

const Sidebar: React.FC<SidebarProps> = ({
  activePanelKey, onTogglePanel, onToggleSidebarVisibility, onNavigateToRootNode, onZoomToFit, onResetAppData,
  onAddNode, snapToGrid, onToggleSnapToGrid, onDeleteSelected, hasSelection,
  onAnalysisComplete, onAnalysisError, currentAnalysisData, onSceneSelect,
  unsavedChangesForCurrentAnalysis, selectedSceneIdsInEditor, onMetadataEditorSceneChange,
  onSaveAllMetadataChanges, onMetadataEditorSelectionChange, onBulkTagScenes,
  searchTerm, activeTagFilters, searchResults, currentMatchIndex,
  onSearchTermChange, onTagFilterChange, onClearAllFilters, onSearchResultClick, onNavigateMatch,
  apiHealthy, onExportProject, onImportProject, onAddAIAgent, geminiApiConnected,
}) => {
  const topPanelKeys: PanelKey[] = ['search', 'storyWeb', 'video', 'sceneList', 'metadataEditor', 'controls', 'aiAgents', 'aiChat'];
  const bottomPanelKeys: PanelKey[] = ['settings'];
  const importFileRef = useRef<HTMLInputElement>(null);

  const handleImportClick = () => {
    importFileRef.current?.click();
  };

  const renderPanelContent = (key: PanelKey) => {
    switch (key) {
      case 'search':
        return (
          <div className="panel-section">
            <h4>{iconMap.search.panelTitle}</h4>
            {currentAnalysisData ? (
              <SceneSearchAndFilter
                allAnalyzedScenes={currentAnalysisData.scenes}
                currentAnalysisId={currentAnalysisData.analysisId} // sceneId used internally by search
                activeTagFilters={activeTagFilters}
                onSearchTermChange={onSearchTermChange}
                onTagFilterChange={onTagFilterChange}
                onClearAllFilters={onClearAllFilters}
                onSearchResultClick={onSearchResultClick}
                onNavigateMatch={onNavigateMatch}
                searchTerm={searchTerm}
                searchResults={searchResults} // SearchMatch includes sceneId
                currentMatchIndex={currentMatchIndex}
              />
            ) : ( <p className="panel-placeholder-text">Analyze a video to enable search and filters.</p> )}
          </div>
        );
      case 'storyWeb':
        return (
          <div className="panel-section">
            <h4>{iconMap.storyWeb.panelTitle}</h4>
            <button className="control-button" onClick={onNavigateToRootNode}>Back to Root</button>
            <button className="control-button" onClick={onZoomToFit}>Zoom to Fit</button>
          </div>
        );
      case 'sceneBlocks':
        return (
          <div className="panel-section">
            <h4>{iconMap.sceneBlocks.panelTitle}</h4>
            <p className="panel-placeholder-text">This feature is a concept and not yet implemented.</p>
          </div>
        );
      case 'video':
        return (
          <div className="panel-section">
            <h4>{iconMap.video.panelTitle}</h4>
            <VideoUploader onAnalysisComplete={onAnalysisComplete} onAnalysisError={onAnalysisError} />
          </div>
        );
      case 'sceneList':
        return (
          <div className="panel-section">
            <h4>{iconMap.sceneList.panelTitle}</h4>
            {currentAnalysisData ? (
              <SceneList
                analysisData={currentAnalysisData} // SceneList will use sceneId internally for keys
                // selectedSceneId={selectedSceneForPreview?.sceneId} // If you had a separate selected preview state
                onSceneSelect={onSceneSelect} // onSceneSelect in App.tsx receives the full scene object
              />
            ) : ( <p className="panel-placeholder-text">No video analyzed yet.</p> )}
          </div>
        );
      case 'metadataEditor':
        return (
          <div className="panel-section">
            <h4>{iconMap.metadataEditor.panelTitle}</h4>
            {currentAnalysisData ? (
              <MetadataEditor
                analysisData={currentAnalysisData}
                unsavedChanges={unsavedChangesForCurrentAnalysis}
                selectedSceneIds={selectedSceneIdsInEditor}
                onSceneChange={onMetadataEditorSceneChange}
                onSaveChanges={onSaveAllMetadataChanges}
                onSelectionChange={onMetadataEditorSelectionChange}
                onBulkTag={onBulkTagScenes}
                apiHealthy={apiHealthy}
              />
            ) : ( <p className="panel-placeholder-text">No video analyzed. Cannot edit metadata.</p> )}
          </div>
        );
      case 'controls':
        return (
          <div className="panel-section">
            <h4>{iconMap.controls.panelTitle}</h4>
            <button className="control-button" onClick={() => onAddNode('scene')}>Add Scene Node</button>
            <button className="control-button" onClick={() => onAddNode('note')}>Add Note Node</button>
            <label className="control-label">
              <input type="checkbox" checked={snapToGrid} onChange={(e) => onToggleSnapToGrid(e.target.checked)} /> Snap to Grid
            </label>
            {hasSelection && (
              <button className="control-button delete" onClick={onDeleteSelected}>Delete Selected</button>
            )}
          </div>
        );
      case 'settings':
        return (
          <div className="panel-section">
            <h4>{iconMap.settings.panelTitle}</h4>
            <h5>Project Data</h5>
            <button className="control-button" onClick={onExportProject} title="Save current project to a JSON file">
              {iconMap.export.icon} Export Project
            </button>
            <input type="file" ref={importFileRef} style={{display: 'none'}} accept=".json" onChange={onImportProject} />
            <button className="control-button" onClick={handleImportClick} title="Load project from a JSON file">
              {iconMap.import.icon} Import Project
            </button>
            <hr style={{margin: '1rem 0', borderColor: 'var(--primary-dark)'}}/>
            <h5>Application</h5>
             <button className="control-button delete" onClick={onResetAppData} title="Resets all nodes, connections, and analyzed video data. This cannot be undone.">
              Clear All App Data
            </button>
            <p className="panel-placeholder-text" style={{marginTop: '1rem'}}>More app settings coming soon.</p>
          </div>
        );
      case 'aiAgents':
        return (
          <div className="panel-section">
            <AIAgentsPanel
              onAddAIAgent={onAddAIAgent}
              geminiApiConnected={geminiApiConnected}
            />
          </div>
        );

      case 'aiChat':
        return (
          <div className="panel-section">
            <h4>{iconMap.aiChat.panelTitle}</h4>
            <p className="panel-placeholder-text">
              💬 AI Chat Assistant opens as a side panel. Click the chat icon to start a conversation with your AI video editing assistant.
            </p>
            <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <h5 className="text-sm font-medium text-blue-900 mb-2">Quick Commands:</h5>
              <ul className="text-xs text-blue-700 space-y-1">
                <li>• "Add subtitle agent to scene 1"</li>
                <li>• "Enhance video quality for all scenes"</li>
                <li>• "Show me project statistics"</li>
                <li>• "Help me get started"</li>
              </ul>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="sidebar-container">
      <div className="sidebar-icon-bar">
        <div className="sidebar-icon-group">
          {topPanelKeys.map((key) => {
            const isDataDependentPanel = key === 'sceneList' || key === 'metadataEditor' || key === 'search';
            let isDisabled = isDataDependentPanel && !currentAnalysisData;
            if (key === 'metadataEditor' && !apiHealthy) isDisabled = true;

            return (
              <button
                key={key}
                className={`sidebar-icon ${activePanelKey === key ? 'active' : ''} ${isDisabled ? 'disabled' : ''}`}
                onClick={() => !isDisabled && onTogglePanel(key)}
                title={iconMap[key].title + (isDisabled ? (key === 'metadataEditor' && !apiHealthy ? ' (API Offline)' : ' (No video analyzed)') : '')}
                disabled={isDisabled}
              >
                {iconMap[key].icon}
              </button>
            );
          })}
        </div>
        <div className="sidebar-icon-group"> {/* Bottom group */}
          {bottomPanelKeys.map((key) => (
            <button
              key={key}
              className={`sidebar-icon ${activePanelKey === key ? 'active' : ''}`}
              onClick={() => onTogglePanel(key)}
              title={iconMap[key].title}
            >
              {iconMap[key].icon}
            </button>
          ))}
          <button
            key="collapse"
            className="sidebar-icon sidebar-collapse-control-button"
            onClick={onToggleSidebarVisibility}
            title={iconMap.collapse.title}
          >
            {iconMap.collapse.icon}
          </button>
        </div>
      </div>
      <div className={`sidebar-panel ${activePanelKey ? 'open' : ''}`}>
        {activePanelKey && (
          <div className="sidebar-panel-content">
            {renderPanelContent(activePanelKey)}
          </div>
        )}
      </div>
    </div>
  );
};

export default Sidebar;