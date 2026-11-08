const config = {
  plugins: process.env.NEXT_PUBLIC_VISUAL_PREVIEW === "1" ? { "@tailwindcss/postcss": {} } : {},
};

export default config;
