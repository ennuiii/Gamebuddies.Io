import { useEffect, useRef, useCallback, RefObject } from 'react';

const FOCUSABLE_SELECTORS = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

interface UseFocusTrapOptions {
  /** Whether the focus trap is active */
  isActive?: boolean;
  /** Element to return focus to on close (defaults to previously focused element) */
  returnFocusTo?: HTMLElement | null;
  /** Whether to close on Escape key */
  closeOnEscape?: boolean;
  /** Callback when Escape is pressed */
  onEscape?: () => void;
  /** Whether to auto-focus the first focusable element */
  autoFocus?: boolean;
}

interface UseFocusTrapReturn<T extends HTMLElement> {
  /** Ref to attach to the container element */
  containerRef: RefObject<T>;
  /** Manually focus the first focusable element */
  focusFirst: () => void;
  /** Manually focus the last focusable element */
  focusLast: () => void;
}

/**
 * Custom hook for trapping focus within a container element.
 * Useful for modals, dialogs, and other overlay components.
 *
 * @example
 * ```tsx
 * const { containerRef } = useFocusTrap<HTMLDivElement>({
 *   isActive: isModalOpen,
 *   onEscape: () => setIsModalOpen(false),
 * });
 *
 * return <div ref={containerRef}>Modal content</div>;
 * ```
 */
function useFocusTrap<T extends HTMLElement = HTMLDivElement>(
  options: UseFocusTrapOptions = {}
): UseFocusTrapReturn<T> {
  const {
    isActive = true,
    returnFocusTo,
    closeOnEscape = true,
    onEscape,
    autoFocus = true,
  } = options;

  const containerRef = useRef<T>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  const getFocusableElements = useCallback((): HTMLElement[] => {
    if (!containerRef.current) return [];
    return Array.from(
      containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)
    ).filter((el) => {
      // Check if element is visible
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
  }, []);

  const focusFirst = useCallback(() => {
    const focusable = getFocusableElements();
    if (focusable.length > 0) {
      focusable[0].focus();
    }
  }, [getFocusableElements]);

  const focusLast = useCallback(() => {
    const focusable = getFocusableElements();
    if (focusable.length > 0) {
      focusable[focusable.length - 1].focus();
    }
  }, [getFocusableElements]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent): void => {
      // Handle Escape key
      if (e.key === 'Escape' && closeOnEscape) {
        e.preventDefault();
        onEscape?.();
        return;
      }

      // Handle Tab key for focus trapping
      if (e.key !== 'Tab') return;

      const focusable = getFocusableElements();
      if (focusable.length === 0) return;

      const firstElement = focusable[0];
      const lastElement = focusable[focusable.length - 1];
      const activeElement = document.activeElement;

      // Shift + Tab at beginning -> go to end
      if (e.shiftKey && activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
        return;
      }

      // Tab at end -> go to beginning
      if (!e.shiftKey && activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
        return;
      }

      // If focus is outside container, bring it back
      if (!containerRef.current?.contains(activeElement)) {
        e.preventDefault();
        if (e.shiftKey) {
          lastElement.focus();
        } else {
          firstElement.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isActive, closeOnEscape, onEscape, getFocusableElements]);

  // Store previous focus and auto-focus on mount
  useEffect(() => {
    if (!isActive) return;

    // Store the currently focused element
    previousActiveElement.current = document.activeElement as HTMLElement;

    // Auto-focus first focusable element
    if (autoFocus) {
      // Small delay to ensure DOM is ready
      const timeoutId = setTimeout(() => {
        focusFirst();
      }, 10);
      return () => clearTimeout(timeoutId);
    }
  }, [isActive, autoFocus, focusFirst]);

  // Return focus when deactivated
  useEffect(() => {
    return () => {
      if (previousActiveElement.current && isActive) {
        const elementToFocus = returnFocusTo || previousActiveElement.current;
        // Check if element is still in DOM and focusable
        if (document.body.contains(elementToFocus)) {
          elementToFocus.focus();
        }
      }
    };
  }, [isActive, returnFocusTo]);

  return {
    containerRef,
    focusFirst,
    focusLast,
  };
}

export default useFocusTrap;
