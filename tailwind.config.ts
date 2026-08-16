import type { Config } from "tailwindcss";

/**
 * Theme-aware colours are declared as `rgb(var(--x) / <alpha-value>)` rather
 * than hex so that (a) a `.dark` class can swap them wholesale and (b) opacity
 * modifiers keep working -- `bg-ink/50` and `bg-surface/95` are both live in
 * the app and a bare `var(--x)` would silently break them.
 *
 * Every light-mode value below is byte-identical to the hex it replaced, so
 * this indirection changes nothing on screen until `.dark` is present.
 */
const themed = (channel: string) => `rgb(var(${channel}) / <alpha-value>)`;

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  // Opt-in rather than `media`: the dark palette is only defined for the feed
  // surfaces so far, so it must not activate from an OS preference until the
  // rest of the app has been carried across. Nothing sets `.dark` yet.
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Brand surfaces -- the deep fills that carry white text on them.
        "emerald-brand": themed("--ta-emerald-brand-rgb"),
        gold: "#CE932B",
        "green-tint": "#DFF0E7",
        "gold-tint": "#F7EEDD",
        "purple-tint": "#EDE8F3",
        "green-wash": "#F4F7F5",
        "green-wash-border": "#DCE7E0",

        // Accent *inks* -- the same three brand hues tuned for text on a light
        // or dark ground. `emerald-ink` is the readable counterpart to
        // `emerald-brand`, which is a fill and is far too dark to set type in.
        "emerald-ink": themed("--ta-emerald-ink-rgb"),
        "gold-ink": themed("--ta-gold-ink-rgb"),
        "purple-accent": themed("--ta-purple-accent-rgb"),

        // Neutrals.
        canvas: themed("--ta-canvas-rgb"),
        surface: themed("--ta-surface-rgb"),
        ink: themed("--ta-ink-rgb"),
        "ink-soft": themed("--ta-ink-soft-rgb"),
        "ink-muted": themed("--ta-ink-muted-rgb"),

        // Feed furniture: the card ground, its resting and hover edge, and the
        // hairline used for rules inside and between cards.
        card: themed("--ta-card-rgb"),
        "card-border": themed("--ta-card-border-rgb"),
        "card-border-hover": themed("--ta-card-border-hover-rgb"),
        divider: themed("--ta-divider-rgb"),
      },

      /**
       * Feed type scale. Role-named rather than size-named so the class says
       * what the text *is*, and deliberately namespaced away from Tailwind's
       * own `text-sm` / `text-xl` scale so adding it changes nothing outside
       * the components that opt in.
       *
       * The three headline roles use clamp() instead of a `text-x sm:text-y`
       * pair. That pairing is what produced 26 distinct arbitrary sizes across
       * the feed: nearly every one existed twice, half a pixel apart, once for
       * each breakpoint. One fluid token replaces both and scales smoothly in
       * between rather than stepping at 640px.
       */
      fontSize: {
        kicker: ["11px", { lineHeight: "1.45", letterSpacing: "0.15em" }],
        meta: ["12.5px", { lineHeight: "1.45" }],
        byline: ["14px", { lineHeight: "1.35" }],
        excerpt: ["15.5px", { lineHeight: "1.62" }],
        lede: ["16.5px", { lineHeight: "1.6" }],
        title: ["clamp(19px, 16.17px + 0.76vw, 21px)", { lineHeight: "1.3" }],
        headline: ["clamp(22px, 13.51px + 2.26vw, 28px)", { lineHeight: "1.12" }],
        display: ["clamp(25px, 15.09px + 2.64vw, 32px)", { lineHeight: "1.08" }],
      },

      // The comfortable reading measure for feed prose. 68 characters sits in
      // the middle of the 60-75 band; the 800px feed column was running body
      // text at roughly 98.
      //
      // Named `measure` rather than reusing `prose`, which Tailwind already
      // ships at 65ch -- overriding it would have quietly rewidened every
      // existing `max-w-prose` in the app, none of which asked for it.
      maxWidth: {
        measure: "68ch",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-bodoni)", "Georgia", "serif"],
      },
      keyframes: {
        "slide-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "create-sheet-up": {
          from: { opacity: "0", transform: "translateY(18px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "create-menu-in": {
          from: { opacity: "0", transform: "translateY(-4px) scale(0.98)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "create-item-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "slide-up": "slide-up 0.25s ease-out",
        "fade-in": "fade-in 0.18s ease-out",
        "create-sheet-up": "create-sheet-up 0.2s ease-out",
        "create-menu-in": "create-menu-in 0.16s ease-out",
        "create-item-in": "create-item-in 0.18s ease-out forwards",
      },
      typography: {
        DEFAULT: {
          css: {
            maxWidth: "none",
          },
        },
      },
    },
  },
  plugins: [],
};

export default config;
