export interface UserLocationCache {
  city: string;
  state: string;
  lat?: number;
  lng?: number;
  cep?: string;
  type: 'gps' | 'ip' | 'manual';
  timestamp: number;
}

const CACHE_KEY = '@farmacias:location';
const DEVICE_KEY = '@farmacias:device_id';
const TTL = 1000 * 60 * 60 * 24; // 24 hours

// Helper to generate a basic unique device ID if not exists
export const getDeviceId = (): string => {
  let deviceId = localStorage.getItem(DEVICE_KEY);
  if (!deviceId) {
    deviceId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36);
    localStorage.setItem(DEVICE_KEY, deviceId);
    // Setting device ID in a cookie for backend optimizations
    document.cookie = `device_id=${deviceId}; max-age=31536000; path=/; samesite=lax`;
  }
  return deviceId;
};

export const getCachedLocation = (): UserLocationCache | null => {
  try {
    getDeviceId(); // Ensure device gets tracked
    const data = localStorage.getItem(CACHE_KEY);
    if (!data) return null;
    
    const parsed = JSON.parse(data) as UserLocationCache;
    
    // Check expiration
    if (Date.now() - parsed.timestamp > TTL) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    
    return parsed;
  } catch (e) {
    return null;
  }
};

export const setCachedLocation = (location: Omit<UserLocationCache, 'timestamp'>) => {
  try {
    const dataToSave = {
      ...location,
      timestamp: Date.now()
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(dataToSave));
    
    // Also save simple data as cookies for potential SSR/backend optimizations
    document.cookie = `user_city=${encodeURIComponent(location.city)}; max-age=86400; path=/; samesite=lax`;
    document.cookie = `user_state=${encodeURIComponent(location.state)}; max-age=86400; path=/; samesite=lax`;
    if (location.lat && location.lng) {
      document.cookie = `user_lat=${location.lat}; max-age=86400; path=/; samesite=lax`;
      document.cookie = `user_lng=${location.lng}; max-age=86400; path=/; samesite=lax`;
    }
  } catch (e) {
    console.error("Failed to save location data to local storage", e);
  }
};

export const clearCachedLocation = () => {
  try {
    localStorage.removeItem(CACHE_KEY);
    document.cookie = "user_city=; max-age=0; path=/;";
    document.cookie = "user_state=; max-age=0; path=/;";
    document.cookie = "user_lat=; max-age=0; path=/;";
    document.cookie = "user_lng=; max-age=0; path=/;";
  } catch(e) {}
};
