export function assertQuarantineResolverEnvironment(env: NodeJS.ProcessEnv) {
  if (env.IMAGE_UPLOAD_PROCESS_ROLE !== 'cutover') throw new Error('IMAGE_UPLOAD_PROCESS_ROLE must be cutover');
  if (!env.IMAGE_UPLOAD_OPERATOR_TOKEN || !env.IMAGE_UPLOAD_CUTOVER_QUEUE_TOKEN) throw new Error('operator and cutover Queue tokens are required');
  if (env.IMAGE_UPLOAD_QUEUE_TOKEN) throw new Error('reconciler Queue token is forbidden');
}

export function parseQuarantineResolution(args: readonly string[]) {
  const values = Object.fromEntries(args.map((value) => value.split('=', 2) as [string, string]));
  if (!['quarantined_ack', 'replay_requested'].includes(values['--resolution'])) throw new Error('invalid quarantine resolution');
  for (const key of ['--quarantine-id', '--source-queue-id', '--dlq-id', '--evidence-receipt', '--operator-fingerprint', '--approval-digest']) if (!values[key]) throw new Error(`${key} is required`);
  return values;
}

if (require.main === module) { try { assertQuarantineResolverEnvironment(process.env); parseQuarantineResolution(process.argv.slice(2)); } catch (error) { process.stderr.write(`${(error as Error).message}\n`); process.exitCode = 1; } }
