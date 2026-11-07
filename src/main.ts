import 'leaflet/dist/leaflet.css';
import './style.css';
import L from 'leaflet';
import { estimateSeconds, haversine, rank, shortlist, type LatLng, type Mode } from './geo';
import { findPlaces, geocode, reverseGeocode, roadDistances, type Place } from './api';

type Person = LatLng & { label: string };
type Result = Place & { times: number[]; dists: number[] };

const COLORS = ['#2563eb', '#db2777', '#16a34a', '#9333ea', '#0891b2', '#ca8a04', '#dc2626', '#4f46e5'];
const KINDS: Record<string, string[]> = {
  cafe: ['cafe'],
  food: ['restaurant', 'fast_food', 'food_court'],
  both: ['cafe', 'restaurant', 'fast_food', 'food_court'],
};
const KIND_LABEL: Record<string, string> = { cafe: 'Cafe', restaurant: 'Nhà hàng', fast_food: 'Đồ ăn nhanh', food_court: 'Khu ẩm thực' };
const MODE_HINT: Record<Mode, string> = {
  total: 'Cả nhóm cộng lại đi ít đường nhất.',
  fair: 'Mọi người đi gần bằng nhau, không ai phải đi quá xa.',
};
const ROUTED_CANDIDATES = 40; // số quán tốt nhất (đường chim bay) đem đi tính đường thật
const SHOWN_RESULTS = 8;

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const color = (i: number) => COLORS[i % COLORS.length];
const minutes = (s: number) => `${Math.max(1, Math.round(s / 60))} phút`;
const km = (m: number) => `${(m / 1000).toFixed(1)} km`;
const radioValue = (name: string) => ($(`input[name="${name}"]:checked`) as HTMLInputElement).value;

// ---------- Bản đồ ----------
const map = L.map('map', { zoomControl: false }).setView([10.7769, 106.7009], 13);
L.control.zoom({ position: 'bottomright' }).addTo(map);
// Tile OSM France: miễn phí, không cần key. (CARTO đã bắt API key; tile.openstreetmap.org bị chặn DNS ở mạng dev.)
L.tileLayer('https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://www.openstreetmap.fr">OSM France</a>',
  subdomains: 'abc',
  maxZoom: 19,
}).addTo(map);
const peopleLayer = L.layerGroup().addTo(map);
const resultLayer = L.layerGroup().addTo(map);

const personIcon = (i: number) =>
  L.divIcon({ className: '', html: `<div class="pin" style="--c:${color(i)}"><b>${i + 1}</b></div>`, iconSize: [28, 28], iconAnchor: [14, 32] });
const placeIcon = (i: number, active: boolean) =>
  L.divIcon({ className: '', html: `<div class="place-pin${active ? ' active' : ''}">${i + 1}</div>`, iconSize: active ? [30, 30] : [22, 22] });

// ---------- Trạng thái ----------
const people: Person[] = [];
let results: Result[] = [];

function setStatus(msg: string, error = false) {
  const el = $('#status');
  el.textContent = msg;
  el.classList.toggle('error', error);
}

function clearResults() {
  results = [];
  resultLayer.clearLayers();
  $('#results').innerHTML = '';
  setStatus('');
}

function renderPeople() {
  $('#people').innerHTML = people
    .map(
      (p, i) => `<li class="person">
        <span class="dot" style="--c:${color(i)}">${i + 1}</span>
        <span class="label" title="${esc(p.label)}">${esc(p.label)}</span>
        <button class="remove" data-i="${i}" aria-label="Xoá">×</button>
      </li>`,
    )
    .join('');
  peopleLayer.clearLayers();
  people.forEach((p, i) => L.marker([p.lat, p.lng], { icon: personIcon(i) }).bindTooltip(p.label).addTo(peopleLayer));
  ($('#find') as HTMLButtonElement).disabled = people.length < 2;
}

function addPerson(p: LatLng, label: string): Person {
  const person = { lat: p.lat, lng: p.lng, label };
  people.push(person);
  clearResults();
  renderPeople();
  if (people.length > 1) map.fitBounds(L.latLngBounds(people.map((x) => [x.lat, x.lng])), { padding: [60, 60] });
  else map.setView([p.lat, p.lng], 15);
  return person;
}

/** Điểm thêm bằng toạ độ: gán nhãn tạm, rồi thay bằng địa chỉ khi tra được. */
async function addPointAndName(p: LatLng, tempLabel: string) {
  const person = addPerson(p, tempLabel);
  const name = await reverseGeocode(p).catch(() => null);
  if (name && people.includes(person)) {
    person.label = name;
    renderPeople();
  }
}

// ---------- Thêm người ----------
$('#search-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('#q') as HTMLInputElement;
  const q = input.value.trim();
  if (!q) return;
  const box = $('#suggestions');
  box.innerHTML = '<li class="msg">Đang tìm…</li>';
  try {
    const found = await geocode(q);
    if (!found.length) {
      box.innerHTML = '<li class="msg">Không thấy địa chỉ trong TP.HCM. Thử tên đường + phường, hoặc bấm lên bản đồ.</li>';
      return;
    }
    box.innerHTML = found.map((f, i) => `<li><button data-i="${i}">${esc(f.label)}</button></li>`).join('');
    box.onclick = (ev) => {
      const btn = (ev.target as HTMLElement).closest('button');
      if (!btn) return;
      const f = found[Number(btn.dataset.i)];
      addPerson(f, f.label);
      box.innerHTML = '';
      input.value = '';
    };
  } catch {
    box.innerHTML = '<li class="msg">Lỗi kết nối khi tìm địa chỉ, thử lại.</li>';
  }
});

$('#locate').addEventListener('click', () => {
  if (!navigator.geolocation) return setStatus('Trình duyệt không hỗ trợ định vị.', true);
  navigator.geolocation.getCurrentPosition(
    (pos) => addPointAndName({ lat: pos.coords.latitude, lng: pos.coords.longitude }, 'Vị trí của tôi'),
    () => setStatus('Không lấy được vị trí. Hãy cho phép truy cập vị trí hoặc nhập địa chỉ.', true),
    { enableHighAccuracy: true, timeout: 10000 },
  );
});

map.on('click', (e: L.LeafletMouseEvent) => addPointAndName({ lat: e.latlng.lat, lng: e.latlng.lng }, 'Điểm trên bản đồ'));

$('#people').addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('.remove') as HTMLElement | null;
  if (!btn) return;
  people.splice(Number(btn.dataset.i), 1);
  clearResults();
  renderPeople();
});

// ---------- Tuỳ chọn ----------
const updateModeHint = () => ($('#mode-hint').textContent = MODE_HINT[radioValue('mode') as Mode]);
updateModeHint();
document.querySelectorAll('input[name="kind"], input[name="mode"]').forEach((el) =>
  el.addEventListener('change', () => {
    updateModeHint();
    clearResults();
  }),
);

// ---------- Tìm điểm hẹn ----------
$('#find').addEventListener('click', async () => {
  const btn = $('#find') as HTMLButtonElement;
  const mode = radioValue('mode') as Mode;
  const kinds = KINDS[radioValue('kind')];
  btn.disabled = true;
  clearResults();
  try {
    setStatus('Đang tìm quán…');
    const places = await findPlaces(kinds);
    // Lọc bằng đường chim bay trước để giới hạn số quán phải tính đường thật.
    const candidates = shortlist(places, people, mode, ROUTED_CANDIDATES);

    setStatus('Đang tính thời gian đi xe của từng người…');
    const matrix = await roadDistances(people, candidates).catch(() => null);
    const scored: Result[] = candidates.map((p, j) => {
      // Không có đường thật thì lấy đường chim bay × 1.4 (hệ số vòng vèo trong phố).
      const dists = people.map((u, i) => matrix?.[j][i] ?? haversine(u, p) * 1.4);
      return { ...p, dists, times: dists.map(estimateSeconds) };
    });
    results = rank(scored, mode).slice(0, SHOWN_RESULTS);

    setStatus(
      matrix
        ? `Đã so ${candidates.length} quán phù hợp nhất. Thời gian là ước tính, chưa tính kẹt xe.`
        : 'Không gọi được dịch vụ chỉ đường, đang ước lượng theo đường chim bay.',
    );
    renderResults();
    selectResult(0);
  } catch (err) {
    setStatus(err instanceof Error ? err.message : 'Có lỗi xảy ra, thử lại.', true);
  } finally {
    btn.disabled = people.length < 2;
  }
});

const resultMarkers: L.Marker[] = [];
const routeLines = L.layerGroup().addTo(resultLayer);

function renderResults() {
  $('#results').innerHTML = results
    .map((r, k) => {
      const total = r.times.reduce((a, b) => a + b, 0);
      const longest = Math.max(...r.times);
      const gmaps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${r.name} ${r.lat},${r.lng}`)}`;
      return `<li class="result" data-k="${k}">
        <span class="rank">${k + 1}</span>
        <div class="body">
          <div class="name">${esc(r.name)}</div>
          <div class="meta">${KIND_LABEL[r.kind] ?? r.kind}${r.address ? ` · ${esc(r.address)}` : ''}</div>
          <div class="chips">${r.times
            .map((t, i) => `<span class="chip" title="${esc(people[i].label)} · ${km(r.dists[i])}"><span class="dot" style="--c:${color(i)}">${i + 1}</span>${minutes(t)}</span>`)
            .join('')}</div>
          <div class="summary">Tổng <b>${minutes(total)}</b> · Lâu nhất <b>${minutes(longest)}</b> · Chênh lệch <b>${minutes(longest - Math.min(...r.times))}</b></div>
          <a href="${gmaps}" target="_blank" rel="noopener">Mở trên Google Maps ↗</a>
        </div>
      </li>`;
    })
    .join('');

  resultMarkers.length = 0;
  results.forEach((r, k) => {
    const m = L.marker([r.lat, r.lng], { icon: placeIcon(k, false), zIndexOffset: 500 }).bindTooltip(r.name).addTo(resultLayer);
    m.on('click', () => selectResult(k));
    resultMarkers.push(m);
  });
}

function selectResult(k: number) {
  const r = results[k];
  document.querySelectorAll('.result').forEach((el, i) => el.classList.toggle('active', i === k));
  resultMarkers.forEach((m, i) => {
    m.setIcon(placeIcon(i, i === k));
    m.setZIndexOffset(i === k ? 1000 : 500);
  });
  routeLines.clearLayers();
  people.forEach((p, i) =>
    L.polyline([[p.lat, p.lng], [r.lat, r.lng]], { color: color(i), weight: 2, opacity: 0.7, dashArray: '6 6', interactive: false }).addTo(routeLines),
  );
  map.fitBounds(L.latLngBounds([...people, r].map((x) => [x.lat, x.lng])), { padding: [60, 60] });
}

$('#results').addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('a')) return;
  const li = (e.target as HTMLElement).closest('.result') as HTMLElement | null;
  if (li) selectResult(Number(li.dataset.k));
});

renderPeople();
