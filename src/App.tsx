import React, { useState, useEffect, useRef } from 'react';
import { 
  DisplaySettings, 
  ModelStats, 
  PresetModel 
} from './types';
import { STLViewer3D } from './components/STLViewer3D';
import { PdfTo3D } from './components/PdfTo3D';
import { 
  generateCalibrationCube, 
  generateFacetedDiamond, 
  generateRuedaGiratoria 
} from './utils/stlGenerator';
import {
  Upload,
  Layers,
  Settings2,
  Coins,
  Box,
  Info,
  Sparkles,
  RotateCw,
  Grid3X3,
  ExternalLink,
  ChevronRight,
  Printer,
  Compass,
  Database,
  ShieldAlert,
  Cpu,
  ShieldCheck,
  Wrench,
  Download,
  Wind,
  Trash2,
  RotateCcw,
  FileText
} from 'lucide-react';

// IndexedDB helpers for STL file persistence
const DB_NAME = 'stlviewer_db';
const DB_STORE = 'files';

interface StoredFile {
  id: string;
  name: string;
  data: ArrayBuffer;
  savedAt: number;
}

function openStlDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(DB_STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveFileToDB(file: StoredFile): Promise<void> {
  const db = await openStlDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(file);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllFilesFromDB(): Promise<StoredFile[]> {
  const db = await openStlDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readonly');
    const req = tx.objectStore(DB_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function deleteFileFromDB(id: string): Promise<void> {
  const db = await openStlDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function clearAllFilesFromDB(): Promise<void> {
  const db = await openStlDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── Galería "Mis Diseños": los STL se guardan en el repositorio de GitHub (public/models) ──
const GH_OWNER = 'Robertogarciasanz';
const GH_REPO = 'visorstl';
const GH_BRANCH = 'main';
const GH_DIR = 'public/models';
const GH_TOKEN_KEY = 'stlviewer_gh_token';
const GH_API = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${GH_DIR}`;

function loadGhToken(): string {
  try { return localStorage.getItem(GH_TOKEN_KEY) || ''; } catch { return ''; }
}
function saveGhToken(t: string) {
  try { t ? localStorage.setItem(GH_TOKEN_KEY, t) : localStorage.removeItem(GH_TOKEN_KEY); } catch {}
}

function ghHeaders(token?: string): HeadersInit {
  const h: Record<string, string> = { Accept: 'application/vnd.github+json' };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(bin);
}

function cleanFileName(name: string): string {
  const base = name.replace(/\.stl$/i, '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'modelo';
  return base + '.stl';
}

function prettyName(file: string): string {
  return file.replace(/\.stl$/i, '').replace(/[_-]+/g, ' ');
}

async function ghListModels(token?: string): Promise<MyDesign[]> {
  const res = await fetch(`${GH_API}?ref=${GH_BRANCH}&t=${Date.now()}`, { headers: ghHeaders(token), cache: 'no-store' });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const items = await res.json();
  return (Array.isArray(items) ? items : [])
    .filter((it: any) => it.type === 'file' && /\.stl$/i.test(it.name))
    .map((it: any) => ({
      id: it.name,
      name: prettyName(it.name),
      fileName: it.name,
      size: it.size,
      sha: it.sha,
      url: it.download_url,
    }));
}

async function ghUploadModel(token: string, fileName: string, data: ArrayBuffer, existingSha?: string): Promise<void> {
  const res = await fetch(`${GH_API}/${encodeURIComponent(fileName)}`, {
    method: 'PUT',
    headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `Subir ${fileName} desde el visor`,
      content: bufferToBase64(data),
      branch: GH_BRANCH,
      ...(existingSha ? { sha: existingSha } : {}),
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `GitHub ${res.status}`);
  }
}

async function ghDeleteModel(token: string, d: MyDesign): Promise<void> {
  const res = await fetch(`${GH_API}/${encodeURIComponent(d.fileName)}`, {
    method: 'DELETE',
    headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: `Borrar ${d.fileName} desde el visor`, sha: d.sha, branch: GH_BRANCH }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `GitHub ${res.status}`);
  }
}

const PRESETS: PresetModel[] = [
  {
    id: 'rueda_giratoria',
    name: 'Rueda Giratoria con Rodamiento',
    description: 'Rueda de soporte giratorio con horquilla, tornillo, tuerca y rodamiento de bolas, hecha a partir del plano acotado.',
    category: 'Ingeniería'
  },
  {
    id: 'diamond',
    name: 'Gema Brillante Octogonal',
    description: 'Un diamante tallado con facetas planas que reflejan la luz desde múltiples ángulos.',
    category: 'Joyería'
  },
  {
    id: 'cube',
    name: 'Cubo de Calibración 20mm',
    description: 'Un cubo estándar de precisión métrica utilizado para probar tolerancias de impresión.',
    category: 'Ingeniería'
  }
];

interface MyDesign {
  id: string;
  name: string;
  fileName: string;
  size: number;
  sha: string;
  url: string;
}

const FILAMENTS = [
  { name: 'PLA (Ácido Poliláctico)', value: 'PLA', density: 1.24, defaultPrice: 22.0 },
  { name: 'PLA-CF (Fibra de Carbono PLA)', value: 'PLA-CF', density: 1.28, defaultPrice: 29.5 },
  { name: 'PETG-CF (Fibra de Carbono PETG)', value: 'PETG-CF', density: 1.32, defaultPrice: 34.0 },
  { name: 'PA-CF (Fibra de Carbono Nylon)', value: 'PA-CF', density: 1.18, defaultPrice: 45.0 },
  { name: 'ABS (Acrilonitrilo Butadieno Estireno)', value: 'ABS', density: 1.04, defaultPrice: 20.0 },
  { name: 'PETG (Polietileno Tereftalato Glicol)', value: 'PETG', density: 1.27, defaultPrice: 24.0 },
  { name: 'TPU Flexible (Poliuretano Termoplástico)', value: 'TPU', valueLabel: 'TPU', density: 1.21, defaultPrice: 32.0 }
];

const LIGHTS: { name: string; value: DisplaySettings['lighting']; desc: string }[] = [
  { name: 'Estudio de Slicer', value: 'studio', desc: 'Luz ambiental suave con sombras realistas' },
  { name: 'Atardecer Cálido', value: 'sunset', desc: 'Atmósfera dramática con tonos anaranjados y rosados' },
  { name: 'Industrial Frío', value: 'industrial', desc: 'Contraste metálico fuerte con foco frío superior' },
  { name: 'Luz Plana (CAD)', value: 'flat', desc: 'Luz difusa sin sombras para inspección técnica' }
];

// High quality PLA filament colors that look brilliant in WebGL
const COLOR_PRESETS = [
  { name: 'Oro Seda', value: '#d4af37', roughness: 0.18, metalness: 0.90 },
  { name: 'Peltre Plateado', value: '#cbd5e1', roughness: 0.20, metalness: 0.85 },
  { name: 'Naranja PLA', value: '#ea580c', roughness: 0.45, metalness: 0.05 },
  { name: 'Jade Verde', value: '#059669', roughness: 0.40, metalness: 0.10 },
  { name: 'Cobalto Brillante', value: '#1d4ed8', roughness: 0.35, metalness: 0.15 },
  { name: 'Rubí Traslúcido', value: '#e11d48', roughness: 0.25, metalness: 0.30 },
  { name: 'Antracita Mate', value: '#334155', roughness: 0.70, metalness: 0.00 },
  { name: 'Blanco Caliza', value: '#f8fafc', roughness: 0.60, metalness: 0.00 }
];

export default function App() {
  // Current loaded model data as ArrayBuffer
  const [modelBuffer, setModelBuffer] = useState<ArrayBuffer | null>(null);
  const [activePreset, setActivePreset] = useState<string>('rueda_giratoria');
  const [modelName, setModelName] = useState<string>('RuedaGiratoria.stl');
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [isLoadingDesign, setIsLoadingDesign] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [savedFiles, setSavedFiles] = useState<StoredFile[]>([]);
  const [showPdfTool, setShowPdfTool] = useState<boolean>(false);
  const [designs, setDesigns] = useState<MyDesign[]>([]);
  const [designsStatus, setDesignsStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [ghToken, setGhToken] = useState<string>(() => loadGhToken());
  const [isUploadingWeb, setIsUploadingWeb] = useState<boolean>(false);
  const webUploadRef = useRef<HTMLInputElement>(null);

  const refreshDesigns = async () => {
    setDesignsStatus('loading');
    try {
      setDesigns(await ghListModels(ghToken || undefined));
      setDesignsStatus('ok');
    } catch {
      setDesignsStatus('error');
    }
  };

  const askToken = () => {
    const t = prompt(
      'Pega tu token de GitHub (fine-grained, solo para el repositorio visorstl, permiso "Contents: Read and write").\n' +
      'Se guarda solo en este navegador.',
      ghToken
    );
    if (t === null) return;
    const clean = t.trim();
    setGhToken(clean);
    saveGhToken(clean);
  };

  const logoutToken = () => {
    if (!confirm('¿Quitar el token de este navegador? Dejarás de poder subir o borrar en la web.')) return;
    setGhToken('');
    saveGhToken('');
  };

  const publishToWeb = async (files: { name: string; data: ArrayBuffer }[]) => {
    if (!ghToken) { askToken(); return; }
    setIsUploadingWeb(true);
    const errors: string[] = [];
    let current = designs;
    try { current = await ghListModels(ghToken); } catch {}
    for (const f of files) {
      const fileName = cleanFileName(f.name);
      const existing = current.find(d => d.fileName.toLowerCase() === fileName.toLowerCase());
      if (existing && !confirm(`"${fileName}" ya existe en la web. ¿Reemplazarlo?`)) continue;
      try {
        await ghUploadModel(ghToken, existing ? existing.fileName : fileName, f.data, existing?.sha);
      } catch (e: any) {
        errors.push(`${fileName}: ${e.message}`);
      }
    }
    setIsUploadingWeb(false);
    await refreshDesigns();
    if (errors.length) alert('No se pudieron subir:\n' + errors.join('\n') + '\n\nRevisa que el token sea válido y tenga permiso de escritura.');
  };

  const handleWebUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list: File[] = [];
    const fl = e.target.files;
    if (fl) for (let i = 0; i < fl.length; i++) if (fl[i].name.toLowerCase().endsWith('.stl')) list.push(fl[i]);
    e.target.value = '';
    if (!list.length) { alert('Selecciona archivos con extensión .stl'); return; }
    Promise.all(list.map(f => f.arrayBuffer().then(data => ({ name: f.name, data }))))
      .then(publishToWeb);
  };

  const deleteDesign = async (d: MyDesign) => {
    if (!ghToken) { askToken(); return; }
    if (!confirm(`¿Borrar "${d.fileName}" de la web? Se quitará para todos los visitantes.`)) return;
    try {
      await ghDeleteModel(ghToken, d);
      setDesigns(prev => prev.filter(x => x.id !== d.id));
    } catch (e: any) {
      alert('No se pudo borrar: ' + e.message);
      refreshDesigns();
    }
  };

  const handlePdfModel = (buffer: ArrayBuffer, name: string) => {
    setModelBuffer(buffer);
    setModelName(name);
    setActivePreset('');
    setModelScale(100);
    setShowPdfTool(false);
    saveFileToDB({ id: `${name}_${buffer.byteLength}_${Date.now()}`, name, data: buffer.slice(0), savedAt: Date.now() })
      .then(() => getAllFilesFromDB())
      .then(files => setSavedFiles(files))
      .catch(() => {});
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteSavedFile = (file: StoredFile) => {
    if (!confirm(`¿Borrar "${file.name}" de los modelos guardados?`)) return;
    deleteFileFromDB(file.id)
      .then(() => setSavedFiles(prev => prev.filter(f => f.id !== file.id)))
      .catch(() => alert('No se pudo borrar el archivo.'));
  };

  const deleteAllSavedFiles = () => {
    if (!confirm(`¿Borrar los ${savedFiles.length} modelos guardados? Esta acción no se puede deshacer.`)) return;
    clearAllFilesFromDB()
      .then(() => setSavedFiles([]))
      .catch(() => alert('No se pudieron borrar los archivos.'));
  };

  // Display and rendering configuration
  const [settings, setSettings] = useState<DisplaySettings>({
    color: '#d4af37', // Gold silk default
    roughness: 0.18,
    metalness: 0.90,
    mode: 'solid',
    showGrid: true,
    showAxes: true,
    autoRotate: false,
    showBoundingBox: false,
    projection: 'perspective',
    lighting: 'studio',
    gridSize: 50,
    gridDivisions: 50
  });

  // Physically integrated stats from the 3D geometry
  const [stats, setStats] = useState<ModelStats | null>(null);
  const [modelScale, setModelScale] = useState<number>(100);

  // 3D Printing / Slicing simulator state
  const [selectedFilament, setSelectedFilament] = useState<string>('PLA');
  const [density, setDensity] = useState<number>(1.24);
  const [spoolPrice, setSpoolPrice] = useState<number>(25.0); // €/spool
  const [spoolWeight, setSpoolWeight] = useState<number>(1000); // grams per spool
  const [infill, setInfill] = useState<number>(20); // 10% - 100% infill percentage
  const [layersCount, setLayersCount] = useState<number>(0);
  const [layerHeight, setLayerHeight] = useState<number>(0.2); // 0.2mm standard
  
  // Custom sidebar active tab
  const [activeTab, setActiveTab] = useState<'material' | 'helpers' | 'slicer' | 'elegoo'>('material');

  // Load the caster wheel assembly as default initial geometry on mounting
  useEffect(() => {
    loadPreset('rueda_giratoria');
    getAllFilesFromDB().then(files => setSavedFiles(files)).catch(() => {});
    refreshDesigns();
  }, []);

  // Update density and default price whenever filament type changes
  useEffect(() => {
    const fObj = FILAMENTS.find(f => f.value === selectedFilament);
    if (fObj) {
      setDensity(fObj.density);
      setSpoolPrice(fObj.defaultPrice);
    }
  }, [selectedFilament]);

  // Estimate 3D printing layers when model bounding height or layer height changes
  useEffect(() => {
    if (stats) {
      const scaledHeight = stats.boundingBox.height * (modelScale / 100);
      const calculatedLayers = Math.max(1, Math.ceil(scaledHeight / layerHeight));
      setLayersCount(calculatedLayers);
    }
  }, [stats, layerHeight, modelScale]);

  const loadPreset = (presetId: string) => {
    let buffer: ArrayBuffer;
    let name = '';
    
    if (presetId === 'cube') {
      buffer = generateCalibrationCube();
      name = 'CalibrationCube_20mm.stl';
      // Adjust color & material to a cool slate matte engineering PLA
      setSettings(prev => ({
        ...prev,
        color: '#475569',
        roughness: 0.65,
        metalness: 0.05
      }));
    } else if (presetId === 'diamond') {
      buffer = generateFacetedDiamond();
      name = 'FacetedDiamond_25mm.stl';
      // Adjust color to ruby gemstone style
      setSettings(prev => ({
        ...prev,
        color: '#e11d48',
        roughness: 0.20,
        metalness: 0.40
      }));
    } else {
      buffer = generateRuedaGiratoria();
      name = 'RuedaGiratoria.stl';
      // Cada pieza lleva su color en el STL: sin tinte (blanco) y poco metálico para que se vean
      setSettings(prev => ({
        ...prev,
        color: '#ffffff',
        roughness: 0.45,
        metalness: 0.15
      }));
    }

    setModelBuffer(buffer);
    setModelName(name);
    setActivePreset(presetId);
    setModelScale(100);
  };

  const loadMyDesign = async (design: MyDesign) => {
    setIsLoadingDesign(true);
    setActivePreset(design.id);
    try {
      const res = await fetch(design.url, { cache: 'no-store' });
      if (!res.ok) throw new Error();
      const buffer = await res.arrayBuffer();
      setModelBuffer(buffer);
      setModelName(design.fileName);
      setModelScale(100);
    } catch {
      alert('No se pudo cargar el diseño.');
    } finally {
      setIsLoadingDesign(false);
    }
  };

  // Process standard STL file inputs
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      readSTLFile(files[0]);
    }
    e.target.value = '';
  };

  const readSTLFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.stl')) {
      alert('Por favor selecciona un archivo con extensión .stl');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target?.result as ArrayBuffer;
      if (buffer) {
        setModelBuffer(buffer);
        setModelName(file.name);
        setActivePreset(''); // Clear preset highlight
        setModelScale(100);
        const entry: StoredFile = {
          id: `${file.name}_${file.size}`,
          name: file.name,
          data: buffer.slice(0),
          savedAt: Date.now(),
        };
        saveFileToDB(entry)
          .then(() => getAllFilesFromDB())
          .then(files => setSavedFiles(files))
          .catch(() => {});
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      readSTLFile(files[0]);
    }
  };

  const applyElegooPreset = (type: 'placf' | 'petgcf' | 'pacf') => {
    if (type === 'placf') {
      setSelectedFilament('PLA-CF');
      setSettings(prev => ({
        ...prev,
        color: '#272d37', // Matte Anthracite Carbon
        roughness: 0.85,
        metalness: 0.15
      }));
      setInfill(30);
      setLayerHeight(0.20);
    } else if (type === 'petgcf') {
      setSelectedFilament('PETG-CF');
      setSettings(prev => ({
        ...prev,
        color: '#111827', // Dark Carbon Coal
        roughness: 0.82,
        metalness: 0.22
      }));
      setInfill(40);
      setLayerHeight(0.16);
    } else if (type === 'pacf') {
      setSelectedFilament('PA-CF');
      setSettings(prev => ({
        ...prev,
        color: '#1e293b', // Graphite Nylon Matte
        roughness: 0.90,
        metalness: 0.05
      }));
      setInfill(50);
      setLayerHeight(0.12);
    }
  };

  // Calculate adjusted physical weight given infill ratio
  // Standard approximation: infill scales weight since walls are thin
  // Typical calculation accounts that an FDM shell is around 10-15% volume, infill applies to inner 85%.
  // We can model this linearly as: weight = raw_solid_weight * (0.2 + (0.8 * infill / 100))
  const getAdjustedWeightAndValue = () => {
    if (!stats) return { weight: 0, cost: 0, length: 0 };
    
    // Scale factor cubed for 3D physical volume
    const scaleFactorCube = Math.pow(modelScale / 100, 3);
    const infillRatio = 0.2 + (0.8 * (infill / 100)); // factor for solid walls + infill core
    const adjustedWeight = stats.estimatedWeight * infillRatio * scaleFactorCube;
    
    const calculatedCost = (adjustedWeight / spoolWeight) * spoolPrice;
    
    // Total filament length based on diameter & density
    const adjustedLength = stats.filamentLength * infillRatio * scaleFactorCube;
    
    return {
      weight: Math.max(0.1, adjustedWeight),
      cost: Math.max(0.01, calculatedCost),
      length: Math.max(0.1, adjustedLength)
    };
  };

  const scaledWidth = stats ? stats.boundingBox.width * (modelScale / 100) : 0;
  const scaledHeight = stats ? stats.boundingBox.height * (modelScale / 100) : 0;
  const scaledDepth = stats ? stats.boundingBox.depth * (modelScale / 100) : 0;
  const scaledVolume = stats ? stats.volume * Math.pow(modelScale / 100, 3) : 0;
  const scaledSurfaceArea = stats ? stats.surfaceArea * Math.pow(modelScale / 100, 2) : 0;
  const isOverBedLimit = stats ? (scaledWidth > 250 || scaledDepth > 250) : false;

  const { weight: estimatedWeight, cost: estimatedCost, length: estimatedLength } = getAdjustedWeightAndValue();

  // Helper trigger to download standard models directly from memory
  const downloadSTL = () => {
    if (!modelBuffer) return;
    const blob = new Blob([modelBuffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = modelName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div id="app-root" className="relative min-h-screen bg-bg text-text flex flex-col font-sans selection:bg-orange/20 selection:text-orange overflow-x-hidden">
      
      {showPdfTool && <PdfTo3D onClose={() => setShowPdfTool(false)} onGenerate={handlePdfModel} />}

      {/* Absolute decorative back lettering */}
      <div className="absolute top-[-10px] left-[-10px] sm:top-[-40px] sm:left-[-20px] text-[120px] sm:text-[320px] font-black text-border/30 leading-none select-none pointer-events-none uppercase italic overflow-hidden hidden sm:block">Mesh</div>
      
      {/* 1. Global Navigation/Header bar */}
      <header className="border-b border-border bg-surface/90 backdrop-blur-md px-3 py-2 sm:px-6 sm:py-3.5 flex flex-row items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <div className="bg-orange text-white p-1.5 rounded-none shadow-md shadow-orange/10 shrink-0">
            <Box className="w-4 h-4 stroke-[2]" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-black tracking-tight text-text uppercase italic leading-none">
              Visor:STL
            </h1>
            <span className="text-[7.5px] tracking-[0.2em] font-mono font-bold text-muted uppercase leading-none mt-0.5 hidden xs:block">Roberto Garcia Sanz</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 font-mono">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 sm:px-4 sm:py-2 bg-orange hover:bg-orange2 active:translate-y-0.5 text-white text-[9.5px] sm:text-xs font-bold uppercase tracking-wider rounded-none shadow-md transition-all cursor-pointer font-semibold shrink-0"
          >
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">Subir STL</span>
            <span className="xs:hidden">Subir</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".stl"
            onChange={handleFileChange}
            className="hidden"
          />
          {modelBuffer && (
            <button
              onClick={downloadSTL}
              className="flex items-center justify-center gap-1.5 px-2 py-1.5 sm:px-3 sm:py-2 bg-surface border border-border hover:bg-surface2 text-text text-[9.5px] sm:text-xs font-bold uppercase tracking-wider rounded-none transition-all cursor-pointer font-semibold shrink-0"
              title="Exportar archivo STL activo"
            >
              Exportar
            </button>
          )}
        </div>
      </header>

      {/* 2. Main content grids */}
      <main className="flex-grow p-3 sm:p-4 lg:p-6 lg:max-w-[1600px] lg:mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 relative z-10">
        
        {/* LEFT SECTION: 3D model viewport + Dropzone + Built-in Presets */}
        <div className="lg:col-span-8 flex flex-col gap-4 sm:gap-5">
          
          {/* A. The Core 3D Viewer Container */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative w-full h-[260px] sm:h-[460px] rounded-none flex flex-col transition-all duration-350 border border-border bg-surface ${
              isDragOver ? 'ring-2 ring-orange ring-offset-4 ring-offset-bg scale-[0.995]' : ''
            }`}
          >
            {/* Drag file transparent instruction layer */}
            {isDragOver && (
              <div className="absolute inset-0 bg-bg/95 backdrop-blur-md z-30 flex flex-col items-center justify-center border-2 border-dashed border-orange text-center m-2 rounded-none pointer-events-none">
                <Upload className="w-16 h-16 text-orange animate-bounce mb-3" />
                <h3 className="text-lg font-mono font-bold text-text uppercase tracking-wider">SOLTAR ARCHIVO .STL</h3>
                <p className="text-xs font-mono text-muted mt-2">Cargando malla tridimensional en tiempo real.</p>
              </div>
            )}

            <STLViewer3D 
              modelData={modelBuffer} 
              settings={settings} 
              onModelLoaded={(loadedStats) => setStats(loadedStats)} 
              modelScale={modelScale}
            />
          </div>

          {/* B. Drag and Drop CTA and File Name Info */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-3.5 rounded-none border border-dashed border-border bg-surface">
            <div className="flex items-center gap-3.5">
              <div className="bg-surface2 p-2.5 rounded-none border border-border text-muted">
                <Database className="w-3.5 h-3.5" />
              </div>
              <div className="text-left">
                <p className="text-xs font-mono font-bold text-text flex items-center gap-1.5 uppercase">
                  Archivo activo: <span className="text-orange break-all select-all font-semibold italic">{modelName}</span>
                </p>
                <p className="text-[9px] text-muted mt-0.5 font-mono">Suelta archivos .stl en el visor o elígelos localmente.</p>
              </div>
            </div>
            
            <button
               onClick={() => fileInputRef.current?.click()}
               className="text-[10px] sm:text-xs font-mono font-bold text-orange hover:text-orange2 flex items-center gap-1 transition-all group shrink-0 uppercase tracking-wider cursor-pointer"
            >
              Examinar local <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>

          {/* C. Preset models triggers */}
          <div className="bg-surface border border-border rounded-none p-4">
            <div className="flex items-center justify-between mb-3 border-b border-border/60 pb-2 flex-wrap gap-2">
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted flex items-center gap-2 font-mono">
                <span className="w-1.5 h-1.5 bg-orange rounded-full"></span> Modelos de Prueba
              </h2>
              <span className="text-[8px] font-mono text-muted uppercase bg-surface2 px-1.5 py-0.5 border border-border/40">PRESETS.CONF</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3.5">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => loadPreset(p.id)}
                  className={`group relative text-left p-2.5 sm:p-3.5 rounded-none border transition-all duration-200 flex flex-col justify-between h-20 sm:h-28 cursor-pointer ${
                    activePreset === p.id 
                      ? 'bg-surface2 border-orange shadow-md shadow-orange/5' 
                      : 'bg-surface hover:bg-surface2/50 border-border'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[8px] bg-surface2 text-muted px-1.5 py-0.5 rounded-none font-mono uppercase tracking-wider border border-border/40">{p.category}</span>
                      <ChevronRight className={`w-3 h-3 transition-transform duration-200 ${activePreset === p.id ? 'text-orange translate-x-0.5' : 'text-muted group-hover:text-text'}`} />
                    </div>
                    <h3 className="text-[10px] sm:text-xs font-bold text-text mt-1.5 group-hover:text-orange transition-colors uppercase font-mono line-clamp-1">{p.name}</h3>
                    <p className="text-[9px] text-muted line-clamp-1 sm:line-clamp-2 mt-0.5 font-mono leading-normal">{p.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* My Designs (guardados en la web) */}
          <div className="bg-surface border border-border rounded-none p-4">
            <div className="flex items-center justify-between mb-3 border-b border-border/60 pb-2 flex-wrap gap-2">
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted flex items-center gap-2 font-mono">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span> Mis Diseños
                <span className="text-[8px] font-mono text-muted normal-case tracking-normal">({designs.length})</span>
              </h2>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() => (ghToken ? webUploadRef.current?.click() : askToken())}
                  disabled={isUploadingWeb}
                  className="flex items-center gap-1 text-[9px] font-mono font-bold uppercase px-2 py-1 bg-emerald-600 text-white hover:bg-emerald-500 cursor-pointer transition-colors disabled:opacity-60"
                  title="Subir archivos STL a la web"
                >
                  <Upload className="w-3 h-3" /> {isUploadingWeb ? 'Subiendo...' : 'Subir a la web'}
                </button>
                <input ref={webUploadRef} type="file" accept=".stl" multiple onChange={handleWebUpload} className="hidden" />
                <button
                  onClick={refreshDesigns}
                  className="p-1 border border-border text-muted hover:text-emerald-500 hover:border-emerald-500 cursor-pointer transition-colors"
                  title="Actualizar lista"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
                <button
                  onClick={ghToken ? logoutToken : askToken}
                  className={`flex items-center gap-1 text-[8px] font-mono uppercase px-1.5 py-1 border cursor-pointer transition-colors ${ghToken ? 'border-emerald-500/50 text-emerald-500' : 'border-border text-muted hover:text-text'}`}
                  title={ghToken ? 'Modo gestión activo — pulsa para quitar el token' : 'Introducir token de GitHub para subir y borrar'}
                >
                  {ghToken ? <ShieldCheck className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />} {ghToken ? 'Gestión' : 'Acceso'}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3.5">
              {designs.map((d) => (
                <div
                  key={d.id}
                  className={`group relative text-left rounded-none border transition-all duration-200 flex flex-col justify-between h-20 sm:h-28 overflow-hidden ${
                    activePreset === d.id
                      ? 'bg-surface2 border-emerald-500 shadow-md shadow-emerald-500/5'
                      : 'bg-surface hover:bg-surface2/50 border-border'
                  } ${isLoadingDesign ? 'opacity-60' : ''}`}
                >
                  <button
                    onClick={() => loadMyDesign(d)}
                    disabled={isLoadingDesign}
                    className="flex-1 text-left p-2.5 sm:p-3.5 flex flex-col gap-1 cursor-pointer w-full"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[8px] bg-surface2 text-muted px-1.5 py-0.5 rounded-none font-mono uppercase tracking-wider border border-border/40">{(d.size / 1024).toFixed(0)} KB</span>
                      <ChevronRight className={`w-3 h-3 transition-transform duration-200 ${activePreset === d.id ? 'text-emerald-500 translate-x-0.5' : 'text-muted group-hover:text-text'}`} />
                    </div>
                    <h3 className="text-[10px] sm:text-xs font-bold text-text group-hover:text-emerald-500 transition-colors uppercase font-mono line-clamp-2 break-all">{d.name}</h3>
                    {isLoadingDesign && activePreset === d.id && (
                      <span className="text-[8px] font-mono text-emerald-500 animate-pulse">Cargando...</span>
                    )}
                  </button>
                  <a
                    href={d.url}
                    download={d.fileName}
                    onClick={(e) => e.stopPropagation()}
                    title="Descargar STL"
                    className="absolute bottom-2 right-2 p-1 rounded-none bg-surface2 border border-border text-muted hover:text-emerald-500 hover:border-emerald-500 transition-colors"
                  >
                    <Download className="w-3 h-3" />
                  </a>
                  {ghToken && (
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteDesign(d); }}
                      title="Borrar de la web"
                      className="absolute bottom-2 right-9 p-1 rounded-none bg-surface2 border border-border text-muted hover:text-red-600 hover:border-red-300 cursor-pointer transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
              {designs.length === 0 && (
                <p className="col-span-2 sm:col-span-3 text-[9px] text-muted font-mono py-3">
                  {designsStatus === 'loading' && 'Cargando diseños...'}
                  {designsStatus === 'error' && 'No se pudo cargar la lista de diseños. Pulsa actualizar para reintentar.'}
                  {designsStatus === 'ok' && 'No hay diseños en la galería. Pulsa «Subir a la web» para añadir uno.'}
                </p>
              )}
            </div>
          </div>

          {/* Generators / Tools */}
          <div className="bg-surface border border-border rounded-none p-4">
            <div className="flex items-center justify-between mb-3 border-b border-border/60 pb-2 flex-wrap gap-2">
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted flex items-center gap-2 font-mono">
                <span className="w-1.5 h-1.5 bg-[#7a5cff] rounded-full"></span> Herramientas STL
              </h2>
              <span className="text-[8px] font-mono text-muted uppercase bg-surface2 px-1.5 py-0.5 border border-border/40">TOOLS.GEN</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3.5">
              <button
                onClick={() => setShowPdfTool(true)}
                className="group relative text-left p-2.5 sm:p-3.5 rounded-none border border-orange/50 bg-surface hover:bg-surface2/50 hover:border-orange transition-all duration-200 flex flex-col justify-between h-20 sm:h-28 cursor-pointer sm:col-span-2"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[8px] bg-surface2 text-muted px-1.5 py-0.5 rounded-none font-mono uppercase tracking-wider border border-border/40">Plano PDF</span>
                    <ChevronRight className="w-3 h-3 text-muted group-hover:text-orange transition-colors" />
                  </div>
                  <h3 className="text-[10px] sm:text-xs font-bold text-text mt-1.5 group-hover:text-orange transition-colors uppercase font-mono line-clamp-1 flex items-center gap-1.5">
                    <FileText className="w-3 h-3 shrink-0" /> Plano PDF → 3D
                  </h3>
                  <p className="text-[9px] text-muted line-clamp-1 sm:line-clamp-2 mt-0.5 font-mono leading-normal">Abre un plano en PDF, toma la escala de una cota, marca el contorno y los taladros y genera la pieza 3D con su espesor.</p>
                </div>
              </button>
              <a
                href={import.meta.env.BASE_URL + 'abanico_generador.html'}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative text-left p-2.5 sm:p-3.5 rounded-none border border-border bg-surface hover:bg-surface2/50 hover:border-[#7a5cff] transition-all duration-200 flex flex-col justify-between h-20 sm:h-28 no-underline"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[8px] bg-surface2 text-muted px-1.5 py-0.5 rounded-none font-mono uppercase tracking-wider border border-border/40">Calado PETG</span>
                    <ExternalLink className="w-3 h-3 text-muted group-hover:text-[#7a5cff] transition-colors" />
                  </div>
                  <h3 className="text-[10px] sm:text-xs font-bold text-text mt-1.5 group-hover:text-[#7a5cff] transition-colors uppercase font-mono line-clamp-1 flex items-center gap-1.5">
                    <Wind className="w-3 h-3 shrink-0" /> Abanico Calado
                  </h3>
                  <p className="text-[9px] text-muted line-clamp-1 sm:line-clamp-2 mt-0.5 font-mono leading-normal">Sube una foto, ajusta umbral y genera palas STL caladas en ZIP listas para imprimir.</p>
                </div>
              </a>
              <a
                href={import.meta.env.BASE_URL + 'abanico_marqueteria.html'}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative text-left p-2.5 sm:p-3.5 rounded-none border border-border bg-surface hover:bg-surface2/50 hover:border-[#7a5cff] transition-all duration-200 flex flex-col justify-between h-20 sm:h-28 no-underline"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[8px] bg-surface2 text-muted px-1.5 py-0.5 rounded-none font-mono uppercase tracking-wider border border-border/40">Marquetería</span>
                    <ExternalLink className="w-3 h-3 text-muted group-hover:text-[#7a5cff] transition-colors" />
                  </div>
                  <h3 className="text-[10px] sm:text-xs font-bold text-text mt-1.5 group-hover:text-[#7a5cff] transition-colors uppercase font-mono line-clamp-1 flex items-center gap-1.5">
                    <Wind className="w-3 h-3 shrink-0" /> Abanico Marquetería
                  </h3>
                  <p className="text-[9px] text-muted line-clamp-1 sm:line-clamp-2 mt-0.5 font-mono leading-normal">Retrato tallado en medallón ovalado con líneas de marquetería. Guardas macizas a los lados.</p>
                </div>
              </a>
              <a
                href={import.meta.env.BASE_URL + 'descargas/Rueda_giratoria_v1.bas'}
                download="Rueda_giratoria_v1.bas"
                className="group relative text-left p-2.5 sm:p-3.5 rounded-none border border-border bg-surface hover:bg-surface2/50 hover:border-orange transition-all duration-200 flex flex-col justify-between h-20 sm:h-28 no-underline"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[8px] bg-surface2 text-muted px-1.5 py-0.5 rounded-none font-mono uppercase tracking-wider border border-border/40">Macro VBA</span>
                    <Download className="w-3 h-3 text-muted group-hover:text-orange transition-colors" />
                  </div>
                  <h3 className="text-[10px] sm:text-xs font-bold text-text mt-1.5 group-hover:text-orange transition-colors uppercase font-mono line-clamp-1 flex items-center gap-1.5">
                    <Wrench className="w-3 h-3 shrink-0" /> Rueda giratoria
                  </h3>
                  <p className="text-[9px] text-muted line-clamp-1 sm:line-clamp-2 mt-0.5 font-mono leading-normal">Macro de SolidWorks (.bas): crea 8 piezas sueltas y el conjunto de la rueda con rodamiento de bolas.</p>
                </div>
              </a>
            </div>
          </div>

          {/* Saved Files from IndexedDB */}
          {savedFiles.length > 0 && (
            <div className="bg-surface border border-border rounded-none p-3.5">
              <div className="flex items-center justify-between mb-2.5 border-b border-border/60 pb-2">
                <h2 className="text-xs font-bold uppercase tracking-widest text-muted flex items-center gap-2 font-mono">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span> Modelos Guardados
                </h2>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-mono text-muted uppercase">{savedFiles.length} archivo{savedFiles.length !== 1 ? 's' : ''}</span>
                  <button
                    onClick={deleteAllSavedFiles}
                    className="flex items-center gap-1 text-[9px] font-mono uppercase px-1.5 py-0.5 border border-border text-muted hover:text-red-600 hover:border-red-300 cursor-pointer transition-colors"
                    title="Borrar todos los modelos guardados"
                  >
                    <Trash2 className="w-3 h-3" /> Borrar todos
                  </button>
                </div>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
                {[...savedFiles].sort((a, b) => b.savedAt - a.savedAt).map(file => (
                  <div key={file.id} className="flex-shrink-0 flex flex-col gap-1.5 bg-surface2 border border-border p-2 w-[130px]">
                    <div className="flex items-start gap-1.5">
                      <Database className="w-3 h-3 text-orange shrink-0 mt-0.5" />
                      <span className="text-[9px] font-mono text-text font-bold leading-tight line-clamp-2 break-all">{file.name}</span>
                    </div>
                    <span className="text-[8px] font-mono text-muted">
                      {new Date(file.savedAt).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                    </span>
                    <div className="flex gap-1 mt-0.5">
                      <button
                        onClick={() => {
                          setModelBuffer(file.data.slice(0));
                          setModelName(file.name);
                          setActivePreset('');
                          setModelScale(100);
                        }}
                        className="flex-1 py-1.5 text-[9px] font-mono font-bold bg-orange text-white uppercase tracking-wider cursor-pointer text-center hover:bg-orange2 transition-colors"
                      >
                        Cargar
                      </button>
                      {ghToken && (
                        <button
                          onClick={() => publishToWeb([{ name: file.name, data: file.data.slice(0) }])}
                          disabled={isUploadingWeb}
                          className="px-2 py-1.5 bg-surface border border-border text-muted hover:text-emerald-500 hover:border-emerald-500 cursor-pointer transition-colors flex items-center disabled:opacity-60"
                          title="Publicar en Mis Diseños (web)"
                        >
                          <Upload className="w-3 h-3" />
                        </button>
                      )}
                      <button
                        onClick={() => deleteSavedFile(file)}
                        className="px-2 py-1.5 bg-surface border border-border text-muted hover:text-red-600 hover:border-red-300 cursor-pointer transition-colors flex items-center"
                        title="Borrar archivo guardado"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* D. Descriptive info card about STL files */}
          <details className="group bg-surface border border-border rounded-none p-3.5 transition-all text-left">
            <summary className="list-none flex items-center justify-between text-xs font-mono font-bold text-text uppercase tracking-wider cursor-pointer select-none">
              <span className="flex items-center gap-2">
                <Info className="w-4 h-4 text-orange" />
                ¿Qué son los archivos STL?
              </span>
              <ChevronRight className="w-4 h-4 text-muted group-open:rotate-90 transition-transform duration-250" />
            </summary>
            <div className="mt-2.5 border-t border-border/60 pt-2.5">
              <p className="text-[10px] sm:text-[11px] text-muted leading-relaxed font-mono">
                La extensión <strong className="text-text">STL (Stereolithography)</strong> codifica la geometría tridimensional mediante una malla de triángulos. Todo el procesamiento y análisis se realiza de forma 100% local y privada en tu navegador.
              </p>
            </div>
          </details>

        </div>

        {/* RIGHT SECTION: Modular sidebar config (Layout, helpers, cost estimations) */}
        <div className="lg:col-span-4 flex flex-col gap-5 sm:gap-6 font-mono col-span-1">

          {/* Model Statistics Panel */}
          <div className="bg-surface border border-border rounded-none overflow-hidden shadow-lg">
            <div className="bg-surface2 border-b border-border px-4 py-3.5 flex items-center justify-between">
              <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-text flex items-center gap-2">
                <Box className="w-4 h-4 text-orange" /> Métricas y Geometría 3D
              </h3>
              <span className="text-[9px] font-mono bg-orange/10 text-orange border border-orange/20 px-2 py-0.5 rounded-none font-bold uppercase tracking-widest">Inspección</span>
            </div>

            <div className="p-4 space-y-4">
              {stats ? (
                <>
                  {/* Escalar Modelo Control Slider */}
                  <div className="bg-surface2/60 border border-border p-3.5 rounded-none">
                    <div className="flex justify-between items-center text-[10px] uppercase font-bold text-muted tracking-wider mb-2 font-mono">
                      <span>Escalar Modelo (Tamaño)</span>
                      <span className="text-orange font-bold font-mono bg-orange/10 px-2 py-0.5 border border-orange/15">{modelScale}%</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="10"
                        max="300"
                        step="5"
                        value={modelScale}
                        onChange={(e) => setModelScale(parseInt(e.target.value))}
                        className="w-full accent-orange h-1 bg-surface border border-border/10 rounded-none cursor-pointer"
                      />
                      <button 
                        onClick={() => setModelScale(100)}
                        className="px-2.5 py-1 border border-border bg-surface hover:bg-surface2 text-[9px] font-mono text-muted uppercase shrink-0 hover:text-text cursor-pointer transition-colors"
                        title="Restaurar a escala original 1:1"
                      >
                        1:1
                      </button>
                    </div>
                    <p className="text-[9px] text-muted font-mono leading-tight mt-2">
                      Usa la barra para ampliar o reducir. La base de impresión de tu máquina es de <strong>250×250 mm</strong>.
                    </p>
                  </div>

                  {/* Limit alert marker */}
                  {isOverBedLimit && (
                    <div className="bg-red-50/90 border border-red-200 p-3.5 rounded-none text-left flex gap-3 text-red-650">
                      <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5 text-red-650" />
                      <div>
                        <h4 className="text-[10px] font-mono font-bold uppercase tracking-wider text-red-700">¡Fuera de Límites!</h4>
                        <p className="text-[10px] leading-relaxed font-sans text-red-650 mt-1">
                          Las dimensiones ({scaledWidth.toFixed(1)} × {scaledDepth.toFixed(1)} mm) exceden el límite de la base de tu impresora 3D (<strong>250 × 250 mm</strong>). El modelo se saldrá de la cama de trabajo.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Bounding Box Info */}
                  <div>
                    <p className="text-[9px] font-mono font-bold uppercase tracking-wider text-muted mb-1.5">Caja de Contención (Bounding Box)</p>
                    <div className="grid grid-cols-3 gap-2.5 text-center">
                      <div className="bg-surface2 p-2 rounded-none border border-border">
                        <span className="text-[9px] font-mono text-muted block mb-0.5">X-ANCHO</span>
                        <strong className={`text-sm font-mono ${scaledWidth > 250 ? 'text-red-600 font-bold' : 'text-text'}`}>
                          {scaledWidth.toFixed(1)}
                        </strong>
                        <span className="text-[9px] font-mono text-muted ml-0.5">mm</span>
                        {modelScale !== 100 && (
                          <span className="text-[8px] font-mono text-muted block mt-0.5 border-t border-border/40 pt-0.5">
                            Orig: {stats.boundingBox.width.toFixed(1)}
                          </span>
                        )}
                      </div>
                      <div className="bg-surface2 p-2 rounded-none border border-border">
                        <span className="text-[9px] font-mono text-muted block mb-0.5">Y-ALTO</span>
                        <strong className="text-sm font-mono text-text">{scaledHeight.toFixed(1)}</strong>
                        <span className="text-[9px] font-mono text-muted ml-0.5">mm</span>
                        {modelScale !== 100 && (
                          <span className="text-[8px] font-mono text-muted block mt-0.5 border-t border-border/40 pt-0.5">
                            Orig: {stats.boundingBox.height.toFixed(1)}
                          </span>
                        )}
                      </div>
                      <div className="bg-surface2 p-2 rounded-none border border-border">
                        <span className="text-[9px] font-mono text-muted block mb-0.5">Z-LARGO</span>
                        <strong className={`text-sm font-mono ${scaledDepth > 250 ? 'text-red-600 font-bold' : 'text-text'}`}>
                          {scaledDepth.toFixed(1)}
                        </strong>
                        <span className="text-[9px] font-mono text-muted ml-0.5">mm</span>
                        {modelScale !== 100 && (
                          <span className="text-[8px] font-mono text-muted block mt-0.5 border-t border-border/40 pt-0.5">
                            Orig: {stats.boundingBox.depth.toFixed(1)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Surface and Volume Metric widgets */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="bg-surface2 p-3 rounded-none border border-border">
                      <span className="text-[10px] text-muted block mb-1 font-bold uppercase tracking-wider">Volumen</span>
                      <strong className="text-base font-mono text-orange">{(scaledVolume / 1000.0).toFixed(2)}</strong>
                      <span className="text-xs font-mono text-text ml-1">cm³</span>
                      <div className="text-[9px] text-muted mt-1 font-mono">{(scaledVolume).toLocaleString(undefined, {maximumFractionDigits:0})} mm³</div>
                    </div>
                    <div className="bg-surface2 p-3 rounded-none border border-border">
                      <span className="text-[10px] text-muted block mb-1 font-bold uppercase tracking-wider">Superficie</span>
                      <strong className="text-base font-mono text-orange">{(scaledSurfaceArea / 100.0).toFixed(1)}</strong>
                      <span className="text-xs font-mono text-text ml-1">cm²</span>
                      <div className="text-[9px] text-muted mt-1 font-mono">{(scaledSurfaceArea).toLocaleString(undefined, {maximumFractionDigits:0})} mm²</div>
                    </div>
                  </div>

                  <div className="bg-surface2 px-3 py-2 rounded-none border border-border flex justify-between items-center text-xs font-mono uppercase">
                    <span className="text-muted font-bold">Complejidad:</span>
                    <strong className="text-text tracking-wide">{stats.triangleCount.toLocaleString()} <span className="text-[9px] text-muted font-normal font-sans">políg.</span></strong>
                  </div>
                </>
              ) : (
                <div className="text-center py-8 text-muted flex flex-col items-center">
                  <Box className="w-8 h-8 text-border mb-2 animate-bounce" />
                  <p className="text-xs font-mono uppercase">Pendiente de simulación geométrica</p>
                </div>
              )}
            </div>
          </div>

          {/* Quick Config tabs switcher */}
          <div className="bg-surface border border-border rounded-none overflow-hidden shadow-lg flex flex-col">
            
            {/* Tab switch header */}
            <div className="bg-surface2 border-b border-border flex text-center">
              <button
                onClick={() => setActiveTab('material')}
                className={`flex-1 py-2.5 sm:py-3.5 px-1 text-[9px] sm:text-[10px] font-bold tracking-wider sm:tracking-widest uppercase border-b-2 transition-all flex items-center justify-center gap-1 sm:gap-1.5 font-mono cursor-pointer ${
                  activeTab === 'material' 
                    ? 'border-orange text-orange bg-surface/50 font-extrabold' 
                    : 'border-transparent text-muted hover:text-text hover:bg-surface2/60'
                }`}
              >
                <Layers className="w-3.5 h-3.5" /> Diseño
              </button>
              <button
                onClick={() => setActiveTab('helpers')}
                className={`flex-1 py-2.5 sm:py-3.5 px-1 text-[9px] sm:text-[10px] font-bold tracking-wider sm:tracking-widest uppercase border-b-2 transition-all flex items-center justify-center gap-1 sm:gap-1.5 font-mono cursor-pointer ${
                  activeTab === 'helpers' 
                    ? 'border-orange text-orange bg-surface/50 font-extrabold' 
                    : 'border-transparent text-muted hover:text-text hover:bg-surface2/60'
                }`}
              >
                <Settings2 className="w-3.5 h-3.5" /> Escenario
              </button>
              <button
                onClick={() => setActiveTab('slicer')}
                className={`flex-1 py-2.5 sm:py-3.5 px-1 text-[9px] sm:text-[10px] font-bold tracking-wider sm:tracking-widest uppercase border-b-2 transition-all flex items-center justify-center gap-1 sm:gap-1.5 font-mono cursor-pointer ${
                  activeTab === 'slicer' 
                    ? 'border-orange text-orange bg-surface/50 font-extrabold' 
                    : 'border-transparent text-muted hover:text-text hover:bg-surface2/60'
                }`}
              >
                <Printer className="w-3.5 h-3.5" /> Slicing
              </button>
              <button
                onClick={() => setActiveTab('elegoo')}
                className={`flex-1 py-2.5 sm:py-3.5 px-1 text-[9px] sm:text-[10px] font-bold tracking-wider sm:tracking-widest uppercase border-b-2 transition-all flex items-center justify-center gap-1 sm:gap-1.5 font-mono cursor-pointer ${
                  activeTab === 'elegoo' 
                    ? 'border-orange text-orange bg-surface/50 font-extrabold' 
                    : 'border-transparent text-muted hover:text-text hover:bg-surface2/60'
                }`}
              >
                <Cpu className="w-3.5 h-3.5 text-orange" /> Elegoo CF
              </button>
            </div>

            {/* TAB CONTENTS */}
            <div className="p-4 flex-grow min-h-[280px]">

              {/* 1. Tab: Material & Color design */}
              {activeTab === 'material' && (
                <div className="space-y-4 text-left">
                  
                  {/* Render Mode */}
                  <div>
                    <label className="text-[9px] font-bold uppercase tracking-widest text-muted block mb-2 font-mono">Modo de Visualización</label>
                    <div className="grid grid-cols-2 gap-2 font-mono">
                      {(['solid', 'wireframe', 'points', 'xray'] as const).map((m) => (
                        <button
                          key={m}
                          onClick={() => setSettings(prev => ({ ...prev, mode: m }))}
                          className={`py-1.5 px-2 text-[9px] font-bold rounded-none border uppercase tracking-wider transition-all text-center cursor-pointer ${
                            settings.mode === m 
                              ? 'bg-orange border-orange text-white shadow-sm' 
                              : 'bg-surface border-border text-text hover:bg-surface2'
                          }`}
                        >
                          {m === 'solid' && 'Sólido'}
                          {m === 'wireframe' && 'Malla'}
                          {m === 'points' && 'Puntos'}
                          {m === 'xray' && 'Rayos X'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Colors Presets */}
                  <div>
                    <label className="text-[9px] font-bold uppercase tracking-widest text-muted block mb-2 font-mono">Filamento (Material)</label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {COLOR_PRESETS.map((color) => (
                        <button
                          key={color.value}
                          onClick={() => setSettings(prev => ({ 
                            ...prev, 
                            color: color.value,
                            roughness: color.roughness,
                            metalness: color.metalness
                          }))}
                          style={{ backgroundColor: color.value }}
                          className={`h-8 w-full rounded-none border transition-all relative flex items-center justify-center cursor-pointer ${
                            settings.color.toLowerCase() === color.value.toLowerCase() 
                              ? 'border-orange scale-105 shadow-md z-10' 
                              : 'border-border hover:scale-102'
                          }`}
                          title={color.name}
                        >
                          {settings.color.toLowerCase() === color.value.toLowerCase() && (
                            <span className="absolute inset-0 m-auto h-2.5 w-2.5 rounded-full bg-white border border-text/40 shadow-sm" />
                          )}
                        </button>
                      ))}
                    </div>
                    
                    {/* Manual color override hex */}
                    <div className="mt-3 flex items-center gap-2 font-mono">
                      <div className="relative flex-grow">
                        <input
                          type="text"
                          value={settings.color}
                          onChange={(e) => setSettings(prev => ({ ...prev, color: e.target.value }))}
                          className="w-full bg-surface border border-border rounded-none py-1 px-2.5 text-xs font-mono text-text focus:outline-none focus:border-orange"
                        />
                        <span className="absolute right-2 top-1.5 text-[8px] text-muted font-mono font-bold">HEX</span>
                      </div>
                      <input
                        type="color"
                        value={settings.color}
                        onChange={(e) => setSettings(prev => ({ ...prev, color: e.target.value }))}
                        className="h-7 w-10 rounded-none cursor-pointer border border-border bg-transparent"
                      />
                    </div>
                  </div>

                  {/* Slider properties (roughness, metalness) */}
                  <div className="space-y-3 pt-1 font-mono">
                    <div>
                      <div className="flex justify-between text-[9px] uppercase font-bold text-muted tracking-wider mb-1">
                        <span>Rugosidad (Mate / Brillo)</span>
                        <span className="text-orange font-bold">{settings.roughness.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.0"
                        max="1.0"
                        step="0.05"
                        value={settings.roughness}
                        onChange={(e) => setSettings(prev => ({ ...prev, roughness: parseFloat(e.target.value) }))}
                        className="w-full accent-orange h-1 bg-surface2 border border-border/10 rounded-none cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-[9px] uppercase font-bold text-muted tracking-wider mb-1">
                        <span>Metalizado (Metal / PLA)</span>
                        <span className="text-orange font-bold">{settings.metalness.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.0"
                        max="1.0"
                        step="0.05"
                        value={settings.metalness}
                        onChange={(e) => setSettings(prev => ({ ...prev, metalness: parseFloat(e.target.value) }))}
                        className="w-full accent-orange h-1 bg-surface2 border border-border/10 rounded-none cursor-pointer"
                      />
                    </div>
                  </div>

                </div>
              )}

              {/* 2. Tab: Scene Helpers & Lighting */}
              {activeTab === 'helpers' && (
                <div className="space-y-4 text-left font-mono">
                  
                  {/* Grid / Frame Helpers */}
                  <div>
                    <label className="text-[9px] font-bold uppercase tracking-widest text-text block mb-2">Referencias de Escenario</label>
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-2.5 bg-surface2/65 p-2 rounded-none border border-border cursor-pointer hover:bg-surface2">
                        <input
                          type="checkbox"
                          checked={settings.showGrid}
                          onChange={(e) => setSettings(prev => ({ ...prev, showGrid: e.target.checked }))}
                          className="accent-orange rounded h-3.5 w-3.5"
                        />
                        <div>
                          <span className="text-[10px] font-bold text-text block">BASE DE TRABAJO (GRID)</span>
                          <span className="text-[8px] text-muted uppercase leading-none">Rejilla bajo el modelo</span>
                        </div>
                      </label>

                      <label className="flex items-center gap-2.5 bg-surface2/65 p-2 rounded-none border border-border cursor-pointer hover:bg-surface2">
                        <input
                          type="checkbox"
                          checked={settings.showAxes}
                          onChange={(e) => setSettings(prev => ({ ...prev, showAxes: e.target.checked }))}
                          className="accent-orange rounded h-3.5 w-3.5"
                        />
                        <div>
                          <span className="text-[10px] font-bold text-text block">EJES COORDENADAS</span>
                          <span className="text-[8px] text-muted uppercase leading-none">Direcciones cartesianas</span>
                        </div>
                      </label>

                      <label className="flex items-center gap-2.5 bg-surface2/65 p-2 rounded-none border border-border cursor-pointer hover:bg-surface2">
                        <input
                          type="checkbox"
                          checked={settings.showBoundingBox}
                          onChange={(e) => setSettings(prev => ({ ...prev, showBoundingBox: e.target.checked }))}
                          className="accent-orange rounded h-3.5 w-3.5"
                        />
                        <div>
                          <span className="text-[10px] font-bold text-text block">CAJA DELIMITADORA</span>
                          <span className="text-[8px] text-muted uppercase leading-none">Límites máximos en naranja</span>
                        </div>
                      </label>

                      <label className="flex items-center gap-2.5 bg-surface2/65 p-2 rounded-none border border-border cursor-pointer hover:bg-surface2">
                        <input
                          type="checkbox"
                          checked={settings.autoRotate}
                          onChange={(e) => setSettings(prev => ({ ...prev, autoRotate: e.target.checked }))}
                          className="accent-orange rounded h-3.5 w-3.5"
                        />
                        <div>
                          <span className="text-[10px] font-bold text-text block">AUTO_ROTACIÓN CÁMARA</span>
                          <span className="text-[8px] text-muted uppercase leading-none">Giro automático constante</span>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Scene Lighting selector */}
                  <div>
                    <label className="text-[9px] font-bold uppercase tracking-widest text-text block mb-2">Esquemas de Luces</label>
                    <div className="space-y-1">
                      {LIGHTS.map((light) => (
                        <button
                          key={light.value}
                          onClick={() => setSettings(prev => ({ ...prev, lighting: light.value }))}
                          className={`w-full p-2 rounded-none text-left border transition-all flex items-center justify-between cursor-pointer ${
                            settings.lighting === light.value 
                              ? 'bg-surface border-orange text-orange font-bold' 
                              : 'bg-surface2 border-border text-muted hover:bg-surface'
                          }`}
                        >
                          <div>
                            <span className="text-[10px] font-bold block uppercase tracking-wide">{light.name}</span>
                            <span className="text-[8px] text-muted uppercase leading-none">{light.desc}</span>
                          </div>
                          {settings.lighting === light.value && <div className="h-1.5 w-1.5 rounded-full bg-orange" />}
                        </button>
                      ))}
                    </div>
                  </div>

                </div>
              )}

              {/* 3. Tab: Print slicer cost simulation */}
              {activeTab === 'slicer' && (
                <div className="space-y-3.5 text-left font-mono">
                  
                  {/* Filament selector */}
                  <div>
                    <label className="text-[9px] font-bold uppercase tracking-widest text-muted block mb-1">Tipo de Material</label>
                    <select
                      value={selectedFilament}
                      onChange={(e) => setSelectedFilament(e.target.value)}
                      className="w-full bg-surface border border-border rounded-none py-1.5 px-2.5 text-xs text-text focus:outline-none focus:border-orange uppercase font-semibold cursor-pointer"
                    >
                      {FILAMENTS.map(f => (
                        <option key={f.value} value={f.value} className="bg-surface text-text">{f.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Sliders for cost input */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[9px] font-bold uppercase tracking-widest text-muted block mb-1 font-semibold">Precio Bobina (€)</label>
                      <input
                        type="number"
                        min="5"
                        max="200"
                        value={spoolPrice}
                        onChange={(e) => setSpoolPrice(Math.max(1, parseFloat(e.target.value) || 0))}
                        className="w-full bg-surface border border-border rounded-none py-1 px-2.5 text-xs text-text focus:outline-none focus:border-orange font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold uppercase tracking-widest text-muted block mb-1 font-semibold">Peso Bobina (g)</label>
                      <input
                        type="number"
                        min="100"
                        max="5000"
                        value={spoolWeight}
                        onChange={(e) => setSpoolWeight(Math.max(1, parseInt(e.target.value) || 0))}
                        className="w-full bg-surface border border-border rounded-none py-1 px-2.5 text-xs text-text focus:outline-none focus:border-orange font-bold"
                      />
                    </div>
                  </div>

                  {/* Infill ratio */}
                  <div>
                    <div className="flex justify-between text-[9px] uppercase font-bold text-muted tracking-wider mb-1">
                      <span>Relleno Interno (Infill)</span>
                      <span className="text-orange font-bold">{infill}%</span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="100"
                      step="5"
                      value={infill}
                      onChange={(e) => setInfill(parseInt(e.target.value))}
                      className="w-full accent-orange h-1 bg-surface2 border border-border/10 rounded-none cursor-pointer"
                    />
                    <span className="text-[8px] text-muted uppercase">Decorativo ~15%. Sólidos el 100%.</span>
                  </div>

                  {/* Layer Height (Slicer Precision) */}
                  <div>
                    <label className="text-[9px] font-bold uppercase tracking-widest text-muted block mb-1">Altura de Capa (mm)</label>
                    <select
                      value={layerHeight}
                      onChange={(e) => setLayerHeight(parseFloat(e.target.value))}
                      className="w-full bg-surface border border-border rounded-none py-1 px-2 text-xs text-text focus:outline-none focus:border-orange uppercase font-semibold cursor-pointer"
                    >
                      <option value="0.12" className="bg-surface text-text">0.12 mm (Extra-Fina)</option>
                      <option value="0.16" className="bg-surface text-text">0.16 mm (Fina)</option>
                      <option value="0.2" className="bg-surface text-text">0.20 mm (Estándar)</option>
                      <option value="0.28" className="bg-surface text-text">0.28 mm (Borrador)</option>
                    </select>
                  </div>

                  {/* COST CALCULATOR RESULTS */}
                  <div className="bg-surface2 border border-border rounded-none p-3 space-y-2 mt-2">
                    <h4 className="text-[10px] font-bold text-text uppercase tracking-widest flex items-center gap-1.5 border-b border-border/60 pb-1.5">
                      <Coins className="w-3.5 h-3.5 text-orange" /> RESULTADOS SIMULADOR
                    </h4>

                    {stats ? (
                      <div className="space-y-1.5 text-[10.5px]">
                        <div className="flex justify-between border-b border-border/40 pb-1">
                          <span className="text-muted uppercase tracking-wider text-[9px]">Peso Neto:</span>
                          <strong className="text-text">{estimatedWeight.toFixed(1)} g</strong>
                        </div>
                        <div className="flex justify-between border-b border-border/40 pb-1">
                          <span className="text-muted uppercase tracking-wider text-[9px]">Longitud Fil.:</span>
                          <strong className="text-text">{estimatedLength.toFixed(2)} m</strong>
                        </div>
                        <div className="flex justify-between border-b border-border/40 pb-1">
                          <span className="text-muted uppercase tracking-wider text-[9px]">Capas Z:</span>
                          <strong className="text-orange font-bold">{layersCount} capas</strong>
                        </div>
                        <div className="flex justify-between border-b border-border/40 pb-1">
                          <span className="text-muted uppercase tracking-wider text-[9px]">Costo:</span>
                          <strong className="text-orange font-bold">{estimatedCost.toLocaleString(undefined, {style: 'currency', currency: 'EUR'})}</strong>
                        </div>
                        <div className="flex justify-between pt-0.5">
                          <span className="text-muted uppercase tracking-wider text-[9px]">Tiempo:</span>
                          <strong className="text-orange font-bold">~ {Math.max(1, Math.round(estimatedWeight * 1.5))} min</strong>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[8px] text-muted uppercase tracking-wide text-center py-1">Selecciona un modelo para simular costos.</p>
                    )}
                  </div>

                </div>
              )}

              {/* 4. Tab: Elegoo Centuri Carbon Advice & Presets */}
              {activeTab === 'elegoo' && (
                <div className="space-y-3.5 text-left font-mono">
                  <div className="bg-orange/5 border border-orange/15 p-3 rounded-none flex gap-2 items-start">
                    <Wrench className="w-3.5 h-3.5 text-orange shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-[9.5px] font-bold text-text uppercase tracking-wider">CONSEJOS ELEGOO CENTURI CARBON</h4>
                      <p className="text-[8.5px] text-muted leading-relaxed mt-0.5">
                        Optimizador para filamentos cargados con fibra de carbono. Cama: <strong>250 × 250 mm</strong>.
                      </p>
                    </div>
                  </div>

                  {/* Bed fit status bar */}
                  <div className="bg-surface2 border border-border p-3 space-y-1.5">
                    <h5 className="text-[9px] font-bold text-muted uppercase tracking-wider flex items-center gap-1.5">
                      <Grid3X3 className="w-3.5 h-3.5 text-orange" /> ESTADO DE LA CAMA (250x250)
                    </h5>
                    {stats ? (
                      isOverBedLimit ? (
                        <div className="text-[9px] border border-red-200 bg-red-50/70 p-2 text-red-700 flex flex-col gap-0.5">
                          <span className="font-bold uppercase tracking-wider flex items-center gap-1">
                            <ShieldAlert className="w-3.5 h-3.5 shrink-0 text-red-650" /> ¡FUERA DE LÍMITES!
                          </span>
                          <span>
                            Supera las dimensiones permitidas. Reduce el tamaño con el slider.
                          </span>
                        </div>
                      ) : (
                        <div className="text-[9px] border border-emerald-250 bg-emerald-50/70 p-2 text-emerald-800 flex flex-col gap-0.5">
                          <span className="font-bold uppercase tracking-wider flex items-center gap-1">
                            <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-emerald-600" /> COMPATIBLE (OK)
                          </span>
                          <span>
                            Ocupa el {((scaledWidth / 250) * 100).toFixed(0)}% X y el {((scaledDepth / 250) * 100).toFixed(0)}% Z. Cabe perfectamente.
                          </span>
                        </div>
                      )
                    ) : (
                      <p className="text-[8.5px] text-muted uppercase">Sube un archivo para analizar su ocupación.</p>
                    )}
                  </div>

                  {/* Carbon Fiber presets selectors */}
                  <div className="space-y-2">
                    <label className="text-[8.5px] font-bold uppercase tracking-widest text-muted block font-mono">
                      PREAJUSTES CARBONO (AUTO-CONFIG)
                    </label>
                    
                    <div className="grid grid-cols-1 gap-1.5">
                      <button
                        onClick={() => applyElegooPreset('placf')}
                        className={`p-2.5 border text-left rounded-none transition-all flex justify-between items-center cursor-pointer hover:bg-surface2/80 ${
                          selectedFilament === 'PLA-CF' 
                            ? 'bg-surface border-orange shadow-sm' 
                            : 'bg-surface border-border'
                        }`}
                      >
                        <div className="space-y-0.5">
                          <span className="text-[9.5px] uppercase font-bold text-text block">🧬 AUTO: PLA-CF Carbono</span>
                          <span className="text-[8px] text-muted block font-sans">Boquilla: 220°C | Cama: 60°C | Capa: 0.20mm</span>
                        </div>
                        <span className={`h-2 w-2 rounded-full ${selectedFilament === 'PLA-CF' ? 'bg-orange animate-pulse' : 'bg-border'}`} />
                      </button>

                      <button
                        onClick={() => applyElegooPreset('petgcf')}
                        className={`p-2.5 border text-left rounded-none transition-all flex justify-between items-center cursor-pointer hover:bg-surface2/80 ${
                          selectedFilament === 'PETG-CF' 
                            ? 'bg-surface border-orange shadow-sm' 
                            : 'bg-surface border-border'
                        }`}
                      >
                        <div className="space-y-0.5">
                          <span className="text-[9.5px] uppercase font-bold text-text block">🛡️ AUTO: PETG-CF Resistencia</span>
                          <span className="text-[8px] text-muted block font-sans">Boquilla: 245°C | Cama: 80°C | Capa: 0.16mm</span>
                        </div>
                        <span className={`h-2 w-2 rounded-full ${selectedFilament === 'PETG-CF' ? 'bg-orange animate-pulse' : 'bg-border'}`} />
                      </button>

                      <button
                        onClick={() => applyElegooPreset('pacf')}
                        className={`p-2.5 border text-left rounded-none transition-all flex justify-between items-center cursor-pointer hover:bg-surface2/80 ${
                          selectedFilament === 'PA-CF' 
                            ? 'bg-surface border-orange shadow-sm' 
                            : 'bg-surface border-border'
                        }`}
                      >
                        <div className="space-y-0.5">
                          <span className="text-[9.5px] uppercase font-bold text-text block">⚙️ AUTO: PA-CF Nylon Industrial</span>
                          <span className="text-[8px] text-muted block font-sans">Boquilla: 280°C | Cama: 95°C | Capa: 0.12mm (Fina)</span>
                        </div>
                        <span className={`h-2 w-2 rounded-full ${selectedFilament === 'PA-CF' ? 'bg-orange' : 'bg-border'}`} />
                      </button>
                    </div>
                  </div>

                  {/* Hardware advice collapsible listing */}
                  <details className="group bg-surface2 border border-border p-2.5 transition-all text-left text-[9px]">
                    <summary className="list-none flex items-center justify-between text-[9px] font-bold text-text uppercase tracking-widest cursor-pointer select-none">
                      <span className="flex items-center gap-1.5">
                        <Sparkles className="w-3 h-3 text-orange animate-pulse" />
                        REGLAS DE ORO HARDWARE
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-muted group-open:rotate-90 transition-transform duration-250" />
                    </summary>
                    <ul className="space-y-2 leading-relaxed text-muted list-none pl-0 border-t border-border/40 mt-2 pt-2">
                      <li className="flex gap-1.5">
                        <span className="text-orange select-none font-bold">1.</span>
                        <span>
                          <strong className="text-text">Boquilla Endurecida:</strong> Instala una boquilla de <strong>Acero Templado</strong> o <strong>Rubí</strong>. El latón se deformará en minutos con filamento CF abrasivo.
                        </span>
                      </li>
                      <li className="flex gap-1.5">
                        <span className="text-orange select-none font-bold">2.</span>
                        <span>
                          <strong className="text-text">Ventilación reducida:</strong> Mantén el ventilador de capa al 0-35% para prevenir contracciones térmicas (<em>warping</em>).
                        </span>
                      </li>
                      <li className="flex gap-1.5">
                        <span className="text-orange select-none font-bold">3.</span>
                        <span>
                          <strong className="text-text">PEI y Adhesión:</strong> Limpia con alcohol isopropílico al 99%. Para Nylon/PA-CF, aplica pegamento sólido especializado.
                        </span>
                      </li>
                      <li className="flex gap-1.5">
                        <span className="text-orange select-none font-bold">4.</span>
                        <span>
                          <strong className="text-text">Secado previo:</strong> Seca el filamento a 55°C (PLA) o 80°C (Nylon/PETG) durante 6 horas para evitar <em>stringing</em>.
                        </span>
                      </li>
                    </ul>
                  </details>

                </div>
              )}

            </div>

          </div>

        </div>

      </main>

      {/* 3. Global minimal footer */}
      <footer className="border-t border-border bg-surface px-6 py-4 flex flex-col sm:flex-row items-center justify-between text-[10px] text-muted gap-2 mt-auto font-mono uppercase tracking-wider relative z-10 font-bold">
        <p>© 2026 Roberto Garcia Sanz — Visor:STL</p>
        <div className="flex items-center gap-4">
          <a href="mailto:Excavacionesart@gmail.com" className="hover:text-orange tracking-widest transition-colors flex items-center gap-1.5 cursor-pointer">
            Excavacionesart@gmail.com
          </a>
        </div>
      </footer>

    </div>
  );
}
