import React from 'react';
import './SkeletonLoader.css';

interface SkeletonLoaderProps {
  variant?: 'text' | 'rect' | 'circle' | 'card';
  width?: string | number;
  height?: string | number;
  count?: number;
}

const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({
  variant = 'text',
  width = '100%',
  height,
  count = 1,
}) => {
  const getDefaultHeight = () => {
    switch (variant) {
      case 'text':
        return '1rem';
      case 'circle':
        return '50px';
      case 'card':
        return '200px';
      default:
        return '50px';
    }
  };

  const getClassName = () => {
    let className = 'skeleton';
    if (variant === 'circle') className += ' skeleton-circle';
    if (variant === 'card') className += ' skeleton-card';
    return className;
  };

  const style = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: height || getDefaultHeight(),
  };

  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className={getClassName()} style={style} />
      ))}
    </>
  );
};

export default SkeletonLoader;
