/**
 * Whether a name received from a server is a single path segment that is safe to create inside
 * the destination. A malicious or buggy server must not be able to write outside it
 * (CVE-2019-6111 class issues), whether it sends the name in an SCP record or an SFTP listing.
 */
export function isSafeReceivedName(
  name: string,
  localPlatform: NodeJS.Platform = process.platform,
): boolean {
  return !(
    name === '' ||
    name === '.' ||
    name === '..' ||
    name.includes('/') ||
    name.includes('\0') ||
    // On Windows a backslash separates paths and a colon selects a drive or an NTFS alternate
    // data stream. Elsewhere both are ordinary characters in a file name.
    (localPlatform === 'win32' && (name.includes('\\') || name.includes(':')))
  );
}

/**
 * The mode a copy is created with. Without `preserve` only the permission bits travel, so a
 * server cannot hand out setuid, setgid or sticky files; the umask still applies on creation.
 */
export function creationMode(mode: number, preserve: boolean | undefined): number {
  return preserve ? mode & 0o7777 : mode & 0o777;
}
