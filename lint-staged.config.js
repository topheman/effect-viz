export default {
  "*.{js,jsx,ts,tsx}": [
    "eslint --fix",
    () => "pnpm run typecheck",
    "vitest related"
  ]
}
