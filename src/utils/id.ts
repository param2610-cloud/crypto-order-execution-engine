import { customAlphabet } from 'nanoid';

/**
 * Deterministic nanoid alphabet for shorter, URL-safe order identifiers.
 */
const nanoid = customAlphabet('123456789ABCDEFGHJKLMNPQRSTUVWXYZ', 12);

export const generateOrderId = () => nanoid();
