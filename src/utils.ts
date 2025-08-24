// src/utils.ts
export function formatTime(seconds: number | undefined | null): string {
  // Handle invalid or missing values
  if (seconds === undefined || seconds === null || isNaN(seconds) || seconds < 0) {
    return '00:00';
  }

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// You can add other utility functions here as needed.