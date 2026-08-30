const { spawnSync } = require('node:child_process');

const { describe, expect, it } = require('@jest/globals');

function lint(code, filePath) {
  return spawnSync(
    process.execPath,
    [
      'node_modules/eslint/bin/eslint.js',
      '--stdin',
      '--stdin-filename',
      filePath,
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      input: code,
    },
  );
}

describe('layer boundary lint configuration', () => {
  it.each([
    [
      "import '@/application/auth/auth-contracts';",
      'src/domain/models/example.ts',
    ],
    [
      "import '@/presentation/providers/repository-provider';",
      'src/application/example.ts',
    ],
    [
      "import '@/presentation/screens/home-screen';",
      'src/infrastructure/example.ts',
    ],
    [
      "import '@/infrastructure/api/anilist/anilist-client';",
      'src/presentation/screens/example.tsx',
    ],
  ])('rejects %s from %s', (code, filePath) => {
    const result = lint(code, filePath);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('no-restricted-imports');
  });

  it('permits the explicit AppProviders composition entrypoint', () => {
    const result = lint(
      "import '@/infrastructure/composition/create-production-runtime';",
      'src/presentation/providers/app-providers.tsx',
    );
    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain('no-restricted-imports');
  });
});
