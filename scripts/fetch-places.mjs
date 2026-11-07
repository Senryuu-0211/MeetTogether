// Tải toàn bộ quán cafe / ăn uống trong vùng TP.HCM từ Overpass, ghi ra public/places-hcm.json.
// Chạy lại khi muốn cập nhật dữ liệu: npm run update-places
// Định dạng mỗi phần tử: [lat, lng, tên, loại, địa chỉ]
import { writeFileSync } from 'node:fs';

const BBOX = '10.35,106.35,11.2,107.05'; // nam, tây, bắc, đông
const query = `[out:json][timeout:300];
nwr["amenity"~"^(cafe|restaurant|fast_food|food_court)$"]["name"](${BBOX});
out center tags qt;`;

// Overpass công khai hay quá tải (429/504) → thử lại vài lần, nghỉ 2 phút giữa các lần.
async function download() {
  for (let attempt = 1; ; attempt++) {
    console.log(`Đang tải từ Overpass, lần ${attempt} (có thể mất vài phút)…`);
    try {
      const res = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: new URLSearchParams({ data: query }),
        headers: { 'User-Agent': 'MeetTogether/0.1 (places data refresh)' },
        signal: AbortSignal.timeout(400_000),
      });
      if (res.ok) return res.json();
      console.log(`Overpass trả ${res.status}`);
    } catch (e) {
      console.log(`Lỗi: ${e.message}`);
    }
    if (attempt === 5) throw new Error('Overpass không phản hồi, thử lại sau.');
    await new Promise((r) => setTimeout(r, 120_000));
  }
}
const { elements } = await download();

const round = (x) => Math.round(x * 1e5) / 1e5;
const places = elements.map((e) => [
  round(e.lat ?? e.center.lat),
  round(e.lon ?? e.center.lon),
  e.tags.name,
  e.tags.amenity,
  [e.tags['addr:housenumber'], e.tags['addr:street']].filter(Boolean).join(' '),
]);

writeFileSync(new URL('../public/places-hcm.json', import.meta.url), JSON.stringify(places));
const count = (k) => places.filter((p) => p[3] === k).length;
console.log(`Đã ghi ${places.length} quán: cafe ${count('cafe')}, restaurant ${count('restaurant')}, fast_food ${count('fast_food')}, food_court ${count('food_court')}`);
