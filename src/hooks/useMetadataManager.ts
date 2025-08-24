// src/hooks/useMetadataManager.ts
import { useState, useEffect, useCallback } from 'react';
import type { AllUnsavedChanges, UnsavedAnalysisChanges, UnsavedSceneChanges } from '../types'; // Adjust path

const LOCAL_STORAGE_UNSAVED_CHANGES_KEY = 'storyboard-unsaved-metadata';

export function useMetadataManager() {
  const [unsavedMetadataChanges, setUnsavedMetadataChangesState] = useState<AllUnsavedChanges>({});
  const [selectedSceneIndicesInEditor, setSelectedSceneIndicesInEditorState] = useState<Set<number>>(new Set());

  // Load unsaved changes from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_UNSAVED_CHANGES_KEY);
    if (saved) {
      try {
        setUnsavedMetadataChangesState(JSON.parse(saved));
      } catch (e) {
        console.error("Error parsing unsaved metadata changes from localStorage:", e);
        localStorage.removeItem(LOCAL_STORAGE_UNSAVED_CHANGES_KEY); // Clear corrupted data
      }
    }
  }, []);

  // Save unsaved changes to localStorage
  useEffect(() => {
    if (Object.keys(unsavedMetadataChanges).length > 0) {
      localStorage.setItem(LOCAL_STORAGE_UNSAVED_CHANGES_KEY, JSON.stringify(unsavedMetadataChanges));
    } else {
      // Ensure key is removed if there are no unsaved changes, to prevent loading an empty {}
      if (localStorage.getItem(LOCAL_STORAGE_UNSAVED_CHANGES_KEY)) {
        localStorage.removeItem(LOCAL_STORAGE_UNSAVED_CHANGES_KEY);
      }
    }
  }, [unsavedMetadataChanges]);

  const setUnsavedMetadataChanges = useCallback((updater: React.SetStateAction<AllUnsavedChanges>) => {
    setUnsavedMetadataChangesState(updater);
  }, []);

  const setSelectedSceneIndicesInEditor = useCallback((updater: React.SetStateAction<Set<number>>) => {
    setSelectedSceneIndicesInEditorState(updater);
  }, []);


  const updateOneUnsavedSceneChange = useCallback((analysisId: string, sceneIndex: number, updates: UnsavedSceneChanges, originalSceneData?: {title: string, tags: string[]}) => {
    setUnsavedMetadataChangesState(prev => {
      const newUnsavedRoot = JSON.parse(JSON.stringify(prev)); // Deep copy
      if (!newUnsavedRoot[analysisId]) newUnsavedRoot[analysisId] = {};
      
      const currentAnalysisChanges = newUnsavedRoot[analysisId];
      const currentSceneSpecificChanges = currentAnalysisChanges[sceneIndex] || {};

      let modified = false;
      if (updates.title !== undefined) {
        currentSceneSpecificChanges.title = updates.title;
        modified = true;
      }
      if (updates.tags !== undefined) {
        currentSceneSpecificChanges.tags = updates.tags;
        modified = true;
      }

      // If updates effectively revert to original, remove from unsaved
      if (originalSceneData) {
          if (currentSceneSpecificChanges.title === originalSceneData.title) delete currentSceneSpecificChanges.title;
          if (currentSceneSpecificChanges.tags && originalSceneData.tags && JSON.stringify(currentSceneSpecificChanges.tags.sort()) === JSON.stringify([...originalSceneData.tags].sort())) delete currentSceneSpecificChanges.tags;
      }
      
      if (Object.keys(currentSceneSpecificChanges).length > 0) {
        currentAnalysisChanges[sceneIndex] = currentSceneSpecificChanges;
      } else {
        delete currentAnalysisChanges[sceneIndex];
        if (Object.keys(currentAnalysisChanges).length === 0) {
          delete newUnsavedRoot[analysisId];
        }
      }
      return newUnsavedRoot;
    });
  }, []);

  const clearSuccessfullySavedChanges = useCallback((analysisId: string, savedItems: { [sceneIndex: number]: UnsavedSceneChanges }) => {
    setUnsavedMetadataChangesState(prevUnsaved => {
        const newUnsaved = JSON.parse(JSON.stringify(prevUnsaved));
        if (newUnsaved[analysisId]) {
            for (const sceneIdxStr of Object.keys(savedItems)) {
                 const sceneIndex = parseInt(sceneIdxStr, 10);
                 // Check if the saved item matches what's in unsaved (could have changed again)
                 // This is tricky. Simpler: just remove the sceneIndex entry if it was part of the save batch.
                 delete newUnsaved[analysisId][sceneIndex];
            }
            if (Object.keys(newUnsaved[analysisId]).length === 0) {
                delete newUnsaved[analysisId];
            }
        }
        return newUnsaved;
    });
  }, []);


  const resetAllMetadataState = useCallback(() => {
      setUnsavedMetadataChangesState({});
      setSelectedSceneIndicesInEditorState(new Set());
      localStorage.removeItem(LOCAL_STORAGE_UNSAVED_CHANGES_KEY);
  }, []);


  return {
    unsavedMetadataChanges,
    setUnsavedMetadataChanges, // Keep direct setter for full reset if needed
    selectedSceneIndicesInEditor,
    setSelectedSceneIndicesInEditor,
    updateOneUnsavedSceneChange,
    clearSuccessfullySavedChanges,
    resetAllMetadataState, // For app reset
  };
}