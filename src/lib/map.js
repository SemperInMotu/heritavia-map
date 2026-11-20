import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import Delaunator from "delaunator";

export function start() {
  let frameId = 0;
  let disposed = false;
  const realAdd = EventTarget.prototype.addEventListener;
  const realRemove = EventTarget.prototype.removeEventListener;
  const attached = [];
  EventTarget.prototype.addEventListener = function (type, fn, opts) {
    attached.push([this, type, fn, opts]);
    return realAdd.call(this, type, fn, opts);
  };


const KINDS = [
  ["orthodox", "Церковь", "#c4554a"],
  ["catholic", "Костёл", "#3d6cb5"],
  ["attached", "Приписная", "#c9862a"],
  ["old", "Старообрядческая", "#7a5a8a"],
  ["jewish", "Синагога", "#2f7d6d"],
  ["protestant", "Кирха", "#3f6b4e"],
  ["muslim", "Мечеть", "#1f7a4d"],
  ["other", "Иное", "#8a8178"],
  ["cemetery", "Кладбище", "#8a8175"],
  ["revision", "Деревня РС", "#7d9a72"],
  ["estate", "Имение", "#e0b15a"],
  ["archive", "Архив", "#c6a15b"],
];

const PARISH = new Set(["orthodox", "catholic", "attached", "old", "jewish", "protestant", "muslim", "other"]);
const MAP_ONLY = new Set(["cemetery", "revision", "estate"]);

const KIND = Object.fromEntries(KINDS.map(([id, label, color]) => [id, { label, color }]));

const canvas = document.getElementById("view");
const loading = document.getElementById("loading");
const listEl = document.getElementById("list");
const listMeta = document.getElementById("list-meta");
const cardEl = document.getElementById("card");
const countsEl = document.getElementById("counts");
const exagInput = document.getElementById("exag");

const state = {
  q: "",
  kinds: new Set(KINDS.map(([id]) => id).filter((id) => id !== "cemetery")),
  selected: null,
};

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x14110e, 1);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x14110e, 900, 2200);
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.5, 5000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.49;
controls.rotateSpeed = 0.55;

scene.add(new THREE.HemisphereLight(0xf4efe4, 0x3d4a32, 1.15));
const sun = new THREE.DirectionalLight(0xfff4e0, 1.35);
sun.position.set(-180, 420, 220);
scene.add(sun);
const fill = new THREE.DirectionalLight(0xc5d4e8, 0.35);
fill.position.set(260, 180, -300);
scene.add(fill);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let land;
let places = [];
let surface;
let skirt;
let pinMesh;
const citySprites = [];
let pinIndex = [];
let home = { pos: new THREE.Vector3(), target: new THREE.Vector3() };

function project(lon, lat, elev, exag) {
  const x = (lon - land.lon0) * land.kmLon;
  const z = -(lat - land.lat0) * land.kmLat;
  const y = Math.max(0, elev - land.base) * exag;
  return [x, y, z];
}

function pip(x, y, ring) {
  let inside = false;
  let j = ring.length - 1;
  for (let i = 0; i < ring.length; i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    if ((yi > y) !== (yj > y)) {
      const xcross = ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-15) + xi;
      if (x < xcross) inside = !inside;
    }
    j = i;
  }
  return inside;
}

function inCountry(lon, lat) {
  return land.rings.some((idxs) => pip(lon, lat, idxs.map((i) => land.samples[i])));
}

function ramp(elev) {
  const t = THREE.MathUtils.clamp((elev - 105) / 230, 0, 1);
  const low = new THREE.Color("#3f5c38");
  const mid = new THREE.Color("#a39862");
  const high = new THREE.Color("#f3ecdf");
  if (t < 0.55) return low.lerp(mid, t / 0.55);
  return mid.lerp(high, (t - 0.55) / 0.45);
}

function buildLand(exag) {
  if (surface) scene.remove(surface);
  if (skirt) scene.remove(skirt);
  const samples = land.samples;
  const coords = new Float64Array(samples.length * 2);
  const positions = new Float32Array(samples.length * 3);
  const colors = new Float32Array(samples.length * 3);
  samples.forEach((s, i) => {
    const [x, y, z] = project(s[0], s[1], s[2], exag);
    coords[i * 2] = x;
    coords[i * 2 + 1] = z;
    positions.set([x, y, z], i * 3);
    ramp(s[2]).toArray(colors, i * 3);
  });

  const delaunay = new Delaunator(coords);
  const tris = [];
  for (let t = 0; t < delaunay.triangles.length; t += 3) {
    const a = delaunay.triangles[t];
    const b = delaunay.triangles[t + 1];
    const c = delaunay.triangles[t + 2];
    const lon = (samples[a][0] + samples[b][0] + samples[c][0]) / 3;
    const lat = (samples[a][1] + samples[b][1] + samples[c][1]) / 3;
    if (inCountry(lon, lat)) tris.push(a, b, c);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setIndex(tris);
  geo.computeVertexNormals();
  surface = new THREE.Mesh(
    geo,
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
  );
  scene.add(surface);
  buildSkirt(exag);
}

function buildSkirt(exag) {
  if (skirt) {
    scene.remove(skirt);
    skirt.geometry.dispose();
  }
  const samples = land.samples;
  const skirtPos = [];
  const depth = -18;
  land.rings.forEach((ring) => {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const pa = project(samples[a][0], samples[a][1], samples[a][2], exag);
      const pb = project(samples[b][0], samples[b][1], samples[b][2], exag);
      skirtPos.push(
        pa[0], pa[1], pa[2], pb[0], pb[1], pb[2], pa[0], depth, pa[2],
        pb[0], pb[1], pb[2], pb[0], depth, pb[2], pa[0], depth, pa[2]
      );
    }
  });
  const skirtGeo = new THREE.BufferGeometry();
  skirtGeo.setAttribute("position", new THREE.Float32BufferAttribute(skirtPos, 3));
  skirtGeo.computeVertexNormals();
  skirt = new THREE.Mesh(
    skirtGeo,
    new THREE.MeshLambertMaterial({ color: 0x2c261f, flatShading: true })
  );
  scene.add(skirt);
}

function applyExag() {
  const exag = currentExag();
  const pos = surface.geometry.attributes.position;
  land.samples.forEach((sample, i) => {
    pos.setY(i, Math.max(0, sample[2] - land.base) * exag);
  });
  pos.needsUpdate = true;
  surface.geometry.computeVertexNormals();
  buildSkirt(exag);
  movePins();
  citySprites.forEach((sprite) => {
    const city = sprite.userData.city;
    const [x, y, z] = project(city.lon, city.lat, city.elev, exag);
    sprite.position.set(x, y + 14, z);
  });
}

function frame() {
  const box = new THREE.Box3().setFromObject(surface);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  home.target.copy(center);
  home.pos.set(center.x, Math.max(180, size.z * 1.05), center.z + size.z * 0.58);
  camera.position.copy(home.pos);
  controls.target.copy(home.target);
  controls.update();
}

function visiblePlaces() {
  const q = state.q.trim().toLowerCase();
  return places.filter((p) => {
    if (!state.kinds.has(p.kind)) return false;
    if (!q) return true;
    const people = [...(p.owners || []).map((o) => o.name), ...(p.imenie || []).map((o) => o.name), ...(p.holding || []), ...(p.volost || []), ...(p.ciphers || [])];
    const blob = [p.name, p.place, p.settlement, p.selsoviet, p.faithLabel, p.near && p.near.name, ...people, ...(p.admin || []), JSON.stringify(p.timeline || [])].join(" ").toLowerCase();
    return blob.includes(q);
  });
}

function pinScale(place) {
  if (place.kind === "archive") return 3.2;
  if (place.kind === "cemetery") return 0.62;
  if (place.kind === "estate") return 1.15;
  if (place.kind === "revision") return 0.85;
  return 1.5;
}

function listPlaces() {
  const shown = visiblePlaces();
  const q = state.q.trim();
  const othersOn = [...state.kinds].some((id) => !MAP_ONLY.has(id));
  if (!q && othersOn) return shown.filter((p) => !MAP_ONLY.has(p.kind));
  return shown;
}

function buildPins() {
  if (pinMesh) {
    scene.remove(pinMesh);
    pinMesh.geometry.dispose();
    pinMesh.material.dispose();
  }
  const shown = visiblePlaces();
  pinIndex = shown;
  const geo = new THREE.SphereGeometry(1, 10, 8);
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  pinMesh = new THREE.InstancedMesh(geo, mat, Math.max(1, shown.length));
  pinMesh.count = shown.length;
  pinMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, shown.length) * 3), 3);
  const exag = currentExag();
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  shown.forEach((p, i) => {
    const [x, y, z] = project(p.lon, p.lat, p.elev, exag);
    const scale = pinScale(p);
    dummy.position.set(x, y + scale, z);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    pinMesh.setMatrixAt(i, dummy.matrix);
    color.set(KIND[p.kind]?.color || "#888888");
    pinMesh.setColorAt(i, color);
  });
  pinMesh.instanceMatrix.needsUpdate = true;
  if (pinMesh.instanceColor) pinMesh.instanceColor.needsUpdate = true;
  scene.add(pinMesh);
}

function currentExag() {
  return Number(exagInput.value) / 1000;
}

function movePins() {
  if (!pinMesh) return;
  const exag = currentExag();
  const dummy = new THREE.Object3D();
  pinIndex.forEach((p, i) => {
    const [x, y, z] = project(p.lon, p.lat, p.elev, exag);
    const scale = pinScale(p);
    dummy.position.set(x, y + scale, z);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    pinMesh.setMatrixAt(i, dummy.matrix);
  });
  pinMesh.instanceMatrix.needsUpdate = true;
}

function cityLabels() {
  land.cities.forEach((city) => {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 64;
    const g = c.getContext("2d");
    g.font = "600 32px Manrope, sans-serif";
    g.textAlign = "center";
    g.lineWidth = 6;
    g.strokeStyle = "rgba(20,16,12,0.7)";
    g.strokeText(city.name, 128, 42);
    g.fillStyle = "#f6f0e6";
    g.fillText(city.name, 128, 42);
    const mat = new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(c),
      transparent: true,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(mat);
    const [x, y, z] = project(city.lon, city.lat, city.elev, currentExag());
    sprite.position.set(x, y + 14, z);
    sprite.scale.set(16, 4, 1);
    sprite.userData.city = city;
    citySprites.push(sprite);
    scene.add(sprite);
  });
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

function radzima(id) {
  const parts = id.split("_");
  if (parts.length !== 2) return "";
  return `https://radzima.net/ru/${encodeURIComponent(parts[1])}/${encodeURIComponent(parts[0])}.html`;
}

function photoBlock(place) {
  const photo = place.photo;
  if (!photo) {
    if (!PARISH.has(place.kind)) return "";
    return `<p class="miss">Снимка Wikimedia, который можно честно поставить на этот приход, нет.</p>`;
  }
  const credit = [photo.license || "лицензия на странице файла", photo.author].filter(Boolean).join(", ");
  return `<figure class="shot">
    <img src="${esc(photo.thumb)}" alt="${esc(photo.title || place.name)}">
    <figcaption>${esc(photo.note || "")} ${esc(credit)}. <a href="${esc(photo.page)}" target="_blank" rel="noreferrer">Файл на Commons</a></figcaption>
  </figure>`;
}

function cemeteryBlock(place) {
  if (!PARISH.has(place.kind)) return "";
  const rows = place.cemeteries || [];
  if (!rows.length) return `<p class="miss">Кладбищ OpenStreetMap ближе 2 км нет.</p>`;
  const buttons = rows.map((row) => `<button type="button" data-jump="${esc(row.id)}">${esc(row.name)} · ${row.m} м</button>`).join("");
  return `<div class="near"><b>Кладбища рядом</b><small>OpenStreetMap, по прямой от прихода. Близость не значит, что кладбище приходское.</small>${buttons}</div>`;
}

function revisionBlock(place) {
  if (place.kind !== "estate" && place.kind !== "revision") return "";
  const span = (place.years || []).join("–");
  const owners = (place.owners || []).map((row) => {
    const years = (row.years || []).join(", ");
    return `<li>${esc(row.name)}${years ? ` <small>${esc(years)}</small>` : ""}</li>`;
  }).join("");
  const imenie = (place.imenie || []).map((row) => {
    const years = (row.years || []).join(", ");
    return `<li>${esc(row.name)}${years ? ` <small>${esc(years)}</small>` : ""}</li>`;
  }).join("");
  const holding = (place.holding || []).join(" · ");
  const volost = (place.volost || []).join(" · ");
  const ciphers = (place.ciphers || []).join(" · ");
  return `<div class="near">
    <b>Ревизские сказки</b>
    <small>${esc(place.geoNote || "")}. Записей в индексе: ${place.records || 0}${span ? `, ${esc(span)}` : ""}. Это не межа имения.</small>
    ${volost ? `<p>Волость: ${esc(volost)}</p>` : ""}
    ${holding ? `<p>Владение: ${esc(holding)}</p>` : ""}
    ${imenie ? `<b>Имение</b><ul>${imenie}</ul>` : ""}
    ${owners ? `<b>Владельцы</b><ul>${owners}</ul>` : "<p>Владелец в индексе не указан.</p>"}
    ${ciphers ? `<p>Шифр: ${esc(ciphers)}</p>` : ""}
  </div>`;
}

function renderCard(place) {
  if (!place) {
    cardEl.hidden = true;
    cardEl.innerHTML = "";
    return;
  }
  const kind = KIND[place.kind] || KIND.other;
  const where = [place.settlement, place.place].filter(Boolean).join(" ");
  const links = [];
  if (PARISH.has(place.kind)) {
    links.push(`<a href="https://shappoff.github.io/prikhody/p/${encodeURIComponent(place.id)}" target="_blank" rel="noreferrer">Приход у Шаппо</a>`);
    const rad = radzima(place.id);
    if (rad) links.push(`<a href="${rad}" target="_blank" rel="noreferrer">radzima.net</a>`);
  }
  if (place.osmUrl) links.push(`<a href="${esc(place.osmUrl)}" target="_blank" rel="noreferrer">Объект OSM</a>`);
  const osm = `https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lon}#map=16/${place.lat}/${place.lon}`;
  links.push(`<a href="${osm}" target="_blank" rel="noreferrer">На карте</a>`);
  const timeline = (place.timeline || []).map((period) => {
    const rows = (period.items || []).map((row) => {
      const value = (row.values || []).join(" · ");
      const shown = value || "не найдено";
      const note = row.note ? `<small>${esc(row.note)}</small>` : "";
      return `<div class="level"><i>${esc(row.level)}</i><span class="${value ? "" : "miss"}">${esc(shown)}${note}</span></div>`;
    }).join("");
    const note = period.note ? `<small>${esc(period.note)}</small>` : "";
    return `<section class="period"><b>${esc(period.title)}</b><em>${esc(period.span || "")}</em>${note}${rows}</section>`;
  }).join("");
  cardEl.hidden = false;
  cardEl.innerHTML = `
    <button class="close" type="button" id="close-card">Закрыть</button>
    <p class="kind">${esc(kind.label)}</p>
    <h2>${esc(place.name)}</h2>
    <p>${esc(where)}</p>
    ${place.kind === "archive" ? "<p>Архив, куда заказывают дела. Это не приход.</p>" : ""}
    ${place.kind === "cemetery" ? "<p>Координата OpenStreetMap. Это не приход и не опись захоронений.</p>" : ""}
    ${revisionBlock(place)}
    ${photoBlock(place)}
    ${timeline ? `<div class="tl">${timeline}</div>` : ""}
    ${cemeteryBlock(place)}
    ${place.near ? `<div class="near"><b>Ближайший приход</b><small>по прямой ${place.near.m} м, принадлежность не установлена</small><button type="button" data-jump="${esc(place.near.id)}">${esc(place.near.name)}</button></div>` : ""}
    <div class="links">${links.join("")}</div>
  `;
  document.getElementById("close-card").onclick = () => select(null);
  cardEl.querySelectorAll("[data-jump]").forEach((button) => {
    button.onclick = () => {
      const next = places.find((item) => item.id === button.dataset.jump);
      if (next) select(next);
    };
  });
}

function focusPlace(place) {
  const [x, y, z] = project(place.lon, place.lat, place.elev, currentExag());
  controls.target.set(x, y, z);
  camera.position.set(x + 50, y + 130, z + 190);
}

function select(place) {
  if (place && !state.kinds.has(place.kind)) {
    state.kinds.add(place.kind);
    const button = document.querySelector(`[data-kind="${place.kind}"]`);
    if (button) button.classList.add("on");
    buildPins();
  }
  state.selected = place ? place.id : null;
  renderCard(place);
  renderList();
  if (place) focusPlace(place);
}

function renderList() {
  const shown = listPlaces().sort((a, b) => {
    if (a.kind === "archive" && b.kind !== "archive") return -1;
    if (b.kind === "archive" && a.kind !== "archive") return 1;
    return a.place.localeCompare(b.place, "ru") || a.name.localeCompare(b.name, "ru");
  });
  const cap = 120;
  listMeta.textContent = shown.length > cap
    ? `${shown.length} на макете, в списке первые ${cap}`
    : `${shown.length} на макете`;
  listEl.innerHTML = shown.slice(0, cap).map((p) => {
    const color = KIND[p.kind]?.color || "#888";
    let extra = p.selsoviet || "сельсовет не сопоставлен";
    if (p.kind === "archive") extra = "архив";
    else if (p.kind === "cemetery") extra = p.near ? `до прихода ${p.near.m} м` : "OSM";
    else if (p.kind === "estate" || p.kind === "revision") {
      const owner = p.owners && p.owners[0] ? p.owners[0].name : "";
      extra = [p.settlement, owner].filter(Boolean).join(" · ") || "ревизская сказка";
    }
    else if (p.photo) extra += " · снимок";
    return `<button class="row${p.id === state.selected ? " active" : ""}" data-id="${esc(p.id)}">
      <i class="swatch" style="background:${color}"></i>
      <div><b>${esc(p.place || p.name)}</b><span>${esc(p.name)}</span></div>
      <em>${esc(extra)}</em>
    </button>`;
  }).join("");
}

function renderCounts() {
  const bits = KINDS.map(([id, label]) => {
    const n = places.filter((p) => p.kind === id).length;
    return n ? `${label.toLowerCase()} ${n}` : "";
  }).filter(Boolean);
  countsEl.textContent = bits.join(" · ");
}

function wireUi() {
  const kinds = document.getElementById("kinds");
  kinds.innerHTML = KINDS.map(([id, label, color]) => {
    const n = places.filter((p) => p.kind === id).length;
    if (!n) return "";
    const on = state.kinds.has(id) ? " on" : "";
    return `<button type="button" class="${on}" data-kind="${id}"><i class="swatch" style="background:${color}"></i>${label} ${n}</button>`;
  }).join("");
  kinds.addEventListener("click", (event) => {
    const button = event.target.closest("[data-kind]");
    if (!button) return;
    const id = button.dataset.kind;
    if (state.kinds.has(id)) state.kinds.delete(id);
    else state.kinds.add(id);
    button.classList.toggle("on", state.kinds.has(id));
    buildPins();
    renderList();
  });
  let timer = 0;
  document.getElementById("q").addEventListener("input", (event) => {
    state.q = event.target.value;
    clearTimeout(timer);
    timer = setTimeout(() => {
      buildPins();
      renderList();
    }, 120);
  });
  listEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-id]");
    if (!button) return;
    const place = places.find((p) => p.id === button.dataset.id);
    select(place);
  });
  document.getElementById("reset").onclick = () => {
    camera.position.copy(home.pos);
    controls.target.copy(home.target);
    select(null);
  };
  exagInput.addEventListener("input", applyExag);
  addEventListener("keydown", (event) => {
    if (event.key === "Escape") select(null);
  });
  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
}

function pointerOf(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

canvas.addEventListener("pointerdown", (event) => {
  pointerOf(event);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObject(pinMesh);
  if (!hits.length || hits[0].instanceId == null) return;
  select(pinIndex[hits[0].instanceId]);
});

function tick() {
  if (disposed) return;
  frameId = requestAnimationFrame(tick);
  controls.update();
  renderer.render(scene, camera);
}

async function main() {
  const [landRes, placesRes] = await Promise.all([
    fetch("/data/land.json"),
    fetch("/data/places.json"),
  ]);
  if (!landRes.ok || !placesRes.ok) throw new Error("нет data/land.json или data/places.json — сначала python build.py");
  land = await landRes.json();
  places = (await placesRes.json()).places;
  if (disposed) return;
  await document.fonts.ready;
  if (disposed) return;
  exagInput.value = String(Math.round(land.exag * 1000));
  buildLand(currentExag());
  buildPins();
  cityLabels();
  frame();
  renderCounts();
  wireUi();
  renderList();
  loading.remove();
  tick();
}

main().catch((error) => {
  loading.textContent = error.message || String(error);
  console.error(error);
});

  return () => {
    disposed = true;
    cancelAnimationFrame(frameId);
    EventTarget.prototype.addEventListener = realAdd;
    attached.forEach(([el, type, fn, opts]) => realRemove.call(el, type, fn, opts));
    controls.dispose();
    renderer.dispose();
  };
}
