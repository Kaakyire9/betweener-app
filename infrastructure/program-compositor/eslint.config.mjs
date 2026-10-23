import awscdk, { configs as awscdkConfigs } from 'eslint-plugin-awscdk';
import { config, configs as tseslintConfigs } from 'typescript-eslint';

export default config(
  {
    ignores: ['cdk.out/**', 'node_modules/**'],
  },
  ...tseslintConfigs.recommendedTypeChecked,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      awscdk,
    },
    rules: {
      ...awscdkConfigs.recommended.rules,
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
);
