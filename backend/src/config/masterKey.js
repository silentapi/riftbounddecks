import crypto from 'crypto';

// Generate master registration key in memory on module load
// This key is valid for unlimited registrations and is regenerated on each server restart
const MASTER_REGISTRATION_KEY = crypto.randomBytes(16).toString('hex');

/**
 * Get the current master registration key
 * @returns {string} The master registration key (changes on each server restart)
 */
export const getMasterRegistrationKey = () => MASTER_REGISTRATION_KEY;

/**
 * Check if a given key matches the master registration key
 * @param {string} key - The key to check
 * @returns {boolean} True if the key matches the master key
 */
export const isMasterKey = (key) => {
  return key === MASTER_REGISTRATION_KEY;
};

export default MASTER_REGISTRATION_KEY;

