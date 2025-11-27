import React, { useCallback, useEffect } from 'react';
import useFocusTrap from '../hooks/useFocusTrap';
import './ConfirmDialog.css';

type DialogVariant = 'danger' | 'warning' | 'info';

interface ConfirmDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Dialog title */
  title: string;
  /** Dialog message/description */
  message: string;
  /** Confirm button text */
  confirmText?: string;
  /** Cancel button text */
  cancelText?: string;
  /** Visual variant affecting colors */
  variant?: DialogVariant;
  /** Icon to display (emoji or component) */
  icon?: React.ReactNode;
  /** Called when user confirms */
  onConfirm: () => void;
  /** Called when user cancels or closes */
  onCancel: () => void;
  /** Whether confirm action is loading */
  isLoading?: boolean;
}

const variantIcons: Record<DialogVariant, string> = {
  danger: '⚠️',
  warning: '⚡',
  info: 'ℹ️',
};

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'info',
  icon,
  onConfirm,
  onCancel,
  isLoading = false,
}) => {
  const { containerRef } = useFocusTrap<HTMLDivElement>({
    isActive: isOpen,
    onEscape: onCancel,
    closeOnEscape: !isLoading,
  });

  // Handle Enter key for quick confirm
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !isLoading) {
        e.preventDefault();
        onConfirm();
      }
    },
    [onConfirm, isLoading]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      // Prevent body scroll when dialog is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) {
    return null;
  }

  const displayIcon = icon ?? variantIcons[variant];

  return (
    <div className="confirm-dialog-overlay" onClick={onCancel}>
      <div
        ref={containerRef}
        className={`confirm-dialog confirm-dialog-${variant}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        onClick={(e) => e.stopPropagation()}
      >
        {displayIcon && (
          <div className="confirm-dialog-icon" aria-hidden="true">
            {displayIcon}
          </div>
        )}

        <h2 id="confirm-dialog-title" className="confirm-dialog-title">
          {title}
        </h2>

        <p id="confirm-dialog-message" className="confirm-dialog-message">
          {message}
        </p>

        <div className="confirm-dialog-actions">
          <button
            className="confirm-dialog-btn cancel-btn"
            onClick={onCancel}
            disabled={isLoading}
          >
            {cancelText}
          </button>
          <button
            className={`confirm-dialog-btn confirm-btn confirm-btn-${variant}`}
            onClick={onConfirm}
            disabled={isLoading}
            autoFocus
          >
            {isLoading ? 'Please wait...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;

// Hook for easier usage
interface UseConfirmDialogReturn {
  isOpen: boolean;
  dialogProps: Omit<ConfirmDialogProps, 'onConfirm' | 'onCancel'>;
  confirm: (options: {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: DialogVariant;
    icon?: React.ReactNode;
  }) => Promise<boolean>;
  close: () => void;
}

export function useConfirmDialog(): UseConfirmDialogReturn {
  const [isOpen, setIsOpen] = React.useState(false);
  const [options, setOptions] = React.useState<{
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: DialogVariant;
    icon?: React.ReactNode;
  }>({
    title: '',
    message: '',
  });
  const resolveRef = React.useRef<((value: boolean) => void) | null>(null);

  const confirm = React.useCallback(
    (opts: typeof options): Promise<boolean> => {
      setOptions(opts);
      setIsOpen(true);

      return new Promise((resolve) => {
        resolveRef.current = resolve;
      });
    },
    []
  );

  const close = React.useCallback(() => {
    setIsOpen(false);
    if (resolveRef.current) {
      resolveRef.current(false);
      resolveRef.current = null;
    }
  }, []);

  const handleConfirm = React.useCallback(() => {
    setIsOpen(false);
    if (resolveRef.current) {
      resolveRef.current(true);
      resolveRef.current = null;
    }
  }, []);

  return {
    isOpen,
    dialogProps: {
      isOpen,
      ...options,
      onConfirm: handleConfirm,
      onCancel: close,
    } as any,
    confirm,
    close,
  };
}
