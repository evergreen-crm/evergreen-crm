// The phone's location, once, when a button is tapped (never in the background).
export function getLocation() {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve({ loc: null, why: 'This phone or browser cannot share location.' });
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ loc: { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy } }),
      (e) => resolve({ loc: null, why: e.code === 1 ? 'Location is blocked. Allow location for this site in your phone settings, then try again.' : 'Could not get your location. Step outside or near a window and try again.' }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}
export const fmtDist = (m) => (m == null ? null : m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);
