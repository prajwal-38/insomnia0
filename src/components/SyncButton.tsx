import React, { useState } from 'react';

interface SyncButtonProps {
  onSync?: (forceReload?: boolean) => void | Promise<void>;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'ghost' | 'outline';
  className?: string;
  title?: string;
  showText?: boolean;
}

const IconSync = ({ size }: { size: number }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" />
    <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" />
  </svg>
);

const SyncButton: React.FC<SyncButtonProps> = ({
  onSync,
  disabled = false,
  size = 'sm',
  variant = 'ghost',
  className = '',
  title = 'Smart sync mezzanine scenes (Hold Shift to force reload all segments)',
  showText = true
}) => {
  const [isSyncing, setIsSyncing] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    if (!onSync || disabled || isSyncing) return;
    
    const forceReload = e.shiftKey;
    setIsSyncing(true);
    
    try {
      await onSync(forceReload);
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  const sizeClasses = {
    sm: 'px-2 py-1 text-sm',
    md: 'px-3 py-2 text-base',
    lg: 'px-4 py-3 text-lg'
  };

  const variantClasses = {
    default: 'bg-blue-600 hover:bg-blue-700 text-white',
    ghost: 'bg-transparent hover:bg-blue-900/20 text-blue-400 hover:text-blue-300',
    outline: 'border border-blue-400 text-blue-400 hover:bg-blue-900/20 hover:text-blue-300'
  };

  const iconSize = size === 'sm' ? 14 : size === 'md' ? 16 : 18;

  return (
    <button
      onClick={handleClick}
      disabled={disabled || isSyncing}
      className={`
        flex items-center gap-1 rounded transition-colors duration-200
        ${sizeClasses[size]}
        ${variantClasses[variant]}
        ${disabled || isSyncing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        ${className}
      `}
      title={title}
    >
      <IconSync size={iconSize} />
      {showText && (isSyncing ? 'Syncing...' : 'Sync')}
    </button>
  );
};

export default SyncButton;
