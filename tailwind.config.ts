import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "emerald-brand": "#073929",
        gold: "#CE932B",
        "gold-ink": "#8A5D1E",
        "purple-accent": "#391A60",
        "green-tint": "#DFF0E7",
        "gold-tint": "#F7EEDD",
        "purple-tint": "#EDE8F3",
        "green-wash": "#F4F7F5",
        "green-wash-border": "#DCE7E0",
        canvas: "#FAF8F5",
        surface: "#FFFFFF",
        ink: "#1A1A1A",
        "ink-muted": "#6B6B6B",
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
