module.exports = {
  ci: {
    collect: {
      url: ["http://localhost:4173/", "http://localhost:4173/login"],
      numberOfRuns: 1,
      settings: {
        // Chrome flags for CI
        chromeFlags: "--no-sandbox --disable-gpu",
      },
    },
    assert: {
      // Budget thresholds (Lighthouse v12 scoring)
      assertions: {
        "categories:performance": ["warn", { minScore: 0.5 }],
        "categories:accessibility": ["warn", { minScore: 0.7 }],
        "categories:best-practices": ["warn", { minScore: 0.7 }],
        "categories:seo": ["warn", { minScore: 0.5 }],
        // Specific metrics
        "first-contentful-paint": ["warn", { maxNumericValue: 5000 }],
        "largest-contentful-paint": ["warn", { maxNumericValue: 8000 }],
        "cumulative-layout-shift": ["warn", { maxNumericValue: 0.3 }],
        "total-blocking-time": ["warn", { maxNumericValue: 5000 }],
        // Bundle size hints
        "resource-summary:script:size": ["warn", { maxNumericValue: 500000 }],
        "resource-summary:stylesheet:size": ["warn", { maxNumericValue: 100000 }],
      },
    },
    upload: {
      // Store results locally (no external server needed)
      target: "temporary-public-storage",
    },
  },
};
