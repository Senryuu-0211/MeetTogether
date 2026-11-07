import type { LatLng } from './geo';

export type Place = LatLng & { name: string; kind: string; address: string };
export type Found = LatLng & { label: string };

// Vùng TP.HCM (minLng, minLat, maxLng, maxLat). Photon dùng để giới hạn kết quả tìm địa chỉ.
const HCM_BBOX = '106.35,10.35,107.05,11.2';
const HCM_CENTER = { lat: 10.7769, lng: 106.7009 };

type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: Record<string, string | undefined>;
};

function photonLabel(p: PhotonFeature['properties']): string {
  const street = [p.housenumber, p.street].filter(Boolean).join(' ');
  return [p.name, street, p.district].filter(Boolean).join(', ') || 'Điểm không tên';
}

/** Tìm địa chỉ trong TP.HCM (Photon / OSM). */
export async function geocode(q: string): Promise<Found[]> {
  const params = new URLSearchParams({ q, limit: '6', bbox: HCM_BBOX, lat: `${HCM_CENTER.lat}`, lon: `${HCM_CENTER.lng}` });
  const res = await fetch(`https://photon.komoot.io/api/?${params}`, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error('Không tìm được địa chỉ, thử lại sau.');
  const data: { features: PhotonFeature[] } = await res.json();
  return data.features.map((f) => ({
    lng: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
    label: photonLabel(f.properties),
  }));
}

/** Đặt tên cho một điểm bấm trên bản đồ. */
export async function reverseGeocode(p: LatLng): Promise<string | null> {
  const res = await fetch(`https://photon.komoot.io/reverse?lat=${p.lat}&lon=${p.lng}`, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) return null;
  const data: { features: PhotonFeature[] } = await res.json();
  return data.features[0] ? photonLabel(data.features[0].properties) : null;
}

// Dữ liệu quán tải sẵn bằng `npm run update-places` (Overpass công khai quá chậm để gọi lúc runtime).
let allPlaces: Promise<Place[]> | null = null;

function loadPlaces(): Promise<Place[]> {
  allPlaces ??= fetch(`${import.meta.env.BASE_URL}places-hcm.json`)
    .then((res) => {
      if (!res.ok) throw new Error();
      return res.json() as Promise<[number, number, string, string, string][]>;
    })
    .then((rows) => rows.map(([lat, lng, name, kind, address]) => ({ lat, lng, name, kind, address })))
    .catch(() => {
      allPlaces = null; // cho phép thử lại
      throw new Error('Không tải được dữ liệu quán, thử lại.');
    });
  return allPlaces;
}

/** Mọi quán thuộc loại `kinds`. */
export async function findPlaces(kinds: string[]): Promise<Place[]> {
  return (await loadPlaces()).filter((p) => kinds.includes(p.kind));
}

/**
 * Quãng đường đi thật (mét) từ mỗi người tới mỗi quán, qua OSRM.
 * Kết quả: [quán][người]. Ô null = OSRM không tìm được đường.
 * Chỉ lấy quãng đường: thời gian của OSRM tính theo ô tô (~48 km/h), quá nhanh so với xe máy ở HCM.
 */
export async function roadDistances(people: LatLng[], places: LatLng[]): Promise<(number | null)[][]> {
  const coords = [...people, ...places].map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
  const sources = people.map((_, i) => i).join(';');
  const destinations = places.map((_, i) => i + people.length).join(';');
  const url = `https://router.project-osrm.org/table/v1/driving/${coords}?sources=${sources}&destinations=${destinations}&annotations=distance`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  const data: { distances: (number | null)[][] } = await res.json();
  return places.map((_, j) => people.map((_, i) => data.distances[i][j]));
}
