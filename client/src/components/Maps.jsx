import { useEffect, useRef, useState } from 'react';
import { Crosshair, ExternalLink, MapPin } from 'lucide-react';
import { useConfig } from '../context/ConfigContext.jsx';
import { Button } from './ui/index.jsx';

const KIGALI = { lat: -1.9441, lng: 30.0619 };
let loader = null;

/** Loads the Google Maps JavaScript API once (only when a browser key is configured). */
export function loadGoogleMaps(key) {
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (!loader) {
    loader = new Promise((resolve, reject) => {
      const callback = `__rivoMaps${Date.now()}`;
      window[callback] = () => resolve(window.google.maps);
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&callback=${callback}`;
      script.async = true;
      script.onerror = () => {
        loader = null;
        reject(new Error('Google Maps failed to load'));
      };
      document.head.appendChild(script);
    });
  }
  return loader;
}

export const mapsLink = (lat, lng) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
export const directionsLink = (lat, lng) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

function useGoogleMaps() {
  const { googleMapsKey } = useConfig();
  const [maps, setMaps] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!googleMapsKey) return;
    loadGoogleMaps(googleMapsKey).then(setMaps, () => setFailed(true));
  }, [googleMapsKey]);
  return { maps, enabled: Boolean(googleMapsKey) && !failed };
}

/**
 * Lets the buyer pin their delivery location: tap the map, drag the pin or
 * use the phone's GPS. Without a Maps key, GPS still works.
 */
export function LocationPicker({ value, onChange }) {
  const { maps, enabled } = useGoogleMaps();
  const el = useRef(null);
  const marker = useRef(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!maps || !el.current) return;
    const center = value?.latitude ? { lat: value.latitude, lng: value.longitude } : KIGALI;
    const map = new maps.Map(el.current, { center, zoom: value?.latitude ? 16 : 13, streetViewControl: false, mapTypeControl: false, fullscreenControl: false });
    marker.current = new maps.Marker({ position: center, map, draggable: true });
    const update = (latLng) => onChange({ latitude: Number(latLng.lat().toFixed(6)), longitude: Number(latLng.lng().toFixed(6)) });
    marker.current.addListener('dragend', (e) => update(e.latLng));
    map.addListener('click', (e) => {
      marker.current.setPosition(e.latLng);
      update(e.latLng);
    });
    marker.current.__map = map;
  }, [maps]); // eslint-disable-line react-hooks/exhaustive-deps

  const locate = () => {
    if (!navigator.geolocation) return setError('Location is not available on this device.');
    setLocating(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { latitude: Number(pos.coords.latitude.toFixed(6)), longitude: Number(pos.coords.longitude.toFixed(6)) };
        onChange(next);
        if (marker.current) {
          const p = { lat: next.latitude, lng: next.longitude };
          marker.current.setPosition(p);
          marker.current.__map?.panTo(p);
          marker.current.__map?.setZoom(16);
        }
        setLocating(false);
      },
      () => {
        setError('We could not get your location. Check that location access is allowed.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  return (
    <div className="space-y-2">
      {enabled && <div ref={el} className="h-56 w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100" aria-label="Map: tap to set your delivery location" />}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" icon={Crosshair} onClick={locate} loading={locating}>
          Use my current location
        </Button>
        {value?.latitude ? (
          <a href={mapsLink(value.latitude, value.longitude)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-700 hover:underline">
            <MapPin className="size-3.5" /> Pinned: {value.latitude}, {value.longitude}
          </a>
        ) : (
          <span className="text-xs text-slate-500">{enabled ? 'Tap the map to pin your door.' : 'Optional: helps the courier find you.'}</span>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

/** Shows the destination and (when available) the courier's last position. */
export function TrackingMap({ destination, courier }) {
  const { maps, enabled } = useGoogleMaps();
  const el = useRef(null);
  const state = useRef({});

  useEffect(() => {
    if (!maps || !el.current) return;
    const dest = destination?.latitude ? { lat: destination.latitude, lng: destination.longitude } : KIGALI;
    if (!state.current.map) {
      state.current.map = new maps.Map(el.current, { center: dest, zoom: 14, streetViewControl: false, mapTypeControl: false });
      state.current.dest = new maps.Marker({ position: dest, map: state.current.map, title: 'Delivery address', label: { text: '⌂', color: '#fff' } });
    }
    if (courier?.latitude) {
      const pos = { lat: courier.latitude, lng: courier.longitude };
      if (!state.current.courier) {
        state.current.courier = new maps.Marker({
          position: pos,
          map: state.current.map,
          title: 'Courier',
          icon: { path: maps.SymbolPath.CIRCLE, scale: 9, fillColor: '#f2653a', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 },
        });
      } else state.current.courier.setPosition(pos);
      const bounds = new maps.LatLngBounds();
      bounds.extend(dest);
      bounds.extend(pos);
      state.current.map.fitBounds(bounds, 60);
    }
  }, [maps, destination, courier]);

  if (!enabled) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        {courier?.latitude ? (
          <p>
            Courier last seen at {courier.latitude.toFixed(4)}, {courier.longitude.toFixed(4)}.{' '}
            <a className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline" href={mapsLink(courier.latitude, courier.longitude)} target="_blank" rel="noreferrer">
              Open map <ExternalLink className="size-3.5" />
            </a>
          </p>
        ) : (
          <p>Live courier location will appear here once your package is on its way.</p>
        )}
      </div>
    );
  }
  return <div ref={el} className="h-64 w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100" aria-label="Delivery tracking map" />;
}
