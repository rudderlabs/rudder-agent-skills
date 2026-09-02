/// <reference types="vite/client" />

import type { RudderAnalytics } from '@rudderstack/analytics-js';

declare global {
  interface Window {
    rudderanalytics?: RudderAnalytics;
    RUDDERSTACK_WRITE_KEY?: string;
    RUDDERSTACK_DATA_PLANE_URL?: string;
  }
}

export {};
