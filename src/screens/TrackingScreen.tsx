import React, { useEffect, useState, useRef } from 'react';
import Map, { Marker, MapRef } from 'react-map-gl/maplibre';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MdMyLocation, MdCompassCalibration, MdDownload } from 'react-icons/md';
import { CustomAttribution } from '../components/CustomAttribution';

const appConfig = {
  isOfflineOnly: false
};

maplibregl.addProtocol('osm', (params, abortController) => {
  return new Promise((resolve, reject) => {
    const url = params.url.replace('osm://', 'https://');
    caches.match(url).then(cached => {
      if (cached) {
        cached.arrayBuffer().then(buffer => {
          resolve({ data: buffer });
        });
      } else {
        if (appConfig.isOfflineOnly) {
          reject(new Error('Offline mode'));
          return;
        }
        fetch(url, { signal: abortController.signal })
          .then(res => {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.arrayBuffer();
          })
          .then(buffer => resolve({ data: buffer }))
          .catch(err => {
             reject(err);
          });
      }
    });
  });
});

const osmStyle = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['osm://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap Contributors',
      maxzoom: 18
    }
  },
  layers: [
    {
      id: 'osm',
      type: 'raster',
      source: 'osm',
      minzoom: 0,
      maxzoom: 22
    }
  ]
};

export default function TrackingScreen() {
  const mapRef = useRef<MapRef>(null);
  
  const [currentPos, setCurrentPos] = useState<[number, number] | null>(null);
  const [isLocked, setIsLocked] = useState(true);
  const [hasInitialGpsLock, setHasInitialGpsLock] = useState(false);
  const [bearing, setBearing] = useState(0);
  const [showPermissionPopup, setShowPermissionPopup] = useState(false);
  const [isLocationEnabled, setIsLocationEnabled] = useState(() => {
    return localStorage.getItem('locationPromptHandled') === 'true';
  });

  const [showDownloadPopup, setShowDownloadPopup] = useState(false);
  const [downloadOrigin, setDownloadOrigin] = useState('current');
  const [downloadRange, setDownloadRange] = useState(5);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isMapDownloaded, setIsMapDownloaded] = useState(false);
  const [isOfflineOnly, setIsOfflineOnly] = useState(false);
  const [mapReloadKey, setMapReloadKey] = useState(0);

  const checkDownloadStatus = async () => {
    const has = await caches.has('osm-offline-cache');
    if (has) {
      const cache = await caches.open('osm-offline-cache');
      const keys = await cache.keys();
      setIsMapDownloaded(keys.length > 0);
    } else {
      setIsMapDownloaded(false);
    }
  };

  useEffect(() => {
    checkDownloadStatus();
  }, []);

  const handleClearCache = async () => {
    await caches.delete('osm-offline-cache');
    setIsMapDownloaded(false);
    setMapReloadKey(prev => prev + 1);
  };

  const toggleOfflineOnly = (val: boolean) => {
    setIsOfflineOnly(val);
    appConfig.isOfflineOnly = val;
    setMapReloadKey(prev => prev + 1);
  };

  const handleDownloadMap = async () => {
    setIsDownloading(true);
    setDownloadProgress(0);
    
    let centerLat = 52.1764;
    let centerLon = 15.2831;

    if (downloadOrigin === 'center' && mapRef.current) {
      const center = mapRef.current.getCenter();
      centerLat = center.lat;
      centerLon = center.lng;
    } else if (downloadOrigin === 'current' && currentPos) {
      centerLat = currentPos[0];
      centerLon = currentPos[1];
    }

    try {
      await caches.delete('osm-offline-cache');
      const cache = await caches.open('osm-offline-cache');
      
      const rLat = downloadRange / 111.32;
      const rLon = downloadRange / (111.32 * Math.cos(centerLat * Math.PI / 180));
      
      const minLat = centerLat - rLat;
      const maxLat = centerLat + rLat;
      const minLon = centerLon - rLon;
      const maxLon = centerLon + rLon;
      
      const zooms = [10, 11, 12, 13, 14, 15, 16, 17, 18];
      const urls: string[] = [];
      
      function lon2tile(lon: number, zoom: number) { return Math.floor((lon + 180) / 360 * Math.pow(2, zoom)); }
      function lat2tile(lat: number, zoom: number) { 
        return Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom)); 
      }
      
      for (const z of zooms) {
        const minX = Math.max(0, lon2tile(minLon, z));
        const maxX = Math.min(Math.pow(2, z) - 1, lon2tile(maxLon, z));
        const minY = Math.max(0, lat2tile(maxLat, z));
        const maxY = Math.min(Math.pow(2, z) - 1, lat2tile(minLat, z));
        
        for (let x = minX; x <= maxX; x++) {
          for (let y = minY; y <= maxY; y++) {
            urls.push(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`);
          }
        }
      }
      
      const batchSize = 10;
      for (let i = 0; i < urls.length; i += batchSize) {
        const batch = urls.slice(i, i + batchSize);
        await Promise.all(batch.map(async url => {
          try {
            const res = await fetch(url);
            if (res.ok) {
              await cache.put(url, res);
            }
          } catch (e) {
            // gracefully ignore individual tile failure
          }
        }));
        setDownloadProgress(Math.min(100, Math.round(((i + batch.length) / urls.length) * 100)));
      }
      setIsMapDownloaded(true);
    } catch (e) {
      console.error(e);
    }
    
    setIsDownloading(false);
    setShowDownloadPopup(false);
  };

  useEffect(() => {
    const handled = localStorage.getItem('locationPromptHandled');
    if (!handled) {
      setShowPermissionPopup(true);
    }
  }, []);

  const requestPermissions = () => {
    setShowPermissionPopup(false);
    localStorage.setItem('locationPromptHandled', 'true');
    setIsLocationEnabled(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(() => {}, () => {});
    }
  };

  const cancelPermissions = () => {
    setShowPermissionPopup(false);
    localStorage.setItem('locationPromptHandled', 'dismissed');
  };

  useEffect(() => {
    if (!navigator.geolocation || !isLocationEnabled) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const newLat = pos.coords.latitude;
        const newLng = pos.coords.longitude;
        setCurrentPos([newLat, newLng]);
      },
      (err) => console.error("Location error", err),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [isLocationEnabled]);

  useEffect(() => {
    if (currentPos && mapRef.current) {
      if (!hasInitialGpsLock) {
        mapRef.current.flyTo({
          center: [currentPos[1], currentPos[0]],
          zoom: 16,
          animate: true,
          duration: 1000
        });
        setHasInitialGpsLock(true);
        setIsLocked(true);
      } else if (isLocked) {
        mapRef.current.flyTo({
          center: [currentPos[1], currentPos[0]],
          animate: true,
          duration: 1000
        });
      }
    }
  }, [currentPos, isLocked, hasInitialGpsLock]);

  const handleResetView = () => {
    setIsLocked(true);
    if (currentPos && mapRef.current) {
      mapRef.current.flyTo({
        center: [currentPos[1], currentPos[0]],
        animate: true,
        duration: 1000
      });
    }
  };

  const mapCenter = currentPos || [52.1764, 15.2831];
  const mapZoom = currentPos ? 16 : 14;

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-bg-main relative z-0">
      {showPermissionPopup && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-bg-nav p-6 rounded-2xl max-w-sm w-full shadow-2xl flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-primary/20 text-primary rounded-full flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-3xl">location_on</span>
            </div>
            <h2 className="text-xl font-bold mb-2">Wymagane uprawnienia</h2>
            <p className="text-inactive text-sm mb-6">
              Aplikacja potrzebuje dostępu do Twojej lokalizacji, aby móc pokazywać ją na mapie.
            </p>
            <div className="flex gap-3 w-full">
              <button 
                onClick={cancelPermissions}
                className="flex-1 py-3 rounded-xl font-semibold bg-gray-800 text-white"
              >
                Anuluj
              </button>
              <button 
                onClick={requestPermissions}
                className="flex-1 py-3 rounded-xl font-semibold bg-primary text-bg-main"
              >
                Zezwól
              </button>
            </div>
          </div>
        </div>
      )}

      {showDownloadPopup && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-bg-nav p-6 rounded-2xl max-w-sm w-full shadow-2xl flex flex-col items-center">
            <div className="w-16 h-16 bg-primary/20 text-primary rounded-full flex items-center justify-center mb-4">
              <MdDownload className="text-3xl" />
            </div>
            <h2 className="text-xl font-bold mb-4 text-center">Pobierz mapę offline</h2>
            
            <div className="w-full flex flex-col gap-4 mb-6">
              <div className="w-full">
                <label className="block text-sm text-inactive mb-2">Pobierz wokół:</label>
                <div className="relative">
                  <select 
                    value={downloadOrigin}
                    onChange={(e) => setDownloadOrigin(e.target.value)}
                    disabled={isDownloading}
                    className="w-full bg-[#1a1b1e] text-text-main rounded-xl p-4 appearance-none focus:outline-none focus:ring-2 focus:ring-primary text-left disabled:opacity-50"
                  >
                    <option value="current">Moja lokalizacja</option>
                    <option value="center">Środek widoku mapy</option>
                  </select>
                  <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-inactive">arrow_drop_down</span>
                </div>
              </div>

              <div className="w-full">
                <label className="block text-sm text-inactive mb-2">Zasięg od środka (+km):</label>
                <div className="relative">
                  <select 
                    value={downloadRange}
                    onChange={(e) => setDownloadRange(Number(e.target.value))}
                    disabled={isDownloading}
                    className="w-full bg-[#1a1b1e] text-text-main rounded-xl p-4 appearance-none focus:outline-none focus:ring-2 focus:ring-primary text-left disabled:opacity-50"
                  >
                    <option value={1}>+ 1 km</option>
                    <option value={5}>+ 5 km</option>
                    <option value={10}>+ 10 km</option>
                    <option value={20}>+ 20 km</option>
                  </select>
                  <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-inactive">arrow_drop_down</span>
                </div>
              </div>

              <div className="w-full flex items-center justify-between p-2 bg-[#1a1b1e] rounded-xl">
                <span className="text-sm text-inactive">Tylko dane offline</span>
                <button 
                  onClick={() => toggleOfflineOnly(!isOfflineOnly)}
                  className={`w-12 h-6 rounded-full transition-colors relative ${isOfflineOnly ? 'bg-primary' : 'bg-gray-700'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${isOfflineOnly ? 'right-1' : 'left-1'}`}></div>
                </button>
              </div>

              {isMapDownloaded && (
                <button 
                  onClick={handleClearCache}
                  disabled={isDownloading}
                  className="w-full py-2 text-sm font-semibold bg-danger/20 text-danger rounded-xl hover:bg-danger/30 transition-colors disabled:opacity-50"
                >
                  Usuń pobrane dane
                </button>
              )}
            </div>

            {isDownloading && (
              <div className="w-full mb-6">
                <div className="flex justify-between text-xs text-inactive mb-1">
                  <span>Pobieranie...</span>
                  <span>{downloadProgress}%</span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
                  <div className="bg-primary h-2 transition-all duration-300" style={{ width: `${downloadProgress}%` }}></div>
                </div>
              </div>
            )}

            <div className="flex gap-3 w-full">
              <button 
                onClick={() => setShowDownloadPopup(false)}
                disabled={isDownloading}
                className="flex-1 py-3 rounded-xl font-semibold bg-gray-800 text-white disabled:opacity-50"
              >
                Anuluj
              </button>
              <button 
                onClick={handleDownloadMap}
                disabled={isDownloading}
                className="flex-1 py-3 rounded-xl font-semibold bg-primary text-bg-main disabled:opacity-50 flex justify-center items-center gap-2"
              >
                {isDownloading ? <span className="material-symbols-outlined animate-spin text-[20px]">refresh</span> : 'Pobierz'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 w-full h-full relative">
        <Map
          key={mapReloadKey}
          ref={mapRef}
          initialViewState={{
            longitude: mapCenter[1],
            latitude: mapCenter[0],
            zoom: mapZoom
          }}
          minZoom={0}
          maxZoom={22}
          style={{ width: '100%', height: '100%' }}
          mapStyle={osmStyle as any}
          interactive={true}
          attributionControl={false}
          onMove={(e) => {
            setBearing(e.viewState.bearing);
          }}
          onMoveStart={(e) => {
            if (e.originalEvent) {
              setIsLocked(false);
            }
          }}
        >
          {currentPos && (
            <Marker longitude={currentPos[1]} latitude={currentPos[0]}>
              <div style={{ backgroundColor: '#4285f4', width: '16px', height: '16px', borderRadius: '50%', border: '3px solid white', boxShadow: '0 0 10px rgba(66, 133, 244, 0.8)' }}></div>
            </Marker>
          )}
        </Map>

        <div className="absolute bottom-6 left-4 z-[1000] pointer-events-auto flex flex-col gap-2">
          <button 
            onClick={() => setShowDownloadPopup(true)}
            className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg ${isMapDownloaded ? 'bg-[#2f3033] text-primary' : 'bg-[#2f3033] text-[#e8eaed]'}`}
            title="Pobierz mapę offline"
          >
            <MdDownload size={28} />
          </button>
          <button 
            onClick={() => {
              if (mapRef.current) {
                mapRef.current.flyTo({
                  bearing: 0,
                  animate: true,
                  duration: 1000
                });
              }
            }}
            className={`w-12 h-12 rounded-full flex items-center justify-center bg-[#2f3033] shadow-lg ${bearing === 0 ? 'text-primary' : 'text-[#e8eaed]'}`}
            title="Resetuj orientację"
          >
            <div style={{ transform: `rotate(${-bearing}deg)` }}>
              <MdCompassCalibration size={28} />
            </div>
          </button>
          <button 
            onClick={handleResetView}
            className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg ${isLocked ? 'bg-[#2f3033] text-primary' : 'bg-[#2f3033] text-[#e8eaed]'}`}
            title="Resetuj widok"
          >
            <MdMyLocation size={28} />
          </button>
        </div>
        <CustomAttribution />
      </div>
    </div>
  );
}

