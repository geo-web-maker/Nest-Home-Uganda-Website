// Adds the DOM matchers (toBeInTheDocument, toBeDisabled, toHaveAttribute, ...) to Vitest's expect,
// and their types to every file in src. Loaded by vitest.config.ts through setupFiles.
import '@testing-library/jest-dom/vitest';
