import React from 'react';

export default function Skeleton({ width, height, borderRadius = '8px', className = '' }) {
  const style = {
    width: width || '100%',
    height: height || '20px',
    borderRadius: borderRadius,
  };

  return <div className={`skeleton-pulse ${className}`} style={style} />;
}

export function SkeletonCircle({ size = '40px', className = '' }) {
  return <Skeleton width={size} height={size} borderRadius="50%" className={className} />;
}

export function SkeletonCard() {
  return (
    <div className="glass-card page-transition" style={{ padding: '24px' }}>
      <Skeleton width="40%" height="14px" className="mb-4" />
      <Skeleton width="80%" height="28px" className="mb-6" />
      <div className="flex gap-2">
        <Skeleton width="60px" height="24px" borderRadius="20px" />
        <Skeleton width="60px" height="24px" borderRadius="20px" />
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }) {
  return (
    <div className="w-full overflow-hidden">
      <div className="flex gap-4 mb-6">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} height="16px" className="flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 mb-4 py-4 border-b border-gray-100/10">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} height="14px" className="flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}
