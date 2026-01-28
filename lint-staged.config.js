export default {
  "*.{js,jsx,ts,tsx}": [
    "eslint --fix",
    () => "npm run typecheck",
    "vitest related"
  ]
}
