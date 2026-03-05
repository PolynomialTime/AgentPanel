/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Serif — for headings, logo, and editorial text
        serif:   ['Playfair Display', 'Georgia', 'Times New Roman', 'serif'],
        // Display — kept as Playfair Display so font-display also uses serif
        display: ['Playfair Display', 'Georgia', 'Times New Roman', 'serif'],
        // Body — clean sans-serif for small text, labels, meta
        body:    ['Exo 2', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
