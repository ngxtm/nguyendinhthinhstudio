import { resolve, isAbsolute, relative } from 'node:path';
import { parseImageUploadRuntimeConfig } from '../images/image-upload-runtime-config';

export function assertCutoverEnvironment(env: NodeJS.ProcessEnv) {
  const config = parseImageUploadRuntimeConfig(env, 'cutover');
  if (config.presignEnabled) throw new Error('cutover requires presign disabled');
  return config;
}

export function assertProtectedPath(path: string, repositoryRoot = resolve(__dirname, '../../..')): string {
  if (!isAbsolute(path)) throw new Error('cutover evidence path must be absolute');
  const relation = relative(repositoryRoot, resolve(path));
  if (relation === '' || (!relation.startsWith('..') && !isAbsolute(relation))) throw new Error('cutover evidence must be outside the repository');
  return resolve(path);
}

export function parseCutoverCommand(args: readonly string[]) {
  const mode = args[0];
  if (!['audit', 'apply', 'approve', 'disposition'].includes(mode)) throw new Error('invalid cutover mode');
  const values = Object.fromEntries(args.slice(1).map((value) => value.split('=', 2) as [string, string]));
  const required = mode === 'disposition' ? ['--audit-receipt', '--upload-id', '--decision', '--evidence-receipt', '--output', '--operator-fingerprint'] : mode === 'approve' ? ['--receipt', '--approval'] : ['--receipt', '--backup-receipt', '--backup-approval'];
  for (const key of required) {
    if (!values[key]) throw new Error(`${key} is required`);
  }
  for (const key of mode === 'disposition' ? ['--audit-receipt', '--evidence-receipt', '--output'] : mode === 'approve' ? ['--receipt', '--approval'] : ['--receipt', '--backup-receipt', '--backup-approval']) assertProtectedPath(values[key]);
  return { mode, values };
}

if (require.main === module) {
  try { assertCutoverEnvironment(process.env); parseCutoverCommand(process.argv.slice(2)); }
  catch (error) { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; }
}
