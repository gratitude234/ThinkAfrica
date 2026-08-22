"use client";

import {
  useCallback,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import ContributionChooser from "./ContributionChooser";

interface CreateTriggerProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "type" | "children"> {
  userId: string | null;
  children: ReactNode;
}

/**
 * Reusable Create trigger, decoupled from NavClient/BottomNav. Any CTA
 * (Footer "Write", a dashboard "Start writing" button, ...) can render this
 * to get the shared contribution chooser. Guests choose their intended
 * format first, so sign-in can return them to the exact composer they chose.
 * Content-specific CTAs (e.g. "Write an article") should keep linking
 * directly to their destination instead of using this.
 */
export default function CreateTrigger({
  userId,
  className,
  children,
  disabled,
  ...rest
}: CreateTriggerProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const chooserId = useId();
  const titleId = useId();
  const descriptionId = useId();
  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={className}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? chooserId : undefined}
        {...rest}
      >
        {children}
      </button>
      <ContributionChooser
        open={open}
        onClose={close}
        triggerRef={triggerRef}
        userId={userId}
        id={chooserId}
        titleId={titleId}
        descriptionId={descriptionId}
      />
    </>
  );
}
