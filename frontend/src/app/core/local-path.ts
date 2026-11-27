/** a path of this site that a login may come back to (not another site, and not a protocol-relative address) */
export const isLocalPath = (url: unknown): url is string => typeof url === 'string' && /^\/(?!\/)/.test(url);
