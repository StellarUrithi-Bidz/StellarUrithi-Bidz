import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        terracotta: {
          400: "#ed8a6e",
          500: "#e26943",
        },
        ochre: {
          400: "#fabc15",
          500: "#eaa30a",
        },
        indigo: {
          400: "#818cf8",
          500: "#6366f1",
        },
      },
    },
  },
  plugins: [],
};

export default config;
