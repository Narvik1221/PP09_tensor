module.exports = {
  content: ["./*.html", "./assets/js/*.js"],
  theme: {
    extend: {
      colors: {
        brand: "#2547BD",
        accent: "#2F62DD",
        dark: "#0F172A",
        muted: "#64748B",
        page: "#F4F7FC",
      },
      fontFamily: {
        sans: ["Inter", "Arial", "sans-serif"],
      },
      boxShadow: {
        card: "0 18px 45px rgba(15, 23, 42, 0.1)",
      },
    },
  },
  plugins: [],
};
