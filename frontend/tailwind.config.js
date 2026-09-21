/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef8ff",
          600: "#0878b8",
          700: "#075f91",
        },
      },
    },
  },
  plugins: [],
};

