"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

export type AppChromeMode = "expanded" | "compact";

interface RevealOptions {
  immediate?: boolean;
}

interface AppChromeContextValue {
  mode: AppChromeMode;
  navHeight: number;
  registerNav: (node: HTMLElement | null) => void;
  registerSubnav: (
    node: HTMLElement,
    anchor: HTMLElement | null
  ) => () => void;
  revealChrome: (options?: RevealOptions) => void;
  setInteractionLocked: (locked: boolean) => void;
}

const DEFAULT_NAV_HEIGHT = 60;
const DEFAULT_REVEAL_FLOOR = 96;
const TOP_REVEAL_FLOOR = 8;
// Sized for a thumb, not a mouse wheel. Momentum scrolling and the rubber-band
// at either end of the document produce direction reversals of a dozen-odd
// pixels constantly, so a threshold in that range makes the chrome strobe
// through a single flick. These are past the noise floor while still landing
// well inside one deliberate swipe.
const HIDE_DISTANCE = 64;
const REVEAL_DISTANCE = 40;

const EXPANDED_CHROME_FALLBACK: AppChromeContextValue = {
  mode: "expanded",
  navHeight: DEFAULT_NAV_HEIGHT,
  registerNav: () => {},
  registerSubnav: () => () => {},
  revealChrome: () => {},
  setInteractionLocked: () => {},
};

const AppChromeContext = createContext<AppChromeContextValue>(
  EXPANDED_CHROME_FALLBACK
);

function editableIsFocused() {
  const active = document.activeElement;
  return (
    active instanceof HTMLElement &&
    (active.tagName === "INPUT" ||
      active.tagName === "TEXTAREA" ||
      active.tagName === "SELECT" ||
      active.isContentEditable)
  );
}

export function AppChromeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mode, setMode] = useState<AppChromeMode>("expanded");
  const [navHeight, setNavHeight] = useState(DEFAULT_NAV_HEIGHT);
  const [interactionLocked, setInteractionLocked] = useState(false);
  const [isImmediate, setIsImmediate] = useState(false);
  const navObserverRef = useRef<ResizeObserver | null>(null);
  const navResizeCleanupRef = useRef<(() => void) | null>(null);
  const subnavRef = useRef<{
    node: HTMLElement;
    anchor: HTMLElement | null;
  } | null>(null);
  const immediateFrameRef = useRef<number | null>(null);

  const registerNav = useCallback((node: HTMLElement | null) => {
    navObserverRef.current?.disconnect();
    navObserverRef.current = null;
    navResizeCleanupRef.current?.();
    navResizeCleanupRef.current = null;
    if (!node) return;

    const publishHeight = () => {
      const nextHeight = Math.round(node.getBoundingClientRect().height);
      if (nextHeight > 0) setNavHeight(nextHeight);
    };

    publishHeight();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(publishHeight);
      observer.observe(node);
      navObserverRef.current = observer;
    } else {
      window.addEventListener("resize", publishHeight);
      navResizeCleanupRef.current = () =>
        window.removeEventListener("resize", publishHeight);
    }
  }, []);

  const registerSubnav = useCallback(
    (node: HTMLElement, anchor: HTMLElement | null) => {
      const registration = { node, anchor };
      subnavRef.current = registration;

      return () => {
        if (subnavRef.current === registration) subnavRef.current = null;
      };
    },
    []
  );

  const revealChrome = useCallback((options: RevealOptions = {}) => {
    setMode("expanded");
    if (!options.immediate) return;

    setIsImmediate(true);
    if (immediateFrameRef.current !== null) {
      cancelAnimationFrame(immediateFrameRef.current);
    }
    immediateFrameRef.current = requestAnimationFrame(() => {
      immediateFrameRef.current = requestAnimationFrame(() => {
        immediateFrameRef.current = null;
        setIsImmediate(false);
      });
    });
  }, []);

  useEffect(() => {
    return () => {
      navObserverRef.current?.disconnect();
      navResizeCleanupRef.current?.();
      if (immediateFrameRef.current !== null) {
        cancelAnimationFrame(immediateFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setMode("expanded");
    setIsImmediate(true);

    const mobileQuery = window.matchMedia?.("(max-width: 767px)") ?? null;
    const reducedMotionQuery =
      window.matchMedia?.("(prefers-reduced-motion: reduce)") ?? null;
    let lastY = Math.max(window.scrollY, 0);
    let direction: "up" | "down" | null = null;
    let directionStartY = lastY;
    let frame: number | null = null;
    let scrollLimit = -1;

    const position = () => {
      const raw = window.scrollY;
      if (scrollLimit < 0 || raw > scrollLimit) {
        scrollLimit = Math.max(
          0,
          document.documentElement.scrollHeight - window.innerHeight
        );
      }
      return scrollLimit > 0
        ? Math.min(Math.max(raw, 0), scrollLimit)
        : Math.max(raw, 0);
    };

    const autoHideEnabled = () =>
      (mobileQuery?.matches ?? window.innerWidth < 768) &&
      !(reducedMotionQuery?.matches ?? false);

    const canCompact = (y: number) => {
      const subnav = subnavRef.current;
      if (!subnav?.anchor) return y > DEFAULT_REVEAL_FLOOR;
      return subnav.anchor.getBoundingClientRect().top <= navHeight;
    };

    const rebase = (expand: boolean) => {
      scrollLimit = -1;
      lastY = position();
      direction = null;
      directionStartY = lastY;
      if (expand) setMode("expanded");
    };

    const evaluate = () => {
      const y = position();
      if (
        !autoHideEnabled() ||
        interactionLocked ||
        editableIsFocused() ||
        y <= TOP_REVEAL_FLOOR
      ) {
        lastY = y;
        direction = null;
        directionStartY = y;
        setMode("expanded");
        return;
      }

      const delta = y - lastY;
      if (delta === 0) return;
      const nextDirection = delta > 0 ? "down" : "up";
      if (direction !== nextDirection) {
        direction = nextDirection;
        directionStartY = lastY;
      }
      lastY = y;

      const distance = Math.abs(y - directionStartY);
      if (direction === "down" && distance >= HIDE_DISTANCE && canCompact(y)) {
        setMode("compact");
      } else if (direction === "up" && distance >= REVEAL_DISTANCE) {
        setMode("expanded");
      }
    };

    const onScroll = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = null;
        evaluate();
      });
    };

    const onViewportChange = () => rebase(true);
    const onVisualViewportChange = () => rebase(false);
    const onFocusChange = () => {
      if (editableIsFocused()) setMode("expanded");
      lastY = position();
      direction = null;
      directionStartY = lastY;
    };

    const clearImmediate = requestAnimationFrame(() => setIsImmediate(false));
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("orientationchange", onViewportChange);
    window.visualViewport?.addEventListener("resize", onVisualViewportChange);
    window.visualViewport?.addEventListener("scroll", onVisualViewportChange);
    document.addEventListener("focusin", onFocusChange);
    document.addEventListener("focusout", onFocusChange);
    mobileQuery?.addEventListener("change", onViewportChange);
    reducedMotionQuery?.addEventListener("change", onViewportChange);

    return () => {
      cancelAnimationFrame(clearImmediate);
      if (frame !== null) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("orientationchange", onViewportChange);
      window.visualViewport?.removeEventListener("resize", onVisualViewportChange);
      window.visualViewport?.removeEventListener("scroll", onVisualViewportChange);
      document.removeEventListener("focusin", onFocusChange);
      document.removeEventListener("focusout", onFocusChange);
      mobileQuery?.removeEventListener("change", onViewportChange);
      reducedMotionQuery?.removeEventListener("change", onViewportChange);
    };
  }, [interactionLocked, navHeight, pathname]);

  const value = useMemo<AppChromeContextValue>(
    () => ({
      mode,
      navHeight,
      registerNav,
      registerSubnav,
      revealChrome,
      setInteractionLocked,
    }),
    [mode, navHeight, registerNav, registerSubnav, revealChrome]
  );

  const style = {
    "--app-nav-height": `${navHeight}px`,
    "--app-nav-offset": mode === "compact" ? "0px" : `${navHeight}px`,
    "--app-sticky-offset":
      mode === "compact" ? "1rem" : `calc(${navHeight}px + 1rem)`,
  } as CSSProperties;

  return (
    <AppChromeContext.Provider value={value}>
      <div
        data-app-chrome=""
        data-chrome-mode={mode}
        data-chrome-instant={isImmediate ? "true" : undefined}
        style={style}
      >
        {children}
      </div>
    </AppChromeContext.Provider>
  );
}

export function useAppChrome() {
  return useContext(AppChromeContext);
}
