const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const yaml = require('js-yaml');

test('hosted type generation is manual, explicitly approved and staging-only', () => {
  const source = readFileSync('.github/workflows/supabase-types.yml', 'utf8');
  const workflow = yaml.load(source);
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
  const approval = workflow.on.workflow_dispatch.inputs.confirm_staging_read;
  assert.equal(approval.type, 'boolean');
  assert.equal(approval.default, false);
  assert.equal(workflow.jobs.types.if, '${{ inputs.confirm_staging_read == true }}');
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  const check = workflow.jobs.types.steps.find(step => step.run === 'npm run supabase:types:check');
  assert.equal(check.env.SUPABASE_PROJECT_ID, 'xsgzxadwuxuziubglvps');
  assert.equal(check.env.SUPABASE_ACCESS_TOKEN, '${{ secrets.SUPABASE_STAGING_ACCESS_TOKEN }}');
  assert.doesNotMatch(source, /jbyblhithbqwojhwlenv|supabase login|db push|functions deploy/);
});
