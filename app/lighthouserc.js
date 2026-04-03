module.exports = {
  ci: {
    collect: {
      // URL de la aplicación a analizar (se puede sobreescribir en el script)
      url: ['http://localhost:3000'],
      numberOfRuns: 3,
      settings: {
        preset: 'desktop',
        // Configuraciones adicionales
        skipAudits: ['uses-http2'],
      },
    },
    assert: {
      // Umbrales mínimos para los scores de Lighthouse
      assertions: {
        'categories:performance': ['error', { minScore: 0.8 }],
        'categories:accessibility': ['error', { minScore: 0.9 }],
        'categories:best-practices': ['error', { minScore: 0.85 }],
        'categories:seo': ['error', { minScore: 0.85 }],
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
