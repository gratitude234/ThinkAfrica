"use client";

import { useEffect } from "react";
import {
  trackActivationEvent,
  type ActivationEventName,
} from "@/lib/activationEvents";

interface RetentionEventTrackerProps {
  event: ActivationEventName;
  metadata?: Record<string, string | number | boolean | null>;
}

export default function RetentionEventTracker({
  event,
  metadata = {},
}: RetentionEventTrackerProps) {
  const metadataKey = JSON.stringify(metadata);

  useEffect(() => {
    trackActivationEvent({
      event,
      metadata: JSON.parse(metadataKey) as Record<
        string,
        string | number | boolean | null
      >,
    });
  }, [event, metadataKey]);

  return null;
}
