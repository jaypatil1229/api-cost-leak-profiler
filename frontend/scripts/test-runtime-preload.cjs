// TSX falls back to os.userInfo() on Windows when process.geteuid is absent.
// Some locked-down Windows environments deny that OS lookup, so give TSX a
// non-sensitive per-user suffix for its temporary IPC path instead.
if (typeof process.geteuid !== 'function') {
  process.geteuid = () => process.env.USERNAME || process.env.USER || 'aclp-test';
}
