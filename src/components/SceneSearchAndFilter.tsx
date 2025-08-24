// src/components/SceneSearchAndFilter.tsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { AnalyzedScene, SearchMatch } from '../types'; // Adjust path
import { formatTime } from '../utils'; // Adjust path

interface SceneSearchAndFilterProps {
  allAnalyzedScenes: AnalyzedScene[]; // From currentAnalysisData
  currentAnalysisId: string | null;
  activeTagFilters: Set<string>;
  onSearchTermChange: (term: string) => void;
  onTagFilterChange: (tag: string,isActive: boolean) => void;
  onClearAllFilters: () => void;
  onSearchResultClick: (match: SearchMatch) => void;
  onNavigateMatch: (direction: 'next' | 'previous') => void;
  searchTerm: string;
  searchResults: SearchMatch[];
  currentMatchIndex: number | null;
  placeholder?: string;
}

const SceneSearchAndFilter: React.FC<SceneSearchAndFilterProps> = ({
  allAnalyzedScenes,
  currentAnalysisId,
  activeTagFilters,
  onSearchTermChange,
  onTagFilterChange,
  onClearAllFilters,
  onSearchResultClick,
  onNavigateMatch,
  searchTerm,
  searchResults,
  currentMatchIndex,
  placeholder = "Search scenes by title or #tag",
}) => {
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [inputValue, setInputValue] = useState(searchTerm);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const resultsListRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    setInputValue(searchTerm); // Sync with external changes
  }, [searchTerm]);

  // Auto-scroll search results list
  useEffect(() => {
    if (resultsListRef.current && currentMatchIndex !== null && currentMatchIndex >= 0 && currentMatchIndex < searchResults.length) {
      const activeItem = resultsListRef.current.children[currentMatchIndex] as HTMLLIElement;
      if (activeItem) {
        activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [currentMatchIndex, searchResults.length]);


  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    onSearchTermChange(e.target.value);
  };

  const handleInputFocus = () => setIsSearchFocused(true);
  const handleInputBlur = () => {
    // Delay blur to allow clicks on search results
    setTimeout(() => {
      if (!searchInputRef.current || document.activeElement !== searchInputRef.current) {
          // Only truly blur if focus hasn't immediately returned (e.g., by clicking a result that then re-focuses)
          // A more robust way might involve checking if the relatedTarget is part of this component.
          // For now, a simple check.
          // setIsSearchFocused(false); // This can be too aggressive
      }
    }, 200);
  };

  const handleClearSearch = () => {
    setInputValue('');
    onSearchTermChange('');
    searchInputRef.current?.focus();
  };

  const availableTags = useMemo(() => {
    const allTags = new Set<string>();
    allAnalyzedScenes.forEach(scene => scene.tags.forEach(tag => allTags.add(tag)));
    return Array.from(allTags).sort();
  }, [allAnalyzedScenes]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (searchResults.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        onNavigateMatch('next');
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        onNavigateMatch('previous');
      } else if (e.key === 'Enter' && currentMatchIndex !== null && searchResults[currentMatchIndex]) {
        e.preventDefault();
        onSearchResultClick(searchResults[currentMatchIndex]);
        // Optionally clear search or blur input after selection
        // setIsSearchFocused(false);
      }
    }
    if (e.key === 'Escape') {
        handleClearSearch();
        searchInputRef.current?.blur();
        setIsSearchFocused(false);
    }
  };

  return (
    <div className="scene-search-filter-container">
      <div className={`search-bar-wrapper ${isSearchFocused ? 'focused' : ''}`}>
        <span className="search-icon" onClick={() => searchInputRef.current?.focus()}>🔍</span>
        <input
          ref={searchInputRef}
          type="text"
          className="search-input"
          placeholder={placeholder}
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          onKeyDown={handleKeyDown}
        />
        {inputValue && (
          <button className="clear-search-btn" onClick={handleClearSearch} title="Clear search">
            ×
          </button>
        )}
      </div>

      {(isSearchFocused || activeTagFilters.size > 0 || searchTerm) && (
        <div className="search-dropdown-content">
          {availableTags.length > 0 && (
            <div className="filter-tags-container">
              {availableTags.map(tag => (
                <button
                  key={tag}
                  className={`filter-tag-chip ${activeTagFilters.has(tag) ? 'active' : ''}`}
                  onClick={() => onTagFilterChange(tag, !activeTagFilters.has(tag))}
                >
                  #{tag}
                </button>
              ))}
              {activeTagFilters.size > 0 && (
                <button className="clear-filters-btn" onClick={onClearAllFilters}>
                  Clear Filters
                </button>
              )}
            </div>
          )}

          {searchResults.length > 0 && (
            <div className="search-navigation-controls">
              <span>{searchResults.length} match{searchResults.length === 1 ? '' : 'es'}</span>
              {searchResults.length > 1 && (
                <>
                  <button onClick={() => onNavigateMatch('previous')} title="Previous Match (↑)">←</button>
                  <span>{currentMatchIndex !== null ? currentMatchIndex + 1 : '-'}/{searchResults.length}</span>
                  <button onClick={() => onNavigateMatch('next')} title="Next Match (↓)">→</button>
                </>
              )}
            </div>
          )}
          
          {searchResults.length > 0 && (
            <ul className="search-results-list" ref={resultsListRef}>
              {searchResults.map((match, index) => (
                <li
                  key={`${match.analysisId}-${match.sceneIndex}`}
                  className={`search-result-item ${index === currentMatchIndex ? 'active' : ''}`}
                  onClick={() => onSearchResultClick(match)}
                  onMouseEnter={() => { /* Optional: update currentMatchIndex on hover for visual cue */ }}
                >
                  <span className="result-scene-number">#{match.sceneIndex + 1}</span>
                  <span className="result-title">{match.title}</span>
                  <div className="result-tags">
                    {match.tags.map(tag => <span key={tag} className="tag-badge small">#{tag}</span>)}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {searchTerm && searchResults.length === 0 && !activeTagFilters.size && (
            <p className="no-results-message">No scenes match "{searchTerm}".</p>
          )}
           {activeTagFilters.size > 0 && searchResults.length === 0 && (
            <p className="no-results-message">No scenes match the active filters.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default SceneSearchAndFilter;