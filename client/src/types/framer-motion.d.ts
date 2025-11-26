import 'framer-motion';

declare module 'framer-motion' {
  export interface MotionProps {
    className?: string;
    onClick?: (e: React.MouseEvent) => void;
    disabled?: boolean;
    type?: string;
  }
}
