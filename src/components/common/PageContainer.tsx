import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageContainerProps {
  children: ReactNode;
  /** Constrains width for reading-heavy pages (forms, detail views). */
  width?: 'full' | 'wide' | 'narrow';
  className?: string;
}

const widthClasses = {
  full: 'max-w-none',
  wide: 'max-w-7xl',
  narrow: 'max-w-3xl',
} as const;

/**
 * Consistent page padding and max width. AppLayout supplies the scroll
 * container; this supplies the gutters, which pages currently each set
 * themselves with slightly different values.
 */
const PageContainer = ({ children, width = 'wide', className }: PageContainerProps) => (
  <div
    className={cn(
      'mx-auto w-full space-y-5 px-3 py-4 sm:px-5 sm:py-6',
      widthClasses[width],
      className
    )}
  >
    {children}
  </div>
);

export default PageContainer;
