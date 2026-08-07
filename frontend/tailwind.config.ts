import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // African-inspired palette
        terracotta: {
          50: "#fdf4f2",
          100: "#fce8e3",
          200: "#f9d3c9",
          300: "#f4b3a0",
          400: "#ed8a6e",
          500: "#e26943",
          600: "#cf4f29",
          700: "#ae3e1f",
          800: "#90351e",
          900: "#78301d",
        },
        ochre: {
          50: "#fefbe8",
          100: "#fef4c4",
          200: "#fde78a",
          300: "#fcd346",
          400: "#fabc15",
          500: "#eaa30a",
          600: "#ca7e05",
          700: "#a15908",
          800: "#85460e",
          900: "#713a12",
        },
        indigo: {
          50: "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          300: "#a5b4fc",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#312e81",
        },
        slate: {
          850: "#1a1b2e",
          950: "#0c0d1d",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Cabinet Grotesk", "Inter", "system-ui", "sans-serif"],
      },
      animation: {
        "pulse-slow": "pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in": "fadeIn 0.5s ease-out",
        "slide-up": "slideUp 0.5s ease-out",
        "countdown": "countdownPulse 1s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        countdownPulse: {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.05)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
