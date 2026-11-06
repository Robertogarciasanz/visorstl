import * as THREE from 'three';
import { STLLoader } from './lib/STLLoader.js';
import { OrbitControls } from './lib/OrbitControls.js';

const $ = (s) => document.querySelector(s);
const datos = await (await fetch('datos.json')).json();
const G = datos.grupos;
const COLOR = { fijo: 0x3f8f52, direccion: 0x8a94a1, rueda_delantera: 0x2b2f36, rueda_trasera: 0x2b2f36, pedalier: 0xaab0b8, cadena: 0x6c727a };

// ---------- subir archivos (para el autor y para cualquier visitante) ----------
$('#subirBtn').onclick = () => { $('#subir').hidden = false; $('#sbEstado').textContent = ''; };
$('#sbNo').onclick = () => { $('#subir').hidden = true; };
$('#sbOk').onclick = () => {
  const f = $('#sbFile').files[0], est = $('#sbEstado');
  if (!f) { est.textContent = 'Elige un archivo.'; return; }
  if (!$('#sbLic').checked) { est.textContent = 'Marca la casilla de licencia libre para poder subirlo.'; return; }
  if (f.size > 24 * 1024 * 1024) { est.textContent = 'El archivo pesa más de 24 MB.'; return; }
  const x = new XMLHttpRequest();
  x.open('POST', '/api/subir');
  x.setRequestHeader('X-Nombre', encodeURIComponent(f.name)); x.setRequestHeader('X-Nota', encodeURIComponent($('#sbNota').value)); x.setRequestHeader('X-Autor', encodeURIComponent($('#sbAutor').value));
  x.upload.onprogress = (e) => { if (e.lengthComputable) est.textContent = 'Subiendo… ' + Math.round(e.loaded / e.total * 100) + ' %'; };
  x.onload = () => { let r = {}; try { r = JSON.parse(x.responseText); } catch {} est.textContent = x.status === 200 ? '✓ ' + r.mensaje : 'No se pudo subir: ' + (r.error || 'error ' + x.status); if (x.status === 200) $('#sbFile').value = ''; };
  x.onerror = () => { est.textContent = 'No se pudo conectar. Inténtalo más tarde.'; };
  est.textContent = 'Subiendo…'; x.send(f);
};
fetch('/api/mejoras').then((r) => (r.ok ? r.json() : [])).then((lista) => {
  if (!Array.isArray(lista) || !lista.length) return;
  const c = $('#comunidad'); c.hidden = false;
  const esc = (t) => String(t || '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
  c.innerHTML = '<b>Archivos de la comunidad</b> <small>(revisados por el autor; ábrelos con precaución)</small><br>' +
    lista.map((a) => `<a href="/api/archivo/${a.id}" download="${esc(a.nombre)}">${esc(a.nombre)}</a> <small>${(a.tam / 1048576).toFixed(1)} MB${a.autor ? ' · ' + esc(a.autor) : ''}${a.nota ? ' · ' + esc(a.nota) : ''}</small>`).join('<br>');
}).catch(() => {});

// ---------- escena ----------
const canvas = $('#lienzo');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf4f5f7);
const camera = new THREE.PerspectiveCamera(32, 1, 20, 20000);
scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa3ad, 1.1));
const sol = new THREE.DirectionalLight(0xffffff, 1.6); sol.position.set(900, 1600, 1400); scene.add(sol);
const sol2 = new THREE.DirectionalLight(0xffffff, 0.6); sol2.position.set(-1200, 400, -900); scene.add(sol2);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

const centro = new THREE.Vector3(951, 588, 229);          // centro de la bici (coordenadas del STL)
const SUELO = 114.9;
const grid = new THREE.GridHelper(3200, 32, 0xc9ced6, 0xe1e4e9); grid.position.set(centro.x, SUELO, centro.z); scene.add(grid);

// ---------- grupos que se mueven (pivotes) ----------
const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const pivotes = {};                       // nombre -> {obj, mundo(Vector3), eje(Vector3)}
function crear(nombre, padre) {
  const g = G[nombre];
  const mundo = g.eje ? V(g.eje.punto) : new THREE.Vector3();
  const eje = g.eje ? V(g.eje.direccion).normalize() : new THREE.Vector3(0, 0, 1);
  const obj = new THREE.Group();
  const pm = padre ? pivotes[padre].mundo : new THREE.Vector3();
  obj.position.copy(mundo).sub(pm);
  (padre ? pivotes[padre].obj : scene).add(obj);
  pivotes[nombre] = { obj, mundo, eje };
}
crear('fijo'); crear('pedalier'); crear('rueda_trasera'); crear('cadena'); crear('direccion'); crear('rueda_delantera', 'direccion');

// sub-pivotes: cada pedal gira sobre su eje (para quedar horizontal) y las roldanas del cambio sobre el suyo
const centroDe = (id) => datos.piezas.find((p) => p.id === id)?.centro;
const SUB = {                                       // pivote -> [pieza que da el eje, padre, piezas que lleva]
  pedal_dcho: ['Eje_pedal_Campagnolo_dcho_1', 'pedalier', ['Eje_pedal_Campagnolo_dcho_1', 'Pedal_Campagnolo_dcho_1', 'Rodamientos_pedal_dcho_1']],
  pedal_izq: ['Eje_pedal_Campagnolo_izq_1', 'pedalier', ['Eje_pedal_Campagnolo_izq_1', 'Pedal_Campagnolo_izq_1', 'Rodamientos_pedal_izq_1']],
  roldana_1: ['Roldana_11T_1', 'fijo', ['Roldana_11T_1']],
  roldana_2: ['Roldana_11T_2', 'fijo', ['Roldana_11T_2']],
};
const PIV = {};                                     // id de pieza -> pivote propio
for (const [n, [ref, padre, ids]] of Object.entries(SUB)) {
  const c = centroDe(ref); if (!c) continue;
  G[n] = { eje: { punto: c, direccion: [0, 0, 1] } };
  crear(n, padre); ids.forEach((id) => (PIV[id] = n));
}
const pivDe = (p) => pivotes[PIV[p.id] || p.grupo];

// ---------- volumen, material y corte ----------
function volumen(geo) {                                // suma de volumenes con signo (malla cerrada), mm3 -> cm3
  const a = geo.attributes.position.array; let v = 0;
  for (let i = 0; i < a.length; i += 9) {
    v += a[i] * (a[i + 4] * a[i + 8] - a[i + 5] * a[i + 7]) - a[i + 1] * (a[i + 3] * a[i + 8] - a[i + 5] * a[i + 6]) + a[i + 2] * (a[i + 3] * a[i + 7] - a[i + 4] * a[i + 6]);
  }
  return Math.abs(v / 6) / 1000;
}
const plano = new THREE.Plane(new THREE.Vector3(1, 0, 0), 1e9);
renderer.localClippingEnabled = true;
const dens = () => parseFloat($('#mat').value);
const matNombre = () => $('#mat').selectedOptions[0].textContent.split(' (')[0];
const kg = (p) => p.vol * dens() / 1000;
const fmtKg = (x) => x < 1 ? (x * 1000).toFixed(0) + ' g' : x.toFixed(2).replace('.', ',') + ' kg';

// ---------- carga de piezas ----------
const loader = new STLLoader();
const piezas = datos.piezas;
const malla = {};                          // id -> Mesh
let hechas = 0;
async function cargar(p) {
  const geo = await new Promise((ok, ko) => loader.load(p.stl, ok, undefined, ko));
  const mat = new THREE.MeshStandardMaterial({ color: COLOR[p.grupo] ?? 0x888888, metalness: 0.25, roughness: 0.55, side: THREE.DoubleSide });
  const m = new THREE.Mesh(geo, mat);
  p.vol = volumen(geo);                                // cm3
  mat.clippingPlanes = [plano];
  m.userData = { p, base: mat.color.clone() };
  const pv = pivDe(p);
  m.position.copy(pv.mundo).multiplyScalar(-1);
  pv.obj.add(m);
  malla[p.id] = m;
  $('#prog').style.width = (++hechas / piezas.length * 100) + '%';
  $('#cargaTxt').textContent = hechas + ' / ' + piezas.length;
}
const cola = [...piezas];
await Promise.all(Array.from({ length: 6 }, async () => { while (cola.length) await cargar(cola.shift()); }));
$('#carga').remove();

// ---------- lista ----------
const lista = $('#lista');
let sel = null;
function pintaLista(filtro = '') {
  const f = filtro.trim().toLowerCase();
  lista.innerHTML = '';
  const porConj = {};
  piezas.filter((p) => !f || (p.nombre + ' ' + p.conjunto + ' ' + p.subconjunto).toLowerCase().includes(f))
    .forEach((p) => (porConj[p.conjunto] ||= []).push(p));
  Object.entries(porConj).forEach(([c, ps]) => {
    const g = document.createElement('details'); g.className = 'g'; if (f || ps.some((p) => p.id === sel)) g.open = true;
    const s = document.createElement('summary'); s.textContent = c + ' (' + ps.length + ')'; g.append(s);
    ps.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).forEach((p) => {
      const d = document.createElement('div'); d.className = 'it' + (sel === p.id ? ' sel' : ''); d.dataset.id = p.id;
      d.innerHTML = '<span></span><small></small>'; d.firstChild.textContent = p.nombre; d.lastChild.textContent = p.subconjunto;
      d.onclick = () => { elegir(p.id, true); if (matchMedia('(max-width:860px),(max-height:520px)').matches) ponTab('bici'); };
      d.onmouseenter = () => resalta(p.id, true); d.onmouseleave = () => resalta(null);
      g.append(d);
    });
    lista.append(g);
  });
  if (!lista.children.length) lista.innerHTML = '<h3>Sin resultados</h3>';
}
$('#buscar').oninput = (e) => pintaLista(e.target.value);

// ---------- selección y resaltado ----------
const mm = (n) => n.toFixed(1).replace('.', ',');
function aplica(idSel, idHover) {
  const hay = idSel || idHover;
  for (const m of Object.values(malla)) {
    const mat = m.material, id = m.userData.p.id, activo = id === idSel || id === idHover;
    mat.transparent = !!hay && !activo; mat.opacity = hay && !activo ? 0.16 : 1; mat.depthWrite = !(hay && !activo);
    mat.emissive.set(activo ? 0xd9480f : 0x000000); mat.emissiveIntensity = activo ? 0.55 : 0;
  }
}
function resalta(id) { aplica(sel, id); }
const CAMA = 250;                                          // cama de impresion (mm)
let escala = 1;                                            // 1:escala
const cesta = new Set();
function elegir(id, enfocar) {
  sel = id; aplica(sel, null);
  history.replaceState(null, '', id ? '#pieza=' + id : location.pathname + location.search);
  document.querySelectorAll('.it').forEach((e) => e.classList.toggle('sel', e.dataset.id === id));
  document.querySelector('.it.sel')?.closest('details')?.setAttribute('open', '');
  const ficha = $('#ficha');
  if (!id) { ficha.innerHTML = '<div class="m">Pulsa una pieza de la lista, o en la bici, para ver sus medidas y descargarla: STL para imprimir, plano PDF y archivo de SolidWorks para modificarla. Arrastra una biela o un pedal para mover la bici.</div>'; return; }
  const p = piezas.find((x) => x.id === id);
  const d = p.caja.map((v) => v / escala);
  const cabe = d.every((v) => v <= CAMA);
  const sugerida = [1, 2, 5, 10, 20].find((e) => Math.max(...p.caja) / e <= CAMA);
  ficha.innerHTML = `<h2></h2><div class="m" id="fm"></div>
    <div class="fila" style="margin:0 0 8px"><label>Escala de impresión <select id="esc">${[1, 2, 5, 10].map((e) => `<option value="${e}" ${e === escala ? 'selected' : ''}>${e === 1 ? '1:1 (tamaño real)' : '1:' + e}</option>`).join('')}</select></label></div>
    <div class="m" id="cabe" style="color:${cabe ? '#1a7f37' : '#b42318'}"></div>
    <div class="bt"></div>`;
  ficha.querySelector('h2').textContent = p.nombre;
  ficha.querySelector('#fm').textContent = `${p.conjunto}${p.subconjunto ? ' › ' + p.subconjunto : ''} · ${mm(p.caja[0])} × ${mm(p.caja[1])} × ${mm(p.caja[2])} mm · ${mm(p.vol)} cm³ · ${fmtKg(kg(p))} en ${matNombre().toLowerCase()}`;
  ficha.querySelector('#cabe').textContent = `A 1:${escala} mide ${d.map(mm).join(' × ')} mm: ` + (cabe ? `cabe en una cama de ${CAMA}×${CAMA} mm.` : `no cabe en ${CAMA} mm; usa 1:${sugerida || 50} o parte la pieza.`);
  ficha.querySelector('#esc').onchange = (e) => { escala = +e.target.value; elegir(id, false); };
  const bt = ficha.querySelector('.bt');
  const btnSTL = Object.assign(document.createElement('button'), { className: 'btn p', textContent: escala === 1 ? 'Descargar STL' : 'Descargar STL 1:' + escala });
  btnSTL.onclick = () => conAviso(() => descargaSTL(p, escala));
  const a2 = Object.assign(document.createElement('a'), { className: 'btn' + (p.pdf ? '' : ' off'), textContent: p.pdf ? 'Plano PDF' : 'Sin plano', href: p.pdf || '#', target: '_blank', rel: 'noopener' });
  const a3 = Object.assign(document.createElement('a'), { className: 'btn' + (p.sw ? '' : ' off'), textContent: 'SolidWorks (.SLDPRT)', href: p.sw || '#', download: '' });
  const b4 = Object.assign(document.createElement('button'), { textContent: cesta.has(id) ? '✓ En mi descarga' : '+ A mi descarga' });
  b4.onclick = () => { cesta.has(id) ? cesta.delete(id) : cesta.add(id); pintaCesta(); elegir(id, false); };
  bt.append(btnSTL, a2, a3, b4);
  if (enfocar) {
    const m = malla[id]; m.updateWorldMatrix(true, false);
    const c = new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3());
    controls.target.lerp(c, 1);
    const tam = Math.max(...p.caja);
    const dir = camera.position.clone().sub(controls.target).normalize();
    camera.position.copy(controls.target).addScaledVector(dir, Math.max(tam * 3.2, 260));
  }
  const it = document.querySelector('.it.sel'); if (it) it.scrollIntoView({ block: 'nearest' });
}
async function descargaSTL(p, e) {
  const buf = await (await fetch(p.stl)).arrayBuffer();
  if (e !== 1) {
    const dv = new DataView(buf), n = dv.getUint32(80, true);
    for (let i = 0; i < n; i++) for (let k = 0; k < 9; k++) { const o = 84 + 50 * i + 12 + 4 * k; dv.setFloat32(o, dv.getFloat32(o, true) / e, true); }
  }
  guarda(new Blob([buf], { type: 'model/stl' }), p.id + (e === 1 ? '' : '_1a' + e) + '.stl');
}
let avisoCont = null;
function conAviso(accion) {                      // muestra el aviso una vez por sesion y luego descarga
  if (sessionStorage.getItem('avisado')) return accion();
  avisoCont = accion; $('#aviso').hidden = false;
}
$('#avOk').onclick = () => { sessionStorage.setItem('avisado', '1'); $('#aviso').hidden = true; const a = avisoCont; avisoCont = null; a && a(); };
$('#avNo').onclick = () => { $('#aviso').hidden = true; avisoCont = null; };
$('#avMejora').onclick = () => { sessionStorage.setItem('avisado', '1'); $('#aviso').hidden = true; avisoCont = null; $('#subirBtn').click(); };
document.addEventListener('click', (e) => {         // enlaces de descarga (zip, SolidWorks, bici completa)
  const a = e.target.closest('a[download], a.dl, a[href$=".zip"], a[href$=".SLDPRT"]');
  if (!a || sessionStorage.getItem('avisado')) return;
  e.preventDefault(); conAviso(() => { const b = Object.assign(document.createElement('a'), { href: a.href, download: a.getAttribute('download') ?? '' }); document.body.append(b); b.click(); b.remove(); });
});
function guarda(blob, nombre) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: nombre });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const TC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (u8) => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = TC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function zip(archivos) {                               // zip sin compresion: [{nombre, datos:Uint8Array}]
  const enc = new TextEncoder(), partes = [], central = []; let pos = 0;
  for (const f of archivos) {
    const nom = enc.encode(f.nombre), crc = crc32(f.datos), cab = new DataView(new ArrayBuffer(30));
    cab.setUint32(0, 0x04034b50, true); cab.setUint16(4, 20, true); cab.setUint16(6, 0x0800, true); cab.setUint32(14, crc, true);
    cab.setUint32(18, f.datos.length, true); cab.setUint32(22, f.datos.length, true); cab.setUint16(26, nom.length, true);
    partes.push(new Uint8Array(cab.buffer), nom, f.datos);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint32(16, crc, true);
    c.setUint32(20, f.datos.length, true); c.setUint32(24, f.datos.length, true); c.setUint16(28, nom.length, true); c.setUint32(42, pos, true);
    central.push(new Uint8Array(c.buffer), nom);
    pos += 30 + nom.length + f.datos.length;
  }
  const tam = central.reduce((a, b) => a + b.length, 0), fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, archivos.length, true); fin.setUint16(10, archivos.length, true); fin.setUint32(12, tam, true); fin.setUint32(16, pos, true);
  return new Blob([...partes, ...central, new Uint8Array(fin.buffer)], { type: 'application/zip' });
}
function pintaCesta() {
  const c = $('#cesta');
  c.hidden = cesta.size === 0;
  c.querySelector('span').textContent = `Mi descarga: ${cesta.size} pieza${cesta.size === 1 ? '' : 's'}`;
}
$('#cestaZip').onclick = (ev) => conAviso(() => bajaCesta(ev.currentTarget));
async function bajaCesta(b) {
  b.disabled = true; b.textContent = 'Preparando…';
  const quiere = { stl: $('#cStl').checked, pdf: $('#cPdf').checked, sw: $('#cSw').checked }, files = [], vistos = new Set();
  const trae = async (url, nombre) => { if (vistos.has(nombre)) return; vistos.add(nombre); files.push({ nombre, datos: new Uint8Array(await (await fetch(url)).arrayBuffer()) }); };
  for (const id of cesta) {
    const p = piezas.find((x) => x.id === id);
    if (quiere.stl) await trae(p.stl, 'STL/' + p.id + '.stl');
    if (quiere.pdf && p.pdf) await trae(p.pdf, 'Planos/' + p.pdf.split('/').pop());
    if (quiere.sw && p.sw) await trae(p.sw, 'SolidWorks/' + p.sw.split('/').pop());
  }
  const txt = `Piezas de la bicicleta - ${cesta.size} seleccionadas\r\nAutor: ${datos.autor} - ${datos.web}\r\nLicencia libre: puedes usar, imprimir y modificar estas piezas manteniendo el nombre del autor y su web.\r\n`;
  files.push({ nombre: 'LEEME.txt', datos: new TextEncoder().encode(txt) });
  guarda(zip(files), 'piezas_bici.zip');
  b.disabled = false; b.textContent = 'Descargar ZIP';
}
$('#cestaVaciar').onclick = () => { cesta.clear(); pintaCesta(); if (sel) elegir(sel, false); };

const ray = new THREE.Raycaster(), pt = new THREE.Vector2();
let down = null;
canvas.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', (e) => {
  if (arrastre || !down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return;
  const r = canvas.getBoundingClientRect();
  pt.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(pt, camera);
  const visibles = Object.values(malla).filter((m) => m.material.opacity > 0.5 || !sel);
  const h = ray.intersectObjects(visibles, false)[0];
  if (modoPlanos) { if (h) bajaPlano(h.object.userData.p); return; }
  if (medir) {
    if (!h) return;
    if (puntos.length >= 2) { puntos = []; marcas.clear(); }
    anotaPunto(puntoCercano(h)); return;
  }
  elegir(h ? h.object.userData.p.id : null, false);
  if (h) menuPieza(h.object.userData.p, e.clientX, e.clientY); else cierraMenu();
});

// ---------- menú al tocar una pieza en la bici ----------
const menu = document.createElement('div'); menu.id = 'menuPieza'; menu.hidden = true;
$('#vista').append(menu);
function cierraMenu() { menu.hidden = true; }
function menuPieza(p, x, y) {
  const r = $('#vista').getBoundingClientRect();
  menu.innerHTML = `<div class="t"></div><div class="s"></div>
    <a class="btn p" data-a="pdf">📄 Plano PDF</a>
    <a class="btn" data-a="sw">🛠 SolidWorks (.SLDPRT)</a>
    <a class="btn" data-a="stl">⬇ STL para imprimir</a>
    <button class="x" title="Cerrar">✕</button>`;
  menu.querySelector('.t').textContent = p.nombre;
  menu.querySelector('.s').textContent = `${p.conjunto}${p.subconjunto ? ' › ' + p.subconjunto : ''} · ${mm(p.caja[0])} × ${mm(p.caja[1])} × ${mm(p.caja[2])} mm`;
  const [aPdf, aSw, aStl] = menu.querySelectorAll('a');
  if (p.pdf) Object.assign(aPdf, { href: p.pdf, target: '_blank', rel: 'noopener' }); else { aPdf.classList.add('off'); aPdf.textContent = '📄 Sin plano PDF'; }
  if (p.sw) Object.assign(aSw, { href: p.sw, download: '' }); else aSw.classList.add('off');
  aStl.href = '#'; aStl.onclick = (ev) => { ev.preventDefault(); conAviso(() => descargaSTL(p, 1)); };
  menu.querySelector('.x').onclick = cierraMenu;
  menu.hidden = false;
  const w = menu.offsetWidth, h = menu.offsetHeight;
  menu.style.left = Math.max(8, Math.min(x - r.left + 12, r.width - w - 8)) + 'px';
  menu.style.top = Math.max(8, Math.min(y - r.top + 12, r.height - h - 8)) + 'px';
}
addEventListener('keydown', (e) => { if (e.key === 'Escape') cierraMenu(); });
controls.addEventListener('start', cierraMenu);          // al girar la cámara se cierra

// ---------- modo "Descargar planos": se pulsa el botón y luego la pieza en la bici ----------
let modoPlanos = false, ultHover = 0;
const avisoPl = $('#avisoPlanos');
$('#planosBtn').onclick = (e) => {
  if (medir) $('#medir').click();
  modoPlanos = !modoPlanos; cierraMenu();
  e.currentTarget.classList.toggle('on', modoPlanos);
  e.currentTarget.textContent = modoPlanos ? '✕ Salir de planos' : '📄 Descargar planos';
  avisoPl.hidden = !modoPlanos;
  avisoPl.textContent = 'Toca en la bici la pieza de la que quieres el plano.';
  canvas.style.cursor = modoPlanos ? 'pointer' : '';
  if (!modoPlanos) aplica(sel, null);
};
function bajaPlano(p) {
  if (!p.pdf) { avisoPl.textContent = `«${p.nombre}» no tiene plano (pieza comercial o de serie). Prueba con otra.`; return; }
  avisoPl.textContent = `Descargando el plano de «${p.nombre}». Toca otra pieza o pulsa «Salir de planos».`;
  conAviso(() => { const a = Object.assign(document.createElement('a'), { href: p.pdf, download: p.pdf.split('/').pop() }); document.body.append(a); a.click(); a.remove(); });
}
canvas.addEventListener('pointermove', (e) => {          // resalta la pieza que hay debajo del dedo o ratón
  if (!modoPlanos || e.buttons || performance.now() - ultHover < 50) return;
  ultHover = performance.now();
  rayoDe(e);
  const h = ray.intersectObjects(Object.values(malla), false)[0];
  aplica(sel, h ? h.object.userData.p.id : null);
});

// ---------- despiece, dirección, pedaleo ----------
let explo = 0;
$('#explo').oninput = (e) => { explo = e.target.value / 100; reposiciona(); };
function reposiciona() {
  for (const m of Object.values(malla)) {
    const p = m.userData.p, pv = pivDe(p);
    const d = V(p.centro).sub(centro).multiplyScalar(explo * 0.9);
    d.y += explo * 160 * Math.sign(d.y || 1) * 0.2; d.z *= 1.6;
    m.position.copy(pv.mundo).multiplyScalar(-1).add(d);
  }
}
// Pedaleo. La rueda trasera gira 52/19 veces por vuelta de pedal y tiene rueda libre:
// pedalear hacia atrás no la frena. La delantera gira igual (mismo diámetro, sin patinar).
const PLATO = 52, PINON = 19, ROLDANA = 11;
const D_RUEDA = (datos.piezas.find((p) => p.id === 'Rueda_delantera_1')?.caja[0] || 667.8) / 1000;   // m
let dirAng = 0, pedAng = 0, ruedaAng = 0, ruedaVel = 0;
const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
let anima = !quieto;                                 // pedalea sola al abrir la página
const rpm = () => +$('#cad').value;
const kmh = (vueltasPedalPorSeg) => vueltasPedalPorSeg * PLATO / PINON * Math.PI * D_RUEDA * 3.6;
function pintaVel() {
  const v = anima ? rpm() / 60 : ruedaVel / (2 * Math.PI) / (PLATO / PINON);
  $('#vel').textContent = (anima ? rpm() + ' rpm · ' : '') + kmh(Math.max(0, v)).toFixed(1).replace('.', ',') + ' km/h';
}
function botonPedal() { const b = $('#pedal'); b.textContent = anima ? '❚❚ Parar' : '▶ Pedalear'; b.classList.toggle('on', anima); pintaVel(); }
$('#dir').oninput = (e) => { dirAng = e.target.value * Math.PI / 180; mueve(); };
$('#pedal').onclick = () => { anima = !anima; if (!anima) ruedaVel = rpm() / 60 * 2 * Math.PI * PLATO / PINON; botonPedal(); };
$('#cad').oninput = pintaVel;
function avanza(d) {                                 // d: giro de los pedales en radianes (+ = hacia delante)
  pedAng += d;
  if (d > 0) ruedaAng += d * PLATO / PINON;          // rueda libre: hacia atrás no arrastra la rueda
}
const gira = (n, a) => pivotes[n] && pivotes[n].obj.quaternion.setFromAxisAngle(pivotes[n].eje, a);
function mueve() {
  gira('direccion', dirAng);
  gira('pedalier', -pedAng);
  gira('pedal_dcho', pedAng); gira('pedal_izq', pedAng);          // los pedales se quedan horizontales
  const cadena = -pedAng * PLATO;                                  // dientes recorridos por la cadena
  gira('roldana_1', cadena / ROLDANA); gira('roldana_2', cadena / ROLDANA);
  gira('rueda_trasera', -ruedaAng);
  gira('rueda_delantera', -ruedaAng);                // gira sobre su eje, que además gira con la dirección
}
mueve();

// ---------- arrastrar los pedales con el ratón o el dedo ----------
const esPedalier = (m) => m.userData.p.grupo === 'pedalier';
const planoBiela = new THREE.Plane(), tocado = new THREE.Vector3();
let arrastre = null;                                  // {ang, t, x, y, movido, id}
function rayoDe(e) {
  const r = canvas.getBoundingClientRect();
  pt.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(pt, camera);
}
function anguloBiela(e) {                             // ángulo del puntero alrededor del eje del pedalier
  rayoDe(e);
  const pv = pivotes.pedalier;
  planoBiela.setFromNormalAndCoplanarPoint(pv.eje, pv.mundo);
  if (!ray.ray.intersectPlane(planoBiela, tocado)) return null;
  const d = tocado.sub(pv.mundo);
  return Math.atan2(d.y, d.x);
}
canvas.parentElement.addEventListener('pointerdown', (e) => {   // fase de captura: antes que la cámara
  if (e.target !== canvas || medir || modoPlanos || e.button > 0) return;
  rayoDe(e);
  const visibles = Object.values(malla).filter((m) => m.material.opacity > 0.5 || !sel);
  const h = ray.intersectObjects(visibles, false)[0];
  if (!h || !esPedalier(h.object)) return;
  const a = anguloBiela(e); if (a === null) return;
  e.stopPropagation();
  canvas.setPointerCapture(e.pointerId);
  arrastre = { ang: a, t: performance.now(), x: e.clientX, y: e.clientY, movido: false, id: h.object.userData.p.id };
  if (anima) { anima = false; botonPedal(); }
  ruedaVel = 0; canvas.style.cursor = 'grabbing';
}, true);
canvas.addEventListener('pointermove', (e) => {
  if (!arrastre) {                                      // mano encima de bielas y pedales
    if (medir || modoPlanos || e.buttons) return;
    rayoDe(e);
    const h = ray.intersectObjects(Object.values(malla).filter(esPedalier), false)[0];
    canvas.style.cursor = h ? 'grab' : '';
    return;
  }
  if (Math.hypot(e.clientX - arrastre.x, e.clientY - arrastre.y) > 4) arrastre.movido = true;
  const a = anguloBiela(e); if (a === null) return;
  let d = a - arrastre.ang; d = Math.atan2(Math.sin(d), Math.cos(d));
  const t = performance.now(), dt = Math.max((t - arrastre.t) / 1000, 1e-3);
  avanza(-d);                                           // sentido horario visto desde el lado de la cadena = adelante
  ruedaVel = 0.7 * ruedaVel + 0.3 * Math.max(0, -d) * PLATO / PINON / dt;
  arrastre.ang = a; arrastre.t = t;
  mueve(); pintaVel();
});
function sueltaPedal(e) {
  if (!arrastre) return;
  if (!arrastre.movido) { elegir(arrastre.id, false); menuPieza(malla[arrastre.id].userData.p, e.clientX, e.clientY); }   // un clic sin mover: menú de la pieza
  if (performance.now() - arrastre.t > 120) ruedaVel = 0;
  arrastre = null; canvas.style.cursor = 'grab'; down = null;
}
canvas.addEventListener('pointerup', sueltaPedal);
canvas.addEventListener('pointercancel', sueltaPedal);

// ---------- datos generales de la bici ----------
function pintaDatos() {
  const f = piezas.find((p) => p.id === 'Rueda_delantera_1'), r = piezas.find((p) => p.id === 'Rueda_trasera_1');
  const eF = G.rueda_delantera.eje.punto, eR = G.rueda_trasera.eje.punto;
  const caja = new THREE.Box3();
  piezas.forEach((p) => { const c = V(p.centro), h = V(p.caja).multiplyScalar(0.5); caja.expandByPoint(c.clone().sub(h)); caja.expandByPoint(c.clone().add(h)); });
  const t = caja.getSize(new THREE.Vector3());
  const masa = piezas.reduce((a, p) => a + kg(p), 0);
  const desarrollo = 52 / 19 * Math.PI * f.caja[0] / 1000;
  const fila = (a, b) => `<tr><td>${a}</td><td>${b}</td></tr>`;
  $('#datos').innerHTML = '<table>' +
    fila('Distancia entre ejes', mm(eF[0] - eR[0]) + ' mm') + fila('Diámetro de rueda (con cubierta)', mm(f.caja[0]) + ' mm') +
    fila('Largo × alto × ancho', mm(t.x) + ' × ' + mm(t.y) + ' × ' + mm(t.z) + ' mm') +
    fila('Relación plato/piñón', '52 / 19 (' + (52 / 19).toFixed(2).replace('.', ',') + ')') +
    fila('Desarrollo por pedalada', desarrollo.toFixed(2).replace('.', ',') + ' m') +
    fila('Piezas / triángulos', piezas.length + ' / ' + piezas.reduce((a, p) => a + p.triangulos, 0).toLocaleString('es')) +
    fila('Masa estimada (' + matNombre().toLowerCase() + ')', fmtKg(masa)) + '</table>' +
    '<div style="margin-top:6px;font-size:12px">Masa: volumen de cada pieza × densidad del material elegido. Es solo una estimación.</div>';
}
$('#datosBtn').onclick = () => { const d = $('#datos'); d.hidden = !d.hidden; if (!d.hidden) pintaDatos(); };
$('#mat').onchange = () => { if (!$('#datos').hidden) pintaDatos(); if (sel) elegir(sel, false); };

// ---------- corte ----------
const EJES = { x: [new THREE.Vector3(1, 0, 0), 0], y: [new THREE.Vector3(0, 1, 0), 1], z: [new THREE.Vector3(0, 0, 1), 2] };
function actualizaCorte() {
  const e = $('#corteEje').value, sl = $('#corte');
  sl.disabled = !e;
  if (!e) { plano.constant = 1e9; return; }
  const caja = new THREE.Box3().setFromCenterAndSize(centro, new THREE.Vector3(1700, 1000, 460));
  const [n, i] = EJES[e], lo = caja.min.getComponent(i), hi = caja.max.getComponent(i);
  const pos = lo + (hi - lo) * sl.value / 100;
  plano.normal.copy(n).multiplyScalar(-1); plano.constant = pos;      // se oculta lo que queda del lado + del plano
}
$('#corteEje').onchange = actualizaCorte; $('#corte').oninput = actualizaCorte;

// ---------- medir entre dos puntos ----------
let medir = false, puntos = [];
const marcas = new THREE.Group(); scene.add(marcas);
const readout = $('#medida');
$('#medir').onclick = (e) => {
  if (modoPlanos) $('#planosBtn').click();
  medir = !medir; e.currentTarget.classList.toggle('on', medir); puntos = []; marcas.clear();
  readout.hidden = !medir; readout.textContent = 'Pulsa dos puntos de la bici para medir la distancia.';
};
function puntoCercano(h) {                         // se pega al vértice más cercano del triángulo pulsado
  const g = h.object.geometry.attributes.position, v = new THREE.Vector3(); let mejor = null, dm = 1e9;
  [h.face.a, h.face.b, h.face.c].forEach((i) => {
    v.fromBufferAttribute(g, i); h.object.localToWorld(v);
    const d = v.distanceTo(h.point); if (d < dm) { dm = d; mejor = v.clone(); }
  });
  return dm < 12 ? mejor : h.point.clone();
}
function anotaPunto(w) {
  puntos.push(w);
  const s = new THREE.Mesh(new THREE.SphereGeometry(7, 12, 8), new THREE.MeshBasicMaterial({ color: 0xd9480f, depthTest: false }));
  s.position.copy(w); s.renderOrder = 9; marcas.add(s);
  if (puntos.length === 2) {
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(puntos), new THREE.LineBasicMaterial({ color: 0xd9480f, depthTest: false }));
    l.renderOrder = 9; marcas.add(l);
    const d = puntos[1].clone().sub(puntos[0]);
    readout.innerHTML = `<b>${mm(d.length())} mm</b> &nbsp; Δx ${mm(Math.abs(d.x))} · Δy ${mm(Math.abs(d.y))} · Δz ${mm(Math.abs(d.z))} mm`;
  } else readout.textContent = 'Punto 1 marcado. Pulsa el segundo punto.';
}

// ---------- vistas ----------
let vistaAct = 'iso';
function vista(v) {
  vistaAct = v;
  const d = 2600 * Math.max(1, 1.05 / (camera.aspect || 1.5)), t = centro.clone();
  const pos = { lat: [0, 0, d], fre: [d, 0, 0], pla: [0, d, 0.01], iso: [d * 0.55, d * 0.35, d * 0.85] }[v];
  controls.target.copy(t); camera.position.set(t.x + pos[0], t.y + pos[1], t.z + pos[2]);
}
document.querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => vista(b.dataset.v)));
vista('iso');

// ---------- pestañas (móvil) y descargas desplegables ----------
function ponTab(t) {
  document.body.dataset.tab = t;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
  setTimeout(ajusta, 30);
}
document.querySelectorAll('#tabs button').forEach((b) => { b.onclick = () => ponTab(b.dataset.t); });
$('#ctlBtn').onclick = () => document.body.classList.toggle('ctl');
(() => {
  const D = $('#descargas'), porC = {};
  piezas.forEach((p) => (porC[p.conjunto] ||= []).push(p));
  D.innerHTML = '<h2>Paquetes completos</h2><div class="zips">' + datos.descargas.map(([f, t]) => `<a class="btn p dl" href="../descargas/bici/${f}" download>⬇ ${t}</a>`).join('') + '<a class="btn" href="#" id="csv2">Lista de piezas (CSV)</a></div><h2>Piezas sueltas</h2>';
  const PRINCIPAL = { 'Rueda delantera': 'Rueda delantera', 'Rueda trasera': 'Rueda trasera', 'Cuadro y frenos traseros': 'Cuadro' };
  const fila = (p, neg) => {
    const r = document.createElement('div'); r.className = 'fd';
    r.innerHTML = '<span></span><span class="l"><a download>STL</a>' + (p.pdf ? '<a>Plano</a>' : '') + (p.sw ? '<a download>SolidWorks</a>' : '') + '</span>';
    r.firstChild.textContent = p.nombre; if (neg) r.firstChild.style.fontWeight = '650';
    const l = r.querySelectorAll('a'); l[0].href = p.stl; let k = 1; if (p.pdf) l[k++].href = p.pdf; if (p.sw) l[k].href = p.sw;
    return r;
  };
  Object.entries(porC).forEach(([c, ps]) => {            // árbol: conjunto > pieza / subconjunto > piezas
    ps.sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'));
    const g = document.createElement('details'); g.className = 'g';
    g.innerHTML = '<summary></summary>'; g.firstChild.textContent = c + ' (' + ps.length + ')';
    const pr = ps.find((p) => p.nombre === PRINCIPAL[c]);
    if (pr) g.append(fila(pr, true));                          // la pieza entera, a la vista
    const cuerpo = document.createElement('div'); cuerpo.className = 'arb'; g.append(cuerpo);
    ps.filter((p) => p !== pr && !p.subconjunto).forEach((p) => cuerpo.append(fila(p)));
    const subs = {}; ps.filter((p) => p.subconjunto).forEach((p) => (subs[p.subconjunto] ||= []).push(p));
    Object.entries(subs).forEach(([s, sp]) => {
      const d = document.createElement('details'); d.className = 'g sub';
      d.innerHTML = '<summary></summary>'; d.firstChild.textContent = s + ' (' + sp.length + ')';
      sp.forEach((p) => d.append(fila(p))); cuerpo.append(d);
    });
    D.append(g);
  });
})();

$('#indice').querySelectorAll('h3').forEach((h3) => {          // cada grupo de la lista, desplegable
  const ul = h3.nextElementSibling, g = document.createElement('details'), s = document.createElement('summary');
  g.className = 'g'; s.textContent = h3.textContent; g.append(s);
  h3.replaceWith(g); g.append(ul);
});

// ---------- pie ----------
$('#pie').innerHTML = `<span class="pd"><b>Descargas:</b> <a href="#" id="csv">Lista de piezas (CSV)</a> · ` + datos.descargas.map(([f, t]) => `<a href="../descargas/bici/${f}" title="${t}">${f}</a>`).join(' · ') + '</span>' +
  `<span style="flex:1"></span><span>© 2026 ${datos.autor} · <a href="mailto:Excavacionesart@gmail.com">Excavacionesart@gmail.com</a> · <a href="https://${datos.web}">${datos.web}</a> · Licencia libre: úsalo y modifícalo manteniendo el autor</span>`;

// ---------- lista de piezas (CSV) ----------
$('#csv2').onclick = $('#csv').onclick = (e) => {
  e.preventDefault();
  const f = (v) => '"' + String(v).replace(/"/g, '""') + '"';
  const filas = [['Pieza', 'Conjunto', 'Subconjunto', 'Largo mm', 'Ancho mm', 'Alto mm', 'Volumen cm3', 'Masa g (' + matNombre() + ')', 'Plano PDF', 'STL']];
  piezas.forEach((p) => filas.push([p.nombre, p.conjunto, p.subconjunto, ...p.caja, p.vol.toFixed(2), (kg(p) * 1000).toFixed(1), p.pdf ? new URL(p.pdf, location.href).href : '', new URL(p.stl, location.href).href]));
  const blob = new Blob([String.fromCharCode(0xFEFF) + filas.map((r) => r.map(f).join(';')).join(String.fromCharCode(13, 10))], { type: 'text/csv;charset=utf-8' });
  Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'bici_lista_de_piezas.csv' }).click();
};

// ---------- bucle ----------
function ajusta() {
  const r = canvas.parentElement.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix();
}
let vert = null;
function ajusta2() { ajusta(); const v = camera.aspect < 1.2; if (v !== vert) { vert = v; vista(vistaAct); } }
addEventListener('resize', ajusta2); ajusta2();
let t0 = performance.now();
renderer.setAnimationLoop((t) => {
  const dt = Math.min((t - t0) / 1000, 0.1); t0 = t;
  if (anima) { avanza(dt * rpm() / 60 * 2 * Math.PI); mueve(); }
  else if (!arrastre && ruedaVel > 0.05) {               // la bici sigue rodando y se va frenando
    ruedaAng += ruedaVel * dt; ruedaVel *= Math.exp(-dt / 2.5); mueve(); pintaVel();
  } else if (!arrastre && ruedaVel) { ruedaVel = 0; pintaVel(); }
  controls.update(); renderer.render(scene, camera);
});
pintaLista(); pintaCesta(); botonPedal();
const h = /pieza=([\w]+)/.exec(location.hash); if (h && malla[h[1]]) elegir(h[1], true);
window.__bici = { elegir, vista, malla, pivotes, camera, estado: () => ({ pedAng, ruedaAng, anima }) };
