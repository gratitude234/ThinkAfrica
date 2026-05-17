"use client";

import { useCallback, useState } from "react";

export function useAdminActionFeedback<Action extends string>() {
  const [pendingAction, setPendingAction] = useState<Action | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const startAction = useCallback((action: Action, message: string) => {
    setPendingAction(action);
    setStatusMessage(message);
    setError(null);
    setToastMessage(null);
  }, []);

  const finishAction = useCallback((message: string) => {
    setPendingAction(null);
    setStatusMessage(null);
    setToastMessage(message);
  }, []);

  const failAction = useCallback((message: string) => {
    setPendingAction(null);
    setStatusMessage(null);
    setError(message);
  }, []);

  return {
    pendingAction,
    statusMessage,
    error,
    toastMessage,
    startAction,
    finishAction,
    failAction,
    clearToast: () => setToastMessage(null),
  };
}
