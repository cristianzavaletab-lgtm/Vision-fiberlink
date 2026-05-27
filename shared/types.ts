export interface Device {
  id: string;
  name: string;
  os: string;
  status: 'online' | 'offline';
  lastSeen: number;
  cpu?: number;
  ram?: number;
  activeApp?: string;
}

export interface ScreenshotUpdate {
  deviceId: string;
  image: string; // base64 encoded image
  timestamp: number;
}

