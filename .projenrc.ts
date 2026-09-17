import { GemeenteNijmegenCdkApp } from '@gemeentenijmegen/projen-project-type';
import { TypeScriptModuleResolution } from 'projen/lib/javascript';
import { Transform } from 'projen/lib/javascript/jest';

const project = new GemeenteNijmegenCdkApp({
  cdkVersion: '2.22.0',
  defaultReleaseBranch: 'production',
  majorVersion: 1,
  name: 'yivi-issue-app',
  projenrcTs: true,
  repository: 'https://github.com/GemeenteNijmegen/yivi-issue-app.git',
  deps: [
    'dotenv',
    '@aws-solutions-constructs/aws-lambda-dynamodb',
    '@gemeentenijmegen/dnssec-record',
    '@gemeentenijmegen/aws-constructs',
    '@gemeentenijmegen/cross-region-parameters',
    '@pepperize/cdk-route53-health-check',

    // Lambda packages
    '@aws-sdk/client-dynamodb',
    '@aws-sdk/client-secrets-manager',
    '@aws-sdk/client-ssm',
    '@aws-sdk/client-ses',
    '@aws-sdk/client-cloudwatch-logs',
    '@gemeentenijmegen/apiclient',
    '@gemeentenijmegen/session',
    '@gemeentenijmegen/utils',
    '@gemeentenijmegen/apigateway-http',
    'axios',
    'mustache',
    '@types/mustache',
    'aws4-axios',
    'openid-client',
    '@types/cookie',
    'cookie',
    '@types/aws-lambda',
    'chart.js',
    '@privacybydesign/yivi-frontend',
    '@gemeentenijmegen/projen-project-type',
  ],
  devDeps: [
    'copyfiles',
    '@playwright/test',
    'aws-sdk-client-mock',
    '@glen/jest-raw-loader',
    'axios-mock-adapter',
    'jest-aws-client-mock',
    'copyfiles',
  ],
  jestOptions: {
    jestConfig: {
      setupFiles: ['dotenv/config'],
      moduleFileExtensions: [
        'js', 'json', 'jsx', 'ts', 'tsx', 'node', 'mustache',
      ],
      transform: {
        '\\.[jt]sx?$': new Transform('ts-jest', {
          isolatedModules: true,
        }),
        '^.+\\.mustache$': new Transform('@glen/jest-raw-loader'),
      },
      testPathIgnorePatterns: ['/node_modules/', '/cdk.out', '/test/playwright'],
      roots: ['src', 'test'],
    },
  },
  tsconfig: {
    compilerOptions: {
      isolatedModules: true,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
    },
  },

  tsconfigDev: {
    compilerOptions: {
      module: 'CommonJS',
      moduleResolution: TypeScriptModuleResolution.NODE,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
    },
  },
  eslintOptions: {
    dirs: ['src'],
    devdirs: ['src/app/logout/tests', '/test', '/build-tools'],
  },
  gitignore: [
    'src/app/**/tests/output',
    'src/app/static-resources/packages/*',
    'test/playwright/report',
    'test/playwright/tests/report',
    'test/playwright/tests/results',
    'test/playwright/test-results',
    'test/playwright/screenshots',
    'test/__snapshots__/*',
    '*.csr',
    '*.der.key',
    '*.pem.key',
  ],
  bundlerOptions: {
    loaders: {
      mustache: 'text',
    },
  },
});
// @gemeentenijmegen/apiclient pins an exact axios version, which stops npm from
// deduping it with our own axios dependency and breaks axios-mock-adapter in tests.
project.package.addPackageResolutions('axios@^1.20.0');

project.tasks.tryFind('lint')?.reset(
  'cfn-lint cdk.out/**/*.template.json -i W3005 W2001 W3045',
);

project.addTask('install:chartjs', {
  exec: 'copyfiles -f -E -V node_modules/chart.js/dist/chart.umd.js src/app/static-resources/static/scripts/',
});

project.addTask('install:yivi-frontend', {
  exec: 'copyfiles -f -E -V node_modules/@privacybydesign/yivi-frontend/dist/yivi.js src/app/static-resources/static/scripts/',
});

project.addTask('postinstall', {
  exec: 'echo copying frontend files... && npx projen install:chartjs && npx projen install:yivi-frontend',
});

project.synth();