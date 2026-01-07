/**
 * Performance Utilities for React App Optimization
 */

// Debounce utility - delays function execution until after wait time
export const debounce = (func, wait = 300) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

// Throttle utility - limits function execution to once per limit time
export const throttle = (func, limit = 300) => {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
};

// Lazy loading helper for images
export const lazyLoadImage = (src, placeholder = '') => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = src;
    img.onload = () => resolve(src);
    img.onerror = () => resolve(placeholder);
  });
};

// Memory cache with size limit
export class MemoryCache {
  constructor(maxSize = 100) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  get(key) {
    return this.cache.get(key);
  }

  set(key, value) {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  has(key) {
    return this.cache.has(key);
  }

  clear() {
    this.cache.clear();
  }

  size() {
    return this.cache.size;
  }
}

// Performance monitoring
export class PerformanceMonitor {
  constructor() {
    this.metrics = {
      renderTime: [],
      networkTime: [],
      encryptionTime: []
    };
  }

  startTimer(label) {
    return performance.now();
  }

  endTimer(label, startTime) {
    const duration = performance.now() - startTime;
    if (this.metrics[label]) {
      this.metrics[label].push(duration);
      if (this.metrics[label].length > 100) {
        this.metrics[label].shift();
      }
    }
    return duration;
  }

  getAverageTime(label) {
    const times = this.metrics[label];
    if (!times || times.length === 0) return 0;
    return times.reduce((a, b) => a + b, 0) / times.length;
  }

  getReport() {
    return {
      avgRenderTime: this.getAverageTime('renderTime').toFixed(2) + 'ms',
      avgNetworkTime: this.getAverageTime('networkTime').toFixed(2) + 'ms',
      avgEncryptionTime: this.getAverageTime('encryptionTime').toFixed(2) + 'ms'
    };
  }
}

// Virtual scrolling helper
export const calculateVisibleRange = (scrollTop, itemHeight, containerHeight, totalItems) => {
  const start = Math.floor(scrollTop / itemHeight);
  const end = Math.min(
    totalItems,
    Math.ceil((scrollTop + containerHeight) / itemHeight)
  );
  return { start: Math.max(0, start - 5), end: end + 5 }; // Add buffer
};

// Batch state updates
export const batchUpdates = (updates) => {
  return Promise.all(updates);
};

// Check if user prefers reduced motion
export const prefersReducedMotion = () => {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

// Request idle callback polyfill
export const requestIdleCallback = window.requestIdleCallback || 
  ((cb) => setTimeout(cb, 1));

// Cancel idle callback polyfill
export const cancelIdleCallback = window.cancelIdleCallback || 
  ((id) => clearTimeout(id));

// Optimize large list rendering
export const chunkArray = (array, chunkSize = 50) => {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
};

export default {
  debounce,
  throttle,
  lazyLoadImage,
  MemoryCache,
  PerformanceMonitor,
  calculateVisibleRange,
  batchUpdates,
  prefersReducedMotion,
  requestIdleCallback,
  cancelIdleCallback,
  chunkArray
};
