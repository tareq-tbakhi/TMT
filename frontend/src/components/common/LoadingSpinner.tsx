import React from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
}

const SIZES = {
  sm: 'h-4 w-4',
  md: 'h-8 w-8',
  lg: 'h-12 w-12',
};

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ size = 'md', text }) => {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-4">
      <div
        className={`${SIZES[size]} animate-spin rounded-full border-2 border-gray-200 border-t-blue-600`}
      />
      {text && <p className="text-sm text-gray-500">{text}</p>}
    </div>
  );
};

export default LoadingSpinner;
