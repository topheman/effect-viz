# Project context

This project is based on a custom template relying on the following stack:

- React 19 (with react-compiler)
- Vite 7
- TypeScript 5.9
- Tailwind CSS 4
- Testing: Vitest + React Testing Library
- Linting: ESLint with:
  - Prettier configured as a plugin
  - Better Tailwind CSS integration
  - Testing Library integration
  - Import plugin

## Guidelines

- ALWAYS ASK FOR CONFIRMATION before installing a new dependency.
- TypeScript and Eslint is properly configured. Take advantage of it.
  - `npm run lint`: runs eslint
  - `npm run lint:fix`: auto fixes eslint errors
- vitest, a test runner, is properly configured with react-testing-library. Take advantage of it. Write tests for your code.
  - `npm run test`: runs tests
- Use tailwind 4 for styling unless you are told otherwise.
- Format on save is enabled.
- Git hooks are enabled.
