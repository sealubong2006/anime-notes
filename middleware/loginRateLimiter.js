// Minimal in-memory brute-force guard for the single-admin login. Resets on
// server restart and is per-instance only — an acceptable trade-off for a
// single-instance personal site, and avoids adding a dependency just for this.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const attemptsByIp = new Map();

function getRecord(ip) {
    const record = attemptsByIp.get(ip);
    if (!record) {
        return null;
    }
    if (Date.now() - record.firstAttempt > WINDOW_MS) {
        attemptsByIp.delete(ip);
        return null;
    }
    return record;
}

export function isRateLimited(ip) {
    const record = getRecord(ip);
    return record !== null && record.count >= MAX_ATTEMPTS;
}

export function recordFailedAttempt(ip) {
    const record = getRecord(ip);
    if (record) {
        record.count += 1;
    } else {
        attemptsByIp.set(ip, { count: 1, firstAttempt: Date.now() });
    }
}

export function clearAttempts(ip) {
    attemptsByIp.delete(ip);
}
