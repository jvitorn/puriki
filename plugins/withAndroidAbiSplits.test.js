const {
  applyAbiSplits,
  applyReleaseOptimizationProperties,
  ABIS,
  RELEASE_OPTIMIZATION_PROPERTIES,
} = require('./withAndroidAbiSplits');

function fakeBuildGradle() {
  return [
    'apply plugin: "com.android.application"',
    '',
    'android {',
    '    ndkVersion rootProject.ext.ndkVersion',
    '',
    "    namespace 'com.jvitorn.puriki'",
    '    defaultConfig {',
    "        applicationId 'com.jvitorn.puriki'",
    '        versionCode 1',
    '        versionName "1.0.0"',
    '    }',
    '    buildTypes {',
    '        release {',
    '            minifyEnabled enableMinifyInReleaseBuilds',
    '        }',
    '    }',
    '}',
    '',
    'dependencies {',
    '    implementation("com.facebook.react:react-android")',
    '}',
  ].join('\n');
}

describe('applyAbiSplits', () => {
  it('inserts the expected splits.abi configuration', () => {
    const result = applyAbiSplits(fakeBuildGradle());
    expect(result).toContain('splits {');
    expect(result).toContain('abi {');
    expect(result).toContain('enable true');
    expect(result).toContain('reset()');
    expect(result).toContain('universalApk true');
  });

  it('includes exactly the intended ABI list', () => {
    const result = applyAbiSplits(fakeBuildGradle());
    const includeLine = result
      .split('\n')
      .find((line) => line.trim().startsWith('include '));
    expect(includeLine).toBeDefined();
    for (const abi of ABIS) {
      expect(includeLine).toContain(`"${abi}"`);
    }
    // Exactly these four, nothing extra.
    expect(ABIS.sort()).toEqual(
      ['arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64'].sort(),
    );
  });

  it('enables universalApk', () => {
    const result = applyAbiSplits(fakeBuildGradle());
    expect(result).toMatch(/universalApk\s+true/);
  });

  it('is idempotent: running it twice does not duplicate the block', () => {
    const once = applyAbiSplits(fakeBuildGradle());
    const twice = applyAbiSplits(once);
    expect(twice).toBe(once);
    const occurrences = (
      twice.match(/@generated begin puriki-abi-splits/g) ?? []
    ).length;
    expect(occurrences).toBe(1);
  });

  it('throws instead of silently doing nothing when the android block anchor is missing', () => {
    const brokenGradle = 'dependencies {\n    implementation("x")\n}\n';
    expect(() => applyAbiSplits(brokenGradle)).toThrow(
      /could not find the 'android \{' block/,
    );
  });

  it('leaves unrelated Gradle content intact', () => {
    const original = fakeBuildGradle();
    const result = applyAbiSplits(original);
    expect(result).toContain("namespace 'com.jvitorn.puriki'");
    expect(result).toContain("applicationId 'com.jvitorn.puriki'");
    expect(result).toContain('versionCode 1');
    expect(result).toContain('versionName "1.0.0"');
    expect(result).toContain('minifyEnabled enableMinifyInReleaseBuilds');
    expect(result).toContain(
      'implementation("com.facebook.react:react-android")',
    );
  });

  it('places the splits block inside the android block, right after it opens', () => {
    const result = applyAbiSplits(fakeBuildGradle());
    const androidIndex = result.indexOf('android {');
    const splitsIndex = result.indexOf('splits {');
    const namespaceIndex = result.indexOf("namespace 'com.jvitorn.puriki'");
    expect(androidIndex).toBeGreaterThan(-1);
    expect(splitsIndex).toBeGreaterThan(androidIndex);
    expect(splitsIndex).toBeLessThan(namespaceIndex);
  });
});

describe('applyReleaseOptimizationProperties', () => {
  it('enables R8 minification and optimized resource shrinking', () => {
    const result = applyReleaseOptimizationProperties([]);

    for (const [key, value] of Object.entries(
      RELEASE_OPTIMIZATION_PROPERTIES,
    )) {
      expect(result).toContainEqual({ type: 'property', key, value });
    }
  });

  it('updates existing properties without duplicates and preserves comments', () => {
    const input = [
      { type: 'comment', value: 'Keep this project setting' },
      {
        type: 'property',
        key: 'android.enableMinifyInReleaseBuilds',
        value: 'false',
      },
      {
        type: 'property',
        key: 'android.enableMinifyInReleaseBuilds',
        value: 'false',
      },
    ];

    const result = applyReleaseOptimizationProperties(input);

    expect(result).toContainEqual(input[0]);
    expect(
      result.filter(
        (property) =>
          property.type === 'property' &&
          property.key === 'android.enableMinifyInReleaseBuilds',
      ),
    ).toEqual([
      {
        type: 'property',
        key: 'android.enableMinifyInReleaseBuilds',
        value: 'true',
      },
    ]);
  });

  it('does not mutate the input and is idempotent', () => {
    const input = [{ type: 'property', key: 'existing', value: 'value' }];
    const once = applyReleaseOptimizationProperties(input);
    const twice = applyReleaseOptimizationProperties(once);

    expect(input).toEqual([
      { type: 'property', key: 'existing', value: 'value' },
    ]);
    expect(twice).toEqual(once);
  });
});
