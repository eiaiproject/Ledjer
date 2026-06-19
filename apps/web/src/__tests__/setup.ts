import { afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

// Cleanup after each test
afterEach(() => {
  document.body.innerHTML = '';
});
