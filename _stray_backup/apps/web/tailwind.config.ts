import type { Config } from "tailwindcss";

const c = (name: string) => `hsl(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: c("background"),
        foreground: c("foreground"),
        soft: c("text-secondary"),
        card: { DEFAULT: c("card"), foreground: c("foreground") },
        elevated: c("elevated"),
        muted: { DEFAULT: c("elevated"), foreground: c("muted-foreground") },
        border: c("border"),
        input: c("border"),
        ring: c("ring"),
        primary: { DEFAULT: c("primary"), foreground: c("primary-foreground") },
        secondary: { DEFAULT: c("secondary"), foreground: c("secondary-foreground") },
        accent: { DEFAULT: c("elevated"), foreground: c("foreground") },
        destructive: { DEFAULT: c("destructive"), foreground: c("destructive-foreground") },
        success: c("success"),
        warning: c("warning"),
        info: c("info"),
        ai: { DEFAULT: c("ai"), foreground: c("ai-foreground") },
        brand: c("brand-lime"),
        midnight: c("midnight"),
        sidebar: {
          DEFAULT: c("sidebar"),
          foreground: c("sidebar-foreground"),
          muted: c("sidebar-muted"),
          border: c("sidebar-border"),
        },
        chart: { 1: c("chart-1"), 2: c("chart-2"), grid: c("chart-grid") },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 8px)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;