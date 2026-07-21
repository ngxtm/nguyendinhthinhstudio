function etagError(): Error {
  return new Error('Invalid canonical ETag');
}

export function canonicalizeEtag(value: string): string {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    throw etagError();
  }
  if (/^w\//i.test(value)) {
    throw etagError();
  }

  let canonical = value;
  const startsQuoted = value.startsWith('"');
  const endsQuoted = value.endsWith('"');
  if (startsQuoted || endsQuoted) {
    if (!startsQuoted || !endsQuoted || value.length < 3) {
      throw etagError();
    }
    canonical = value.slice(1, -1);
  }

  if (
    canonical.length === 0 ||
    /["\x00-\x20\x7f]/.test(canonical) ||
    (!startsQuoted && value.includes('"'))
  ) {
    throw etagError();
  }
  return canonical;
}

export function toHttpEtag(value: string): string {
  return `"${canonicalizeEtag(value)}"`;
}
