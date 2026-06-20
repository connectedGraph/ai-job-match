/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "var(--teal)",
        secondary: "#475569",
        surface: {
          0: "var(--surface-0)",
          1: "var(--surface-1)",
          2: "var(--surface-2)",
          3: "var(--surface-3)",
        },
        tx: {
          1: "var(--tx-1)",
          2: "var(--tx-2)",
        },
      },
    },
  },
  plugins: [],
}
