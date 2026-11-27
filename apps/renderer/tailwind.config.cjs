/**
 * Tailwind is kept for layout utilities only. Every colour, radius and shadow
 * resolves to an Astryx design token, so pages written with Tailwind classes
 * and Astryx components draw from the same palette. `color-mix` keeps the
 * opacity modifiers (`bg-success/10`) working on top of the token values.
 */
const token = (name) => ({ opacityValue }) =>
  opacityValue === undefined
    ? `var(${name})`
    : `color-mix(in srgb, var(${name}) calc(${opacityValue} * 100%), transparent)`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  // Astryx ships its own reset (in the `reset` cascade layer); Tailwind's
  // preflight is unlayered and would override every Astryx component.
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        // Fuego gold = the Astryx accent (overridden in index.css).
        primary: {
          50: "rgb(var(--fuego-gold-50) / <alpha-value>)",
          100: "rgb(var(--fuego-gold-100) / <alpha-value>)",
          200: "rgb(var(--fuego-gold-200) / <alpha-value>)",
          300: "rgb(var(--fuego-gold-300) / <alpha-value>)",
          400: "rgb(var(--fuego-gold-400) / <alpha-value>)",
          500: "rgb(var(--fuego-gold-500) / <alpha-value>)",
          600: "rgb(var(--fuego-gold-600) / <alpha-value>)",
          700: "rgb(var(--fuego-gold-700) / <alpha-value>)",
          800: "rgb(var(--fuego-gold-800) / <alpha-value>)",
          900: "rgb(var(--fuego-gold-900) / <alpha-value>)",
          950: "rgb(var(--fuego-gold-950) / <alpha-value>)",
          DEFAULT: token("--color-accent"),
        },
        surface: token("--color-background-surface"),
        "surface-2": token("--color-background-body"),
        border: token("--color-border"),
        "border-strong": token("--color-border-emphasized"),
        "text-primary": token("--color-text-primary"),
        "text-secondary": token("--color-text-secondary"),
        success: token("--color-success"),
        warning: token("--color-warning"),
        danger: token("--color-error"),
        info: token("--color-info"),
      },
      borderColor: { DEFAULT: "var(--color-border)" },
      borderRadius: {
        btn: "var(--radius-element)",
        card: "var(--radius-container)",
        modal: "var(--radius-container)",
      },
      fontFamily: {
        sans: ["var(--font-family-body)"],
      },
      fontSize: {
        h1: ["28px", { lineHeight: "1.2" }],
        h2: ["22px", { lineHeight: "1.25" }],
        h3: ["17px", { lineHeight: "1.35" }],
      },
      boxShadow: {
        card: "var(--shadow-low)",
        hover: "var(--shadow-high)",
      },
    },
  },
  plugins: [],
};
