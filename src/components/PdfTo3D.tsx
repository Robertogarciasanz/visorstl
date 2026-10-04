import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  X, FileText, Ruler, PenTool, Circle as CircleIcon, Square, Undo2, Trash2,
  ZoomIn, ZoomOut, ChevronLeft, ChevronRight, Box, Download
} from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type Pt = { x: number; y: number };
type Mode = 'calib' | 'outline' | 'hole' | 'circle';
type CircleHole = { c: Pt; r: number };

interface Props {
  onClose: () => void;
  onGenerate: (buffer: ArrayBuffer, name: string) => void;
}

const RENDER_SCALE = 2; // resolución del renderizado del PDF (px de canvas por punto PDF)

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

export function PdfTo3D({ onClose, onGenerate }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(0.5);
  const [fileName, setFileName] = useState('');

  const [mode, setMode] = useState<Mode>('calib');
  const [mmPerPx, setMmPerPx] = useState<number | null>(null);
  const [calibPts, setCalibPts] = useState<Pt[]>([]);
  const [outline, setOutline] = useState<Pt[]>([]);
  const [outlineClosed, setOutlineClosed] = useState(false);
  const [holes, setHoles] = useState<Pt[][]>([]);
  const [curHole, setCurHole] = useState<Pt[]>([]);
  const [circles, setCircles] = useState<CircleHole[]>([]);
  const [circleCenter, setCircleCenter] = useState<Pt | null>(null);
  const [cursor, setCursor] = useState<Pt | null>(null);
  const [thickness, setThickness] = useState(2);
  const [modelName, setModelName] = useState('pieza_plano');
  const [ortho, setOrtho] = useState(true);

  // ── Carga y renderizado del PDF ──
  const openPdf = async (file: File) => {
    try {
      const data = await file.arrayBuffer();
      const doc = await pdfjsLib.getDocument({ data }).promise;
      setPdf(doc);
      setPageNum(1);
      setFileName(file.name);
      setModelName(file.name.replace(/\.pdf$/i, '').replace(/[^a-zA-Z0-9_-]+/g, '_') || 'pieza_plano');
      resetAll(true);
    } catch {
      alert('No se pudo abrir el PDF.');
    }
  };

  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    let task: any;
    (async () => {
      const page = await pdf.getPage(pageNum);
      const vp = page.getViewport({ scale: RENDER_SCALE });
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      canvas.width = vp.width;
      canvas.height = vp.height;
      setSize({ w: vp.width, h: vp.height });
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, vp.width, vp.height);
      task = page.render({ canvasContext: ctx, viewport: vp, canvas } as any);
      await task.promise.catch(() => {});
    })();
    return () => { cancelled = true; task?.cancel?.(); };
  }, [pdf, pageNum]);

  // ── Utilidades de dibujo ──
  const resetAll = (alsoCalib = false) => {
    if (alsoCalib) { setMmPerPx(null); setCalibPts([]); setMode('calib'); }
    setOutline([]); setOutlineClosed(false); setHoles([]); setCurHole([]);
    setCircles([]); setCircleCenter(null);
  };

  const allPoints = (): Pt[] => [...outline, ...holes.flat(), ...curHole, ...circles.map(c => c.c)];

  const toCanvas = (e: React.MouseEvent): Pt => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (size.w / r.width), y: (e.clientY - r.top) * (size.h / r.height) };
  };

  // radio de captura en px de canvas (≈ 10 px de pantalla)
  const snapR = () => {
    const r = svgRef.current?.getBoundingClientRect();
    return r ? 10 * (size.w / r.width) : 10;
  };

  const adjust = (p: Pt, prev: Pt | undefined, shift: boolean): Pt => {
    // 1) imán a puntos existentes
    for (const q of allPoints()) if (dist(p, q) < snapR()) return q;
    // 2) ortogonal (horizontal / vertical) respecto al punto anterior
    if (prev && (ortho !== shift)) {
      return Math.abs(p.x - prev.x) > Math.abs(p.y - prev.y) ? { x: p.x, y: prev.y } : { x: prev.x, y: p.y };
    }
    return p;
  };

  const lastPoint = (): Pt | undefined => {
    if (mode === 'outline' && !outlineClosed) return outline[outline.length - 1];
    if (mode === 'hole') return curHole[curHole.length - 1];
    if (mode === 'calib') return calibPts[0];
    if (mode === 'circle') return circleCenter ?? undefined;
    return undefined;
  };

  const handleClick = (e: React.MouseEvent) => {
    if (!pdf) return;
    const raw = toCanvas(e);
    const p = mode === 'circle' && circleCenter ? raw : adjust(raw, lastPoint(), e.shiftKey);

    if (mode === 'calib') {
      if (calibPts.length === 0) { setCalibPts([p]); return; }
      const px = dist(calibPts[0], p);
      if (px < 2) return;
      const val = prompt('¿Cuántos milímetros mide esa cota en el plano?');
      const mm = parseFloat((val || '').replace(',', '.'));
      if (mm > 0) {
        setMmPerPx(mm / px);
        setCalibPts([calibPts[0], p]);
        setMode('outline');
      } else {
        setCalibPts([]);
      }
      return;
    }
    if (!mmPerPx) { alert('Primero calibra la escala con una cota conocida.'); return; }

    if (mode === 'outline') {
      if (outlineClosed) { alert('El contorno ya está cerrado. Usa "Taladro" o "Agujero" para añadir huecos.'); return; }
      if (outline.length >= 3 && dist(p, outline[0]) < snapR()) { setOutlineClosed(true); return; }
      setOutline([...outline, p]);
    } else if (mode === 'hole') {
      if (curHole.length >= 3 && dist(p, curHole[0]) < snapR()) { setHoles([...holes, curHole]); setCurHole([]); return; }
      setCurHole([...curHole, p]);
    } else if (mode === 'circle') {
      if (!circleCenter) { setCircleCenter(p); return; }
      const r = dist(circleCenter, p);
      if (r > 1) setCircles([...circles, { c: circleCenter, r }]);
      setCircleCenter(null);
    }
  };

  const typeCircle = () => {
    if (!circleCenter || !mmPerPx) return;
    const val = prompt('Diámetro del taladro en mm:');
    const d = parseFloat((val || '').replace(',', '.'));
    if (d > 0) { setCircles([...circles, { c: circleCenter, r: d / 2 / mmPerPx }]); setCircleCenter(null); }
  };

  const undo = () => {
    if (mode === 'circle' && circleCenter) { setCircleCenter(null); return; }
    if (mode === 'hole' && curHole.length) { setCurHole(curHole.slice(0, -1)); return; }
    if (mode === 'circle' && circles.length) { setCircles(circles.slice(0, -1)); return; }
    if (mode === 'hole' && holes.length) { setHoles(holes.slice(0, -1)); return; }
    if (outlineClosed) { setOutlineClosed(false); return; }
    if (outline.length) { setOutline(outline.slice(0, -1)); return; }
    if (calibPts.length) { setCalibPts([]); setMmPerPx(null); setMode('calib'); }
  };

  // ── Generación del 3D ──
  const bbox = () => {
    if (outline.length < 2 || !mmPerPx) return null;
    const xs = outline.map(p => p.x), ys = outline.map(p => p.y);
    return { w: (Math.max(...xs) - Math.min(...xs)) * mmPerPx, h: (Math.max(...ys) - Math.min(...ys)) * mmPerPx };
  };

  const generate = (download = false) => {
    if (!mmPerPx || !outlineClosed || outline.length < 3) {
      alert('Necesitas calibrar la escala y cerrar el contorno exterior.');
      return;
    }
    if (!(thickness > 0)) { alert('Indica un espesor mayor que 0.'); return; }
    const o = outline[0];
    const toMM = (p: Pt) => new THREE.Vector2((p.x - o.x) * mmPerPx, -(p.y - o.y) * mmPerPx);

    const outerPts = outline.map(toMM);
    // Orientación fija del contorno para que los huecos se resten siempre bien
    if (!THREE.ShapeUtils.isClockWise(outerPts)) outerPts.reverse();
    const shape = new THREE.Shape(outerPts);
    for (const h of holes) {
      const hp = h.map(toMM);
      if (THREE.ShapeUtils.isClockWise(hp)) hp.reverse(); // huecos en sentido contrario al contorno
      shape.holes.push(new THREE.Path(hp));
    }
    for (const c of circles) {
      const path = new THREE.Path();
      const cc = toMM(c.c);
      path.absarc(cc.x, cc.y, c.r * mmPerPx, 0, Math.PI * 2, false);
      shape.holes.push(path);
    }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 64 });
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    geo.translate(-(bb.min.x + bb.max.x) / 2, -(bb.min.y + bb.max.y) / 2, -bb.min.z);
    const mesh = new THREE.Mesh(geo);
    const dv = new STLExporter().parse(mesh, { binary: true }) as DataView;
    const buffer = dv.buffer.slice(dv.byteOffset, dv.byteOffset + dv.byteLength) as ArrayBuffer;
    const name = (modelName || 'pieza_plano') + '.stl';
    geo.dispose();

    if (download) {
      const url = URL.createObjectURL(new Blob([buffer], { type: 'model/stl' }));
      const a = document.createElement('a');
      a.href = url; a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } else {
      onGenerate(buffer, name);
    }
  };

  // ── Render ──
  const mm = (pxLen: number) => (mmPerPx ? (pxLen * mmPerPx).toFixed(1) + ' mm' : '');
  const sw = size.w ? size.w / 600 : 2; // grosor de línea proporcional
  const lp = lastPoint();
  const preview = cursor && lp && mode !== 'circle' ? adjust(cursor, lp, false) : cursor;
  const b = bbox();

  const ModeBtn = ({ m, icon, label, disabled }: { m: Mode; icon: React.ReactNode; label: string; disabled?: boolean }) => (
    <button
      onClick={() => { setMode(m); setCircleCenter(null); }}
      disabled={disabled}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-mono font-bold uppercase border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
        mode === m ? 'bg-orange text-white border-orange' : 'bg-surface border-border text-muted hover:text-text'
      }`}
    >
      {icon} {label}
    </button>
  );

  const help: Record<Mode, string> = {
    calib: 'Pincha los dos extremos de una cota conocida y escribe su medida en mm.',
    outline: outlineClosed
      ? 'Contorno cerrado. Añade taladros o agujeros, o genera el 3D.'
      : 'Pincha las esquinas del contorno exterior. Pincha el primer punto para cerrarlo. (Mayús = desactivar recto)',
    hole: 'Pincha las esquinas de un hueco no circular. Pincha su primer punto para cerrarlo.',
    circle: circleCenter ? 'Ahora pincha un punto del borde del taladro (o escribe el diámetro).' : 'Pincha el centro del taladro.',
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-stretch justify-center p-0 sm:p-4">
      <div className="bg-bg border border-border w-full max-w-7xl flex flex-col overflow-hidden">
        {/* Cabecera */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-surface">
          <h2 className="text-xs sm:text-sm font-black uppercase tracking-wider text-text flex items-center gap-2 font-mono">
            <FileText className="w-4 h-4 text-orange" /> Plano PDF → 3D
            {fileName && <span className="text-[9px] text-muted normal-case font-normal truncate max-w-[200px]">{fileName}</span>}
          </h2>
          <button onClick={onClose} className="p-1.5 text-muted hover:text-text cursor-pointer" title="Cerrar"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 flex flex-col lg:flex-row min-h-0">
          {/* Zona del plano */}
          <div className="flex-1 flex flex-col min-h-0 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-b border-border bg-surface2/50">
              <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-mono font-bold uppercase bg-orange text-white hover:bg-orange2 cursor-pointer">
                <FileText className="w-3.5 h-3.5" /> {pdf ? 'Otro PDF' : 'Abrir PDF'}
              </button>
              <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) openPdf(f); }} />
              {pdf && (
                <>
                  <div className="flex items-center border border-border">
                    <button disabled={pageNum <= 1} onClick={() => { setPageNum(pageNum - 1); resetAll(true); }} className="p-1.5 text-muted hover:text-text disabled:opacity-30 cursor-pointer"><ChevronLeft className="w-3.5 h-3.5" /></button>
                    <span className="text-[10px] font-mono px-1">Hoja {pageNum}/{pdf.numPages}</span>
                    <button disabled={pageNum >= pdf.numPages} onClick={() => { setPageNum(pageNum + 1); resetAll(true); }} className="p-1.5 text-muted hover:text-text disabled:opacity-30 cursor-pointer"><ChevronRight className="w-3.5 h-3.5" /></button>
                  </div>
                  <div className="flex items-center border border-border">
                    <button onClick={() => setZoom(z => Math.max(0.15, z / 1.25))} className="p-1.5 text-muted hover:text-text cursor-pointer"><ZoomOut className="w-3.5 h-3.5" /></button>
                    <span className="text-[10px] font-mono w-10 text-center">{Math.round(zoom * 200)}%</span>
                    <button onClick={() => setZoom(z => Math.min(4, z * 1.25))} className="p-1.5 text-muted hover:text-text cursor-pointer"><ZoomIn className="w-3.5 h-3.5" /></button>
                  </div>
                  <span className="w-px h-5 bg-border mx-1" />
                  <ModeBtn m="calib" icon={<Ruler className="w-3.5 h-3.5" />} label="1. Escala" />
                  <ModeBtn m="outline" icon={<PenTool className="w-3.5 h-3.5" />} label="2. Contorno" disabled={!mmPerPx} />
                  <ModeBtn m="circle" icon={<CircleIcon className="w-3.5 h-3.5" />} label="Taladro" disabled={!outlineClosed} />
                  <ModeBtn m="hole" icon={<Square className="w-3.5 h-3.5" />} label="Agujero" disabled={!outlineClosed} />
                  <button onClick={undo} className="flex items-center gap-1 px-2 py-1.5 text-[10px] font-mono uppercase border border-border text-muted hover:text-text cursor-pointer" title="Deshacer"><Undo2 className="w-3.5 h-3.5" /></button>
                  <button onClick={() => confirm('¿Borrar todo lo dibujado (se mantiene la escala)?') && resetAll()} className="flex items-center gap-1 px-2 py-1.5 text-[10px] font-mono uppercase border border-border text-muted hover:text-red-600 cursor-pointer" title="Borrar dibujo"><Trash2 className="w-3.5 h-3.5" /></button>
                  <label className="flex items-center gap-1 text-[10px] font-mono text-muted cursor-pointer ml-1">
                    <input type="checkbox" checked={ortho} onChange={e => setOrtho(e.target.checked)} /> Recto
                  </label>
                </>
              )}
            </div>

            {pdf && (
              <div className="px-3 py-1.5 text-[10px] font-mono text-orange bg-orange/5 border-b border-border flex items-center justify-between gap-2">
                <span>{help[mode]}</span>
                {mode === 'circle' && circleCenter && (
                  <button onClick={typeCircle} className="px-2 py-0.5 border border-orange text-orange hover:bg-orange hover:text-white cursor-pointer uppercase font-bold shrink-0">Escribir Ø</button>
                )}
              </div>
            )}

            <div className="flex-1 overflow-auto bg-[#3a3a3a] min-h-[300px]">
              {!pdf ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 gap-3">
                  <FileText className="w-12 h-12 text-muted" />
                  <p className="text-xs font-mono text-white/80 max-w-md">
                    Abre un plano en PDF. Calibra la escala con una cota, marca el contorno de la pieza y sus taladros, indica el espesor y se genera el modelo 3D.
                  </p>
                  <button onClick={() => fileRef.current?.click()} className="px-4 py-2 text-xs font-mono font-bold uppercase bg-orange text-white hover:bg-orange2 cursor-pointer">Abrir PDF</button>
                </div>
              ) : (
                <div className="relative inline-block m-4" style={{ width: size.w * zoom, height: size.h * zoom }}>
                  <canvas ref={canvasRef} className="absolute inset-0 w-full h-full shadow-lg" />
                  <svg
                    ref={svgRef}
                    viewBox={`0 0 ${size.w || 1} ${size.h || 1}`}
                    className="absolute inset-0 w-full h-full cursor-crosshair"
                    onClick={handleClick}
                    onMouseMove={e => setCursor(toCanvas(e))}
                    onMouseLeave={() => setCursor(null)}
                  >
                    {/* Calibración */}
                    {calibPts.length > 0 && (
                      <g stroke="#2563eb" strokeWidth={sw * 1.5} fill="#2563eb">
                        {calibPts.length === 2 && <line x1={calibPts[0].x} y1={calibPts[0].y} x2={calibPts[1].x} y2={calibPts[1].y} />}
                        {calibPts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={sw * 3} />)}
                      </g>
                    )}
                    {/* Contorno */}
                    {outline.length > 0 && (
                      <g>
                        <polyline
                          points={(outlineClosed ? [...outline, outline[0]] : outline).map(p => `${p.x},${p.y}`).join(' ')}
                          fill={outlineClosed ? 'rgba(234,88,12,0.18)' : 'none'}
                          stroke="#ea580c" strokeWidth={sw * 1.5}
                        />
                        {outline.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={sw * (i === 0 && !outlineClosed ? 4 : 2.5)} fill="#ea580c" />)}
                      </g>
                    )}
                    {/* Agujeros */}
                    {[...holes, curHole].map((h, i) => h.length > 0 && (
                      <g key={'h' + i}>
                        <polyline
                          points={(i < holes.length ? [...h, h[0]] : h).map(p => `${p.x},${p.y}`).join(' ')}
                          fill={i < holes.length ? 'rgba(16,185,129,0.2)' : 'none'} stroke="#059669" strokeWidth={sw * 1.5}
                        />
                        {h.map((p, j) => <circle key={j} cx={p.x} cy={p.y} r={sw * 2.5} fill="#059669" />)}
                      </g>
                    ))}
                    {circles.map((c, i) => (
                      <g key={'c' + i}>
                        <circle cx={c.c.x} cy={c.c.y} r={c.r} fill="rgba(16,185,129,0.2)" stroke="#059669" strokeWidth={sw * 1.5} />
                        <text x={c.c.x} y={c.c.y} fontSize={sw * 10} fill="#059669" textAnchor="middle" dominantBaseline="middle" fontFamily="monospace">Ø{mm(c.r * 2)}</text>
                      </g>
                    ))}
                    {/* Línea elástica de previsualización */}
                    {preview && lp && (
                      mode === 'circle' && circleCenter ? (
                        <circle cx={circleCenter.x} cy={circleCenter.y} r={dist(circleCenter, preview)} fill="none" stroke="#059669" strokeDasharray={`${sw * 4} ${sw * 3}`} strokeWidth={sw} />
                      ) : (
                        <line x1={lp.x} y1={lp.y} x2={preview.x} y2={preview.y} stroke={mode === 'calib' ? '#2563eb' : '#ea580c'} strokeDasharray={`${sw * 4} ${sw * 3}`} strokeWidth={sw} />
                      )
                    )}
                    {preview && lp && mmPerPx && (
                      <text x={preview.x + sw * 8} y={preview.y - sw * 8} fontSize={sw * 11} fill="#111" stroke="#fff" strokeWidth={sw * 3} paintOrder="stroke" fontFamily="monospace" fontWeight="bold">
                        {mode === 'circle' && circleCenter ? 'Ø' + mm(dist(circleCenter, preview) * 2) : mm(dist(lp, preview))}
                      </text>
                    )}
                    {mode === 'circle' && circleCenter && <circle cx={circleCenter.x} cy={circleCenter.y} r={sw * 2.5} fill="#059669" />}
                  </svg>
                </div>
              )}
            </div>
          </div>

          {/* Panel lateral */}
          <div className="lg:w-72 border-t lg:border-t-0 lg:border-l border-border bg-surface p-4 flex flex-col gap-4 font-mono text-[11px]">
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted mb-2">Estado</h3>
              <ul className="space-y-1">
                <li className={mmPerPx ? 'text-emerald-500' : 'text-muted'}>{mmPerPx ? '✓' : '○'} Escala {mmPerPx ? `(1 px = ${mmPerPx.toFixed(4)} mm)` : 'sin calibrar'}</li>
                <li className={outlineClosed ? 'text-emerald-500' : 'text-muted'}>{outlineClosed ? '✓' : '○'} Contorno ({outline.length} puntos{outlineClosed ? ', cerrado' : ''})</li>
                <li className="text-muted">Taladros: {circles.length} · Agujeros: {holes.length}</li>
                {b && <li className="text-text font-bold">Medidas: {b.w.toFixed(1)} × {b.h.toFixed(1)} mm</li>}
              </ul>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted">Espesor / altura (mm)</span>
              <input type="number" min={0.1} step={0.1} value={thickness}
                onChange={e => setThickness(parseFloat(e.target.value))}
                className="bg-surface2 border border-border px-2 py-1.5 text-text" />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted">Nombre del modelo</span>
              <input value={modelName} onChange={e => setModelName(e.target.value.replace(/[^a-zA-Z0-9_-]+/g, '_'))}
                className="bg-surface2 border border-border px-2 py-1.5 text-text" />
            </label>

            <button onClick={() => generate(false)} disabled={!outlineClosed}
              className="flex items-center justify-center gap-2 py-2.5 bg-orange text-white font-bold uppercase tracking-wider hover:bg-orange2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
              <Box className="w-4 h-4" /> Generar 3D en el visor
            </button>
            <button onClick={() => generate(true)} disabled={!outlineClosed}
              className="flex items-center justify-center gap-2 py-2 border border-border text-muted hover:text-text font-bold uppercase tracking-wider cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
              <Download className="w-4 h-4" /> Descargar STL
            </button>

            <p className="text-[9px] text-muted leading-relaxed">
              Consejo: calibra con la cota más larga del plano para tener más precisión. Los puntos se pegan a los ya marcados y con «Recto» las líneas salen horizontales o verticales (Mayús para trazar en diagonal).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
