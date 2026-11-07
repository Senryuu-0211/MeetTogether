export type LatLng = { lat: number; lng: number };
export type Mode = 'total' | 'fair';

const EARTH_RADIUS_M = 6371000;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Khoảng cách đường chim bay (mét). */
export function haversine(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Thời gian đi xe máy trong phố HCM theo quãng đường, tốc độ trung bình ~22 km/h. */
export function estimateSeconds(meters: number): number {
  return meters / (22000 / 3600);
}

/**
 * Xếp hạng theo chi phí của từng người (thời gian hoặc khoảng cách).
 * - total: tổng nhỏ nhất, hoà thì xét người đi xa nhất.
 * - fair:  mọi người đi gần bằng nhau. Điểm = trung bình + (max − min):
 *          phạt chênh lệch, nhưng vẫn tính trung bình để không chọn chỗ xa mà ai cũng đi lâu như nhau.
 */
export function rank<T extends { times: number[] }>(items: T[], mode: Mode): T[] {
  const key = (t: number[]) => {
    const sum = t.reduce((a, b) => a + b, 0);
    const max = Math.max(...t);
    return mode === 'total' ? [sum, max] : [sum / t.length + max - Math.min(...t), max];
  };
  return items
    .map((item) => ({ item, k: key(item.times) }))
    .sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1])
    .map((x) => x.item);
}

/**
 * Vòng lọc trước khi tính đường thật: n quán tốt nhất theo đường chim bay, xét toàn bộ dữ liệu.
 * Không giới hạn quanh một "điểm giữa", vì điểm tối ưu của chế độ fair có thể nằm xa điểm đó.
 */
export function shortlist<T extends LatLng>(places: T[], people: LatLng[], mode: Mode, n: number): T[] {
  return rank(
    places.map((place) => ({ place, times: people.map((u) => haversine(u, place)) })),
    mode,
  )
    .slice(0, n)
    .map((x) => x.place);
}
