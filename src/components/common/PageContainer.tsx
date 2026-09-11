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
 *
 * The rhythm is tighter below `sm`. A 20px gap between every band is right on a
 * desktop page but on a 375px screen it was spending 60px of an 812px viewport
 * on empty space between four bands, which is most of what made these pages read
 * as inflated rather than spacious.
 */
const PageContainer = ({ children, width = 'wide', className }: PageContainerProps) => (
  <div
    className={cn(
      'mx-auto w-full space-y-3 px-3 py-3 sm:space-y-5 sm:px-5 sm:py-6',
      widthClasses[width],
      className
    )}
  >
    {children}
  </div>
);

export default PageContainer;
