import { afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

// jest-dom needs a DOM; node-environment suites (worker sqlite tests) skip cleanup.
if (typeof document !== 'undefined') {
  afterEach(() => {
    document.body.innerHTML = '';
  });
}
