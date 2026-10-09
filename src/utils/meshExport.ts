// Exportación del modelo activo a OBJ y 3MF (además del STL que ya se descarga).
// Parte siempre del STL en memoria. Si el STL trae color por cara, los triángulos se agrupan por color:
// - OBJ: un grupo (g) por color.
// - 3MF: un objeto por color, con su material base y su color.
// Unidades: mm. Mismas coordenadas que el STL (sin reorientar ni escalar).

import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { strToU8, zipSync } from 'three/examples/jsm/libs/fflate.module.js';

interface MeshGroup {
  color: string; // '#rrggbb' o '' si el STL no trae color
  verts: number[]; // x,y,z consecutivos (soldados)
  tris: number[]; // índices de vértice, de tres en tres
}

function baseName(name: string): string {
  return name.replace(/\.(stl|obj|3mf)$/i, '');
}

// Lee el STL y devuelve los triángulos agrupados por color, con los vértices soldados
function groupMesh(stl: ArrayBuffer): MeshGroup[] {
  const geo = new STLLoader().parse(stl);
  const pos = geo.getAttribute('position');
  const col = geo.getAttribute('color');
  const groups = new Map<string, { g: MeshGroup; index: Map<string, number> }>();
  const tmp = new THREE.Color();

  for (let t = 0; t < pos.count; t += 3) {
    let key = '';
    if (col) {
      // STLLoader guarda el color en espacio lineal; getHexString devuelve sRGB
      tmp.setRGB(col.getX(t), col.getY(t), col.getZ(t));
      key = '#' + tmp.getHexString();
    }
    let entry = groups.get(key);
    if (!entry) {
      entry = { g: { color: key, verts: [], tris: [] }, index: new Map() };
      groups.set(key, entry);
    }
    for (let k = 0; k < 3; k++) {
      const x = pos.getX(t + k);
      const y = pos.getY(t + k);
      const z = pos.getZ(t + k);
      const id = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
      let vi = entry.index.get(id);
      if (vi === undefined) {
        vi = entry.g.verts.length / 3;
        entry.g.verts.push(x, y, z);
        entry.index.set(id, vi);
      }
      entry.g.tris.push(vi);
    }
  }
  geo.dispose();
  // Quita triángulos degenerados que el soldado de vértices haya colapsado
  return [...groups.values()].map(({ g }) => {
    const tris: number[] = [];
    for (let i = 0; i < g.tris.length; i += 3) {
      const a = g.tris[i], b = g.tris[i + 1], c = g.tris[i + 2];
      if (a !== b && b !== c && a !== c) tris.push(a, b, c);
    }
    return { ...g, tris };
  });
}

const num = (v: number) => {
  const s = v.toFixed(4);
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
};

// ── OBJ ──
export function stlToOBJ(stl: ArrayBuffer, name: string): string {
  const groups = groupMesh(stl);
  const out: string[] = [`# ${baseName(name)} - exportado desde el visor STL (unidades: mm)`];
  let offset = 0;
  groups.forEach((g, i) => {
    out.push(`g ${g.color ? 'pieza_' + (i + 1) + '_' + g.color.slice(1) : 'modelo'}`);
    for (let v = 0; v < g.verts.length; v += 3) {
      out.push(`v ${num(g.verts[v])} ${num(g.verts[v + 1])} ${num(g.verts[v + 2])}`);
    }
    for (let t = 0; t < g.tris.length; t += 3) {
      out.push(`f ${g.tris[t] + 1 + offset} ${g.tris[t + 1] + 1 + offset} ${g.tris[t + 2] + 1 + offset}`);
    }
    offset += g.verts.length / 3;
  });
  return out.join('\n') + '\n';
}

// ── 3MF (ZIP con el modelo en XML) ──
function xmlEsc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function stlTo3MF(stl: ArrayBuffer, name: string): Uint8Array {
  const groups = groupMesh(stl);
  const title = xmlEsc(baseName(name));
  const hasColor = groups.some(g => g.color);

  const res: string[] = [];
  if (hasColor) {
    res.push('<basematerials id="1">');
    groups.forEach((g, i) => {
      res.push(`<base name="Pieza ${i + 1}" displaycolor="${(g.color || '#c8c8c8').toUpperCase()}FF"/>`);
    });
    res.push('</basematerials>');
  }
  groups.forEach((g, i) => {
    const pid = hasColor ? ` pid="1" pindex="${i}"` : '';
    res.push(`<object id="${i + 2}" name="Pieza ${i + 1}" type="model"${pid}><mesh><vertices>`);
    for (let v = 0; v < g.verts.length; v += 3) {
      res.push(`<vertex x="${num(g.verts[v])}" y="${num(g.verts[v + 1])}" z="${num(g.verts[v + 2])}"/>`);
    }
    res.push('</vertices><triangles>');
    for (let t = 0; t < g.tris.length; t += 3) {
      res.push(`<triangle v1="${g.tris[t]}" v2="${g.tris[t + 1]}" v3="${g.tris[t + 2]}"/>`);
    }
    res.push('</triangles></mesh></object>');
  });
  const build = groups.map((_, i) => `<item objectid="${i + 2}"/>`).join('');

  const model =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<model unit="millimeter" xml:lang="es-ES" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">' +
    `<metadata name="Title">${title}</metadata>` +
    `<resources>${res.join('')}</resources><build>${build}</build></model>`;

  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>';

  const rels =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>';

  return zipSync({
    '[Content_Types].xml': strToU8(contentTypes),
    '_rels/.rels': strToU8(rels),
    '3D/3dmodel.model': strToU8(model)
  });
}
