"use client";

import Toast from "@/components/ui/Toast";

export default function AdminActionStatus({
  status,
  error,
  toastMessage,
  onToastDone,
  className = "text-xs",
}: {
  status?: string | null;
  error?: string | null;
  toastMessage?: string | null;
  onToastDone: () => void;
  className?: string;
}) {
  return (
    <>
      {status ? (
        <p aria-live="polite" className={`${className} text-gray-500`}>
          {status}
        </p>
      ) : null}
      {error ? (
        <p aria-live="assertive" className={`${className} text-red-600`}>
          {error}
        </p>
      ) : null}
      {toastMessage ? (
        <Toast message={toastMessage} onDone={onToastDone} />
      ) : null}
    </>
  );
}
