export function assertConflictResolverEnvironment(env: NodeJS.ProcessEnv) {
  if (env.IMAGE_UPLOAD_PROCESS_ROLE !== 'cutover') throw new Error('IMAGE_UPLOAD_PROCESS_ROLE must be cutover');
  if (!env.IMAGE_UPLOAD_OPERATOR_TOKEN) throw new Error('IMAGE_UPLOAD_OPERATOR_TOKEN is required');
  for (const key of ['IMAGE_UPLOAD_CUTOVER_QUEUE_TOKEN', 'IMAGE_UPLOAD_QUEUE_TOKEN', 'NDT_STAGING_EVENT_RULE_ID']) {
    if (env[key]) throw new Error(`${key} is obsolete for polling conflict resolution`);
  }
}

export function parseConflictResolution(args: readonly string[]) {
  const values = Object.fromEntries(args.map((value) => value.split('=', 2) as [string, string]));
  const resolution = values['--resolution'];
  if (!['confirmed_absent', 'cleanup_authorized', 'committed_authorized'].includes(resolution)) throw new Error('invalid conflict resolution');
  for (const key of ['--conflict-id', '--evidence-receipt', '--operator-fingerprint', '--approval-digest']) if (!values[key]) throw new Error(`${key} is required`);
  return values;
}

if (require.main === module) { try { assertConflictResolverEnvironment(process.env); parseConflictResolution(process.argv.slice(2)); } catch (error) { process.stderr.write(`${(error as Error).message}\n`); process.exitCode = 1; } }
