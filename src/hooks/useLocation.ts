import React, { useState, useCallback, useRef, useEffect } from 'react';
import { reverseGeocode } from '../lib/geocoding';
import { getCachedLocation, setCachedLocation } from '../lib/userCache';
import { normalizeString } from '../lib/utils';

export interface LocationData {
  city: string;
  state: string;
  cep?: string;
  lat?: number;
  lng?: number;
  type: 'gps' | 'ip' | 'manual' | 'cache';
}

export type LocationStatus = 'idle' | 'detecting' | 'detected' | 'failed';

export function useLocation() {
  const [status, setStatus] = useState<LocationStatus>('idle');
  const [location, setLocation] = useState<LocationData | null>(() => {
    const cached = getCachedLocation();
    return cached ? { ...cached, type: 'cache' as const } : null;
  });
  const [coords, setCoords] = useState<{ lat: number, lng: number } | null>(null);

  const setLocationWrapper = useCallback((data: LocationData) => {
    setLocation(data);
    if (data.lat && data.lng) {
      setCoords({ lat: data.lat, lng: data.lng });
    }
    setCachedLocation(data as any);
  }, []);

  const fallbackToIp = useCallback(async () => {
    try {
      const res = await fetch('https://ipwho.is/');
      const data = await res.json();
      if (data.success && data.city && data.region_code) {
        const detectedCep = data.postal || '';
        const newCoords = { lat: data.latitude, lng: data.longitude };
        
        const locData: LocationData = {
          city: data.city,
          state: data.region_code,
          cep: detectedCep,
          lat: newCoords.lat,
          lng: newCoords.lng,
          type: 'ip'
        };

        setCoords(newCoords);
        setLocation(locData);
        setStatus('detected');
        setCachedLocation(locData as any);
        return locData;
      } else {
        setStatus('failed');
        return null;
      }
    } catch (err) {
      console.error('IP Location failed:', err);
      setStatus('failed');
      return null;
    }
  }, []);

  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const detectLocation = useCallback(async (forceFallbackArg: boolean | React.MouseEvent = false) => {
    if (statusRef.current === 'detecting') return;
    const forceFallback = typeof forceFallbackArg === 'boolean' ? forceFallbackArg : false;

    // Check cache first if not explicitly forcing detection
    const cached = getCachedLocation();
    if (cached && !forceFallback) {
      const mapped = { ...cached, type: 'cache' as const };
      setLocation(mapped);
      if (cached.lat && cached.lng) {
        setCoords({ lat: cached.lat, lng: cached.lng });
      }
      setStatus('detected');
      return mapped;
    }

    setStatus('detecting');

    if ("geolocation" in navigator) {
      return new Promise<LocationData | null>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const newCoords = { lat: position.coords.latitude, lng: position.coords.longitude };
            setCoords(newCoords);
            
            try {
              const data = await reverseGeocode(newCoords.lat, newCoords.lng);
              if (data && data.address) {
                const city = data.address.city || data.address.town || data.address.village || data.address.suburb || data.address.municipality || '';
                let state = data.address.state_code || '';
                const cep = data.address.postcode || '';
                
                if (!state && data.address['ISO3166-2-lvl4']) {
                  const parts = data.address['ISO3166-2-lvl4'].split('-');
                  state = parts.length > 1 ? parts[1] : parts[0];
                }

                if (!state) {
                  const stateCandidate = data.address.state || data.address.region || data.address.province;
                  if (stateCandidate) {
                    const stateMap: Record<string, string> = {
                      'acre': 'AC', 'alagoas': 'AL', 'amapa': 'AP', 'amazonas': 'AM',
                      'bahia': 'BA', 'ceara': 'CE', 'distrito federal': 'DF', 'espirito santo': 'ES',
                      'goias': 'GO', 'maranhao': 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS',
                      'minas gerais': 'MG', 'para': 'PA', 'paraiba': 'PB', 'parana': 'PR',
                      'pernambuco': 'PE', 'piaui': 'PI', 'rio de janeiro': 'RJ', 'rio grande do norte': 'RN',
                      'rio grande do sul': 'RS', 'rondonia': 'RO', 'roraima': 'RR', 'santa catarina': 'SC',
                      'sao paulo': 'SP', 'sergipe': 'SE', 'tocantins': 'TO'
                    };
                    const normalized = normalizeString(stateCandidate);
                    state = stateMap[normalized] || stateCandidate.substring(0, 2).toUpperCase();
                  }
                }

                if (state && state.length > 2) {
                  state = state.substring(0, 2).toUpperCase();
                }

                const locData: LocationData = {
                  city,
                  state: state || '',
                  cep,
                  lat: newCoords.lat,
                  lng: newCoords.lng,
                  type: 'gps'
                };

                setLocation(locData);
                setStatus('detected');
                setCachedLocation(locData as any);
                resolve(locData);
              } else {
                const ipLoc = await fallbackToIp();
                resolve(ipLoc);
              }
            } catch (e) {
              const ipLoc = await fallbackToIp();
              resolve(ipLoc);
            }
          },
          async () => {
            const ipLoc = await fallbackToIp();
            resolve(ipLoc);
          },
          { timeout: 10000 }
        );
      });
    } else {
      return await fallbackToIp();
    }
  }, [fallbackToIp]);

  return {
    status,
    location,
    coords,
    detectLocation,
    setLocation: setLocationWrapper,
    setCoords,
    setStatus
  };
}
