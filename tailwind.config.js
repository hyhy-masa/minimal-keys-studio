/** @type {import('tailwindcss').Config} */
import trac from "tailwindcss-react-aria-components";
import contQueries from "@tailwindcss/container-queries";

export default {
  content: ["./index.html", "./download.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontSize: {
        xs: "0.4rem",
      },
      fontFamily: {
        sans: ["Inter", "system-ui"],
        keycap: ["Inter", "system-ui"],
      },
      colors: {
        primary:
          "light-dark(oklch(62% 0.22 250), oklch(65.69% 0.196 285.75))",
        "primary-content":
          "light-dark(#FFFFFF, oklch(0.13138 0.0392 285.75))",
        secondary:
          "light-dark(oklch(65% 0.12 280), oklch(74.8% 0.26 342.55))",
        accent:
          "light-dark(oklch(75% 0.18 190), oklch(74.51% 0.167 183.61))",
        "base-content": "light-dark(#374151, #A6ADBB)",
        "base-100": "light-dark(#FFFFFF, #1d232a)",
        "base-200": "light-dark(#F8F9FA, #191e24)",
        "base-300": "light-dark(#E5E7EB, #15191e)",
        success: "light-dark(oklch(64.8% 0.15 160), oklch(64.8% 0.15 160))",
        "success-content": "light-dark(#FFFFFF, #FFFFFF)",
        error: "light-dark(oklch(58% 0.22 27), oklch(62% 0.20 27))",
        "error-content": "light-dark(#FFFFFF, #FFFFFF)",
        warning: "light-dark(oklch(80% 0.16 80), oklch(80% 0.16 80))",
        "warning-content": "light-dark(#3a2a00, #3a2a00)",
        info: "light-dark(oklch(66% 0.14 230), oklch(70% 0.14 230))",
        "info-content": "light-dark(#FFFFFF, #FFFFFF)",
        danger: "light-dark(oklch(55% 0.20 27), oklch(58% 0.19 27))",
        "danger-content": "light-dark(#FFFFFF, #FFFFFF)",
      },
    },
  },
  plugins: [contQueries, trac({ prefix: "rac" })],
};
