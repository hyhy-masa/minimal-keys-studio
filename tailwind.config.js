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
      },
    },
  },
  plugins: [contQueries, trac({ prefix: "rac" })],
};
