// src/MetadataEditor.tsx
import React, { useState, useEffect, useCallback } from 'react';
import type { ApiAnalysisResponse, AnalyzedScene, UnsavedSceneChanges, UnsavedMetadataChanges } from './types'; // Ensure types includes sceneId

// Debounce function (can be in utils.ts)
const debounce = <F extends (...args: any[]) => any>(func: F, waitFor: number) => {
  let timeout: NodeJS.Timeout | null = null;
  const debounced = (...args: Parameters<F>) => {
    if (timeout !== null) { clearTimeout(timeout); timeout = null; }
    timeout = setTimeout(() => func(...args), waitFor);
  };
  return debounced as (...args: Parameters<F>) => void;
};

interface MetadataEditorProps {
  analysisData: ApiAnalysisResponse;
  unsavedChanges: UnsavedMetadataChanges[string] | undefined; // Changes for the current analysisId, keyed by sceneId
  selectedSceneIds: Set<string>;
  onSceneChange: (sceneId: string, updates: UnsavedSceneChanges) => void;
  onSaveChanges: () => void;
  onSelectionChange: (sceneId: string, selected: boolean) => void;
  onBulkTag: (sceneIds: string[], tag: string) => void;
  apiHealthy: boolean;
}

interface MetadataEditorRowProps {
  scene: AnalyzedScene;
  unsavedSceneSpecificChanges: UnsavedSceneChanges | undefined;
  isSelected: boolean;
  onSceneFieldChange: (updates: UnsavedSceneChanges) => void; // Called by row on blur or debounced input
  onToggleSelect: (selected: boolean) => void;
  hasPendingSave: boolean;
  isDisabled: boolean; // If API is unhealthy
}

const MetadataEditorRow: React.FC<MetadataEditorRowProps> = ({
  scene, unsavedSceneSpecificChanges, isSelected, onSceneFieldChange, onToggleSelect, hasPendingSave, isDisabled
}) => {
  const [currentTitle, setCurrentTitle] = useState(unsavedSceneSpecificChanges?.title ?? scene.title);
  const [currentTags, setCurrentTags] = useState<string>((unsavedSceneSpecificChanges?.tags ?? scene.tags).join(', '));

  useEffect(() => { setCurrentTitle(unsavedSceneSpecificChanges?.title ?? scene.title); }, [unsavedSceneSpecificChanges?.title, scene.title]);
  useEffect(() => { setCurrentTags((unsavedSceneSpecificChanges?.tags ?? scene.tags).join(', ')); }, [unsavedSceneSpecificChanges?.tags, scene.tags]);

  const debouncedOnSceneFieldChange = useCallback(debounce(onSceneFieldChange, 750), [onSceneFieldChange]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setCurrentTitle(newTitle);
    debouncedOnSceneFieldChange({ title: newTitle.trim() || undefined }); // Send undefined if empty
  };

  const handleTagsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTagsString = e.target.value;
    setCurrentTags(newTagsString);
    debouncedOnSceneFieldChange({ tags: newTagsString.split(',').map(t => t.trim()).filter(Boolean) });
  };

  const handleBlur = (field: 'title' | 'tags') => {
    const updates: UnsavedSceneChanges = {};
    if (field === 'title') {
      const trimmedTitle = currentTitle.trim();
      // Only call if it's different from the current unsaved state or the original if no unsaved
      if (trimmedTitle !== (unsavedSceneSpecificChanges?.title ?? scene.title)) {
         updates.title = trimmedTitle || undefined; // Send undefined if effectively empty
      } else if (trimmedTitle === scene.title && unsavedSceneSpecificChanges?.title !== undefined) {
         updates.title = undefined; // Explicitly clear an unsaved change
      }
    }
    if (field === 'tags') {
      const newTagsArray = currentTags.split(',').map(t => t.trim()).filter(Boolean);
      if (JSON.stringify(newTagsArray.sort()) !== JSON.stringify((unsavedSceneSpecificChanges?.tags ?? scene.tags).sort())) {
        updates.tags = newTagsArray;
      } else if (JSON.stringify(newTagsArray.sort()) === JSON.stringify(scene.tags.sort()) && unsavedSceneSpecificChanges?.tags !== undefined) {
        updates.tags = undefined; // Explicitly clear an unsaved change
      }
    }
    if (Object.keys(updates).length > 0) {
        onSceneFieldChange(updates); // Immediate update on blur
    }
  };

  const titleValid = currentTitle.trim().length > 0 || (unsavedSceneSpecificChanges?.title !== undefined && unsavedSceneSpecificChanges.title.trim().length > 0);

  return (
    <tr className={`metadata-editor-row ${isSelected ? 'selected' : ''} ${hasPendingSave ? 'pending-save' : ''} ${isDisabled ? 'disabled-row' : ''}`}>
      <td> <input type="checkbox" checked={isSelected} onChange={(e) => onToggleSelect(e.target.checked)} className="row-checkbox" disabled={isDisabled}/> </td>
      <td>{scene.scene_index + 1}</td> {/* Display scene_index */}
      <td>
        <input
          type="text" value={currentTitle} onChange={handleTitleChange} onBlur={() => handleBlur('title')}
          className={`title-input ${!titleValid && (unsavedSceneSpecificChanges?.title !== undefined || currentTitle !== scene.title) ? 'invalid' : ''}`}
          placeholder="Scene Title"
          disabled={isDisabled}
        />
      </td>
      <td>
        <input
          type="text" value={currentTags} onChange={handleTagsChange} onBlur={() => handleBlur('tags')}
          className="tags-input" placeholder="tag1, tag2"
          disabled={isDisabled}
        />
      </td>
    </tr>
  );
};

const MetadataEditor: React.FC<MetadataEditorProps> = ({
  analysisData, unsavedChanges, selectedSceneIds,
  onSceneChange, onSaveChanges, onSelectionChange, onBulkTag, apiHealthy
}) => {
  const [bulkTagInput, setBulkTagInput] = useState('');

  const handleApplyBulkTag = () => {
    if (bulkTagInput.trim() && selectedSceneIds.size > 0 && apiHealthy) {
      onBulkTag(Array.from(selectedSceneIds), bulkTagInput.trim());
      setBulkTagInput('');
    }
  };

  const scenesWithPendingChangesCount = analysisData.scenes.filter(
    s => unsavedChanges?.[s.sceneId] && Object.keys(unsavedChanges[s.sceneId]).length > 0
  ).length;

  const canSaveChanges = apiHealthy && scenesWithPendingChangesCount > 0 &&
    analysisData.scenes.every(s => {
        const changes = unsavedChanges?.[s.sceneId];
        if (!changes) return true; // No changes for this scene, so it's valid
        return changes.title === undefined || (changes.title && changes.title.trim().length > 0);
    });

  return (
    <div className="metadata-editor-container">
      {!apiHealthy && <p className="error-message" style={{textAlign: 'center', marginBottom: '1rem'}}>API is offline. Metadata editing is disabled.</p>}
      <div className="metadata-editor-actions">
        <div className="bulk-tag-section">
          <input
            type="text"
            value={bulkTagInput}
            onChange={(e) => setBulkTagInput(e.target.value)}
            placeholder="Tag for selected"
            className="bulk-tag-input"
            disabled={selectedSceneIds.size === 0 || !apiHealthy}
          />
          <button
            onClick={handleApplyBulkTag}
            disabled={!bulkTagInput.trim() || selectedSceneIds.size === 0 || !apiHealthy}
            className="control-button bulk-tag-apply"
          >
            Add Tag
          </button>
        </div>
        <button
          onClick={onSaveChanges}
          disabled={!canSaveChanges}
          className="control-button save-all-button"
        >
          Save All Changes ({scenesWithPendingChangesCount})
        </button>
      </div>
      <table className="metadata-editor-table">
        <thead><tr><th>Sel</th><th>#</th><th>Title</th><th>Tags (comma-sep)</th></tr></thead>
        <tbody>
          {analysisData.scenes.map((scene) => (
            <MetadataEditorRow
              key={scene.sceneId} // Use sceneId as key
              scene={scene}
              unsavedSceneSpecificChanges={unsavedChanges?.[scene.sceneId]}
              isSelected={selectedSceneIds.has(scene.sceneId)}
              onSceneFieldChange={(updates) => onSceneChange(scene.sceneId, updates)} // Pass sceneId
              onToggleSelect={(selected) => onSelectionChange(scene.sceneId, selected)} // Pass sceneId
              hasPendingSave={!!unsavedChanges?.[scene.sceneId] && Object.keys(unsavedChanges[scene.sceneId]).length > 0}
              isDisabled={!apiHealthy}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default MetadataEditor;