/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#e2f1ec",
          600: "#267c70",
          700: "#164b46",
        },
      },
    },
  },
  plugins: [],
};

