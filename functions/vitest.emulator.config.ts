import { defineConfig } from "vitest/config";

// The tests that need the Firestore emulator: `npm run test:emulator` (from the project root) starts it and runs them.
export default defineConfig({
  test: { include: ["test-emulator/**/*.test.ts"], testTimeout: 60_000, fileParallelism: false },
});
