/**
 * Timestamped logging utility
 * Adds timestamps to all log messages for debugging timing issues
 */

const getTimestamp = () => {
  const now = new Date();
  return now.toISOString();
};

const formatMessage = (message) => {
  return `[${getTimestamp()}] ${message}`;
};

export const logger = {
  log: (...args) => {
    const timestampedArgs = args.map((arg, index) => {
      if (index === 0 && typeof arg === 'string') {
        return formatMessage(arg);
      }
      return arg;
    });
    console.log(...timestampedArgs);
  },
  
  error: (...args) => {
    const timestampedArgs = args.map((arg, index) => {
      if (index === 0 && typeof arg === 'string') {
        return formatMessage(arg);
      }
      return arg;
    });
    console.error(...timestampedArgs);
  },
  
  warn: (...args) => {
    const timestampedArgs = args.map((arg, index) => {
      if (index === 0 && typeof arg === 'string') {
        return formatMessage(arg);
      }
      return arg;
    });
    console.warn(...timestampedArgs);
  }
};

