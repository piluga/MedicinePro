/** @type {import('tailwindcss').Config} */
// Tailwind scansiona questi file per trovare le classi usate.
// Dopo ogni modifica a index.html o ai file in js/ esegui: npm run build:css
module.exports = {
  content: ['./index.html', './js/**/*.js'],
  theme: { extend: {} },
  plugins: []
};
