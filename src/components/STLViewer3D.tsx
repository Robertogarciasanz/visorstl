import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { DisplaySettings, ModelStats } from '../types';
import { Loader2, RefreshCw, ZoomIn, ZoomOut, Compass, Eye, ShieldAlert } from 'lucide-react';

interface STLViewer3DProps {
  modelData: ArrayBuffer | null;
  settings: DisplaySettings;
  onModelLoaded: (stats: ModelStats) => void;
  modelScale: number;
}

export const STLViewer3D: React.FC<STLViewer3DProps> = ({
  modelData,
  settings,
  onModelLoaded,
  modelScale,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | THREE.OrthographicCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  
  // Three.js object references for clean updates
  const meshRef = useRef<THREE.Mesh | null>(null);
  const pointsRef = useRef<THREE.Points | null>(null);
  const edgeSegmentsRef = useRef<THREE.LineSegments | null>(null);
  const boundingBoxRef = useRef<THREE.BoxHelper | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const axesHelperRef = useRef<THREE.AxesHelper | null>(null);
  
  // Dynamic printer bed plate references
  const bedPlateRef = useRef<THREE.Mesh | null>(null);
  const bedBorderRef = useRef<THREE.LineSegments | null>(null);

  // Geometry tracking scales
  const scaleFactorRef = useRef<number>(1);
  const bottomYRef = useRef<number>(0);
  const initialModelWidthRef = useRef<number>(0);
  const initialModelDepthRef = useRef<number>(0);
  
  // Lighting group reference for quick lighting changes
  const lightsGroupRef = useRef<THREE.Group | null>(null);

  const autoRotateRef = useRef<boolean>(settings.autoRotate);

  // Sync settings.autoRotate with autoRotateRef to avoid stale closures in animate loop
  useEffect(() => {
    autoRotateRef.current = settings.autoRotate;
  }, [settings.autoRotate]);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // 1. Scene setup on component mount
  useEffect(() => {
    if (!containerRef.current) return;

    // Create Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xfdfdfd); // Map to --bg (#fdfdfd)
    sceneRef.current = scene;

    // Renderer
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight || 500;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    // Clear out any old canvas
    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Camera (Perspective default)
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(40, 40, 60);
    cameraRef.current = camera;

    // Orbit Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxDistance = 300;
    controls.minDistance = 5;
    controlsRef.current = controls;

    // Create persistent groups
    const lightsGroup = new THREE.Group();
    scene.add(lightsGroup);
    lightsGroupRef.current = lightsGroup;

    // Add Base Ambient Grid / Axes helpers
    const grid = new THREE.GridHelper(50, 50, 0xff6b00, 0xe0e0e0);
    grid.position.y = -10; // offset slightly, will be dynamically re-placed
    scene.add(grid);
    gridHelperRef.current = grid;

    const axes = new THREE.AxesHelper(15);
    axes.position.set(-25, -10, -25);
    scene.add(axes);
    axesHelperRef.current = axes;

    // Handle Window Resizing with ResizeObserver
    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width: newWidth, height: newHeight } = entries[0].contentRect;
      
      if (rendererRef.current && cameraRef.current) {
        rendererRef.current.setSize(newWidth, newHeight);
        
        if (cameraRef.current instanceof THREE.PerspectiveCamera) {
          cameraRef.current.aspect = newWidth / newHeight;
          cameraRef.current.updateProjectionMatrix();
        } else if (cameraRef.current instanceof THREE.OrthographicCamera) {
          const aspect = newWidth / newHeight;
          const currentSize = 35; // default scale size
          cameraRef.current.left = -currentSize * aspect;
          cameraRef.current.right = currentSize * aspect;
          cameraRef.current.top = currentSize;
          cameraRef.current.bottom = -currentSize;
          cameraRef.current.updateProjectionMatrix();
        }
      }
    });
    
    resizeObserver.observe(containerRef.current);

    // Animation loop
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      
      if (controlsRef.current) {
        // If auto rotate is enabled in settings (using ref to avoid stale closures)
        if (autoRotateRef.current && meshRef.current) {
          meshRef.current.rotation.y += 0.005;
          if (pointsRef.current) pointsRef.current.rotation.y = meshRef.current.rotation.y;
          if (edgeSegmentsRef.current) edgeSegmentsRef.current.rotation.y = meshRef.current.rotation.y;
          if (boundingBoxRef.current) boundingBoxRef.current.update();
        }
        controlsRef.current.update();
      }
      
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };
    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      if (rendererRef.current) {
        rendererRef.current.dispose();
      }
    };
  }, []);

  // 2. Direct response to lighting configuration adjustments
  useEffect(() => {
    const lightsGroup = lightsGroupRef.current;
    if (!lightsGroup) return;

    // Clear old lights
    while (lightsGroup.children.length > 0) {
      lightsGroup.remove(lightsGroup.children[0]);
    }

    // Set lighting based on display settings
    if (settings.lighting === 'studio') {
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
      lightsGroup.add(ambientLight);

      const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
      mainLight.position.set(40, 60, 40);
      mainLight.castShadow = true;
      lightsGroup.add(mainLight);

      const fillLight = new THREE.DirectionalLight(0x93c5fd, 0.3); // soft blue tone fill
      fillLight.position.set(-40, 20, -40);
      lightsGroup.add(fillLight);
    } else if (settings.lighting === 'sunset') {
      const ambientLight = new THREE.AmbientLight(0x1e1b4b, 0.4); // deep purple ambient
      lightsGroup.add(ambientLight);

      const mainLight = new THREE.DirectionalLight(0xfdba74, 1.2); // warm orange main light
      mainLight.position.set(50, 30, 20);
      mainLight.castShadow = true;
      lightsGroup.add(mainLight);

      const rimLight = new THREE.DirectionalLight(0xec4899, 0.5); // hot pink rim highlight
      rimLight.position.set(-30, -10, -30);
      lightsGroup.add(rimLight);
    } else if (settings.lighting === 'industrial') {
      const ambientLight = new THREE.AmbientLight(0x0f172a, 0.3);
      lightsGroup.add(ambientLight);

      const overheadLight = new THREE.DirectionalLight(0xffffff, 1.5); // cool white overhead spot
      overheadLight.position.set(0, 80, 0);
      overheadLight.castShadow = true;
      lightsGroup.add(overheadLight);

      const backlight = new THREE.DirectionalLight(0x38bdf8, 0.4); // cyan counter-light
      backlight.position.set(30, 20, -50);
      lightsGroup.add(backlight);
    } else { // 'flat'
      const ambientLight = new THREE.AmbientLight(0xffffff, 1.1); // bright flat lighting, shadows minimized
      lightsGroup.add(ambientLight);
    }
  }, [settings.lighting]);

  // 3. Coordinate actual model loading and processing
  useEffect(() => {
    if (!modelData || !sceneRef.current) return;

    setLoading(true);
    setError(null);

    // Give browser a frame to show loading spinner
    setTimeout(() => {
      try {
        const scene = sceneRef.current!;
        
        // Remove existing meshes/points
        if (meshRef.current) {
          scene.remove(meshRef.current);
          meshRef.current.geometry.dispose();
          if (Array.isArray(meshRef.current.material)) {
            meshRef.current.material.forEach(m => m.dispose());
          } else {
            meshRef.current.material.dispose();
          }
          meshRef.current = null;
        }
        if (pointsRef.current) {
          scene.remove(pointsRef.current);
          pointsRef.current.geometry.dispose();
          if (Array.isArray(pointsRef.current.material)) {
            pointsRef.current.material.forEach(m => m.dispose());
          } else {
            pointsRef.current.material.dispose();
          }
          pointsRef.current = null;
        }
        if (edgeSegmentsRef.current) {
          scene.remove(edgeSegmentsRef.current);
          edgeSegmentsRef.current.geometry.dispose();
          (edgeSegmentsRef.current.material as THREE.Material).dispose();
          edgeSegmentsRef.current = null;
        }
        if (boundingBoxRef.current) {
          scene.remove(boundingBoxRef.current);
          boundingBoxRef.current = null;
        }

        // Parse STL and scale/center
        const loader = new STLLoader();
        const geometry = loader.parse(modelData);
        geometry.computeVertexNormals();

        // MATH: Calculate stats (Volume, Surface Area, Bounding Box)
        let totalVolume = 0;
        let totalSurfaceArea = 0;
        const positions = geometry.attributes.position;
        const triangleCount = positions.count / 3;

        for (let i = 0; i < triangleCount; i++) {
          const ax = positions.getX(i * 3 + 0);
          const ay = positions.getY(i * 3 + 0);
          const az = positions.getZ(i * 3 + 0);

          const bx = positions.getX(i * 3 + 1);
          const by = positions.getY(i * 3 + 1);
          const bz = positions.getZ(i * 3 + 1);

          const cx = positions.getX(i * 3 + 2);
          const cy = positions.getY(i * 3 + 2);
          const cz = positions.getZ(i * 3 + 2);

          // Volume = (P1 . (P2 x P3)) / 6
          const vSigned = (-cx * by * az + bx * cy * az + cx * ay * bz - ax * cy * bz - bx * ay * cz + ax * by * cz) / 6.0;
          totalVolume += vSigned;

          // Surface Area
          const ux = bx - ax;
          const uy = by - ay;
          const uz = bz - az;

          const vx = cx - ax;
          const vy = cy - ay;
          const vz = cz - az;

          const nx = uy * vz - uz * vy;
          const ny = uz * vx - ux * vz;
          const nz = ux * vy - uy * vx;

          const area = 0.5 * Math.sqrt(nx * nx + ny * ny + nz * nz);
          totalSurfaceArea += area;
        }

        // Center Geometry
        geometry.center();

        // Calculate bounding box in mm
        geometry.computeBoundingBox();
        const bbox = geometry.boundingBox!;
        const width = bbox.max.x - bbox.min.x;
        const height = bbox.max.y - bbox.min.y;
        const depth = bbox.max.z - bbox.min.z;

        // Save geometry stats to refs for persistent coordinate translation
        initialModelWidthRef.current = width;
        initialModelDepthRef.current = depth;

        // Auto-scale setup / camera fit
        const maxDim = Math.max(width, height, depth);
        const scaleFactor = 30 / (maxDim || 1); // target standard physical display scale (30 units)
        scaleFactorRef.current = scaleFactor;
        geometry.scale(scaleFactor, scaleFactor, scaleFactor);
        
        // Re-compute bounding box for scaled coordinates
        geometry.computeBoundingBox();
        const scaledBbox = geometry.boundingBox!;
        const scaledHeight = scaledBbox.max.y - scaledBbox.min.y;
        const bottomY = scaledBbox.min.y;
        bottomYRef.current = bottomY;

        // Remove active printer bed components if existing
        if (bedPlateRef.current) {
          scene.remove(bedPlateRef.current);
          bedPlateRef.current.geometry.dispose();
          (bedPlateRef.current.material as THREE.Material).dispose();
          bedPlateRef.current = null;
        }
        if (bedBorderRef.current) {
          scene.remove(bedBorderRef.current);
          bedBorderRef.current.geometry.dispose();
          (bedBorderRef.current.material as THREE.Material).dispose();
          bedBorderRef.current = null;
        }

        // Material construction
        // Create solid mesh
        const colorVal = new THREE.Color(settings.color);
        // STL con color por cara (p. ej. un color por pieza): se muestran los colores del archivo
        const hasVertexColors = !!(geometry as any).hasColors;
        const material = new THREE.MeshStandardMaterial({
          vertexColors: hasVertexColors,
          color: colorVal,
          roughness: settings.roughness,
          metalness: settings.metalness,
          roughnessMap: null,
          metalnessMap: null,
          bumpScale: 1,
          side: THREE.DoubleSide,
        });

        const currentScale = modelScale / 100;
        const isTooBig = (width * currentScale) > 250 || (depth * currentScale) > 250;

        const mesh = new THREE.Mesh(geometry, material);
        mesh.scale.setScalar(currentScale);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        meshRef.current = mesh;

        // Create secondary representations for toggles
        // Edges
        const edgesGeom = new THREE.EdgesGeometry(geometry);
        const edgeMaterial = new THREE.LineBasicMaterial({
          color: 0xffffff,
          linewidth: 1.5,
          transparent: true,
          opacity: 0.6,
        });
        const edgeSegments = new THREE.LineSegments(edgesGeom, edgeMaterial);
        edgeSegments.scale.setScalar(currentScale);
        scene.add(edgeSegments);
        edgeSegmentsRef.current = edgeSegments;

        // Points
        const pointsMaterial = new THREE.PointsMaterial({
          color: colorVal,
          size: 0.4,
          sizeAttenuation: true,
        });
        const points = new THREE.Points(geometry, pointsMaterial);
        points.scale.setScalar(currentScale);
        scene.add(points);
        pointsRef.current = points;

        // Setup Box Helper (Bounding box outline)
        const bboxHelper = new THREE.BoxHelper(mesh, 0xff6b00); // Orange outline
        scene.add(bboxHelper);
        boundingBoxRef.current = bboxHelper;

        // Create realistic 3D Printer glass heatbed of 250mm x 250mm
        const bedSize = 250 * scaleFactor;
        const plateGeo = new THREE.BoxGeometry(bedSize, 0.4, bedSize);
        const plateMat = new THREE.MeshStandardMaterial({
          color: isTooBig ? 0xef4444 : 0xf8fafc,
          roughness: 0.25,
          metalness: 0.1,
          transparent: true,
          opacity: isTooBig ? 0.35 : 0.6,
        });
        const bedPlate = new THREE.Mesh(plateGeo, plateMat);
        bedPlate.position.y = (bottomY * currentScale) - 0.21;
        scene.add(bedPlate);
        bedPlateRef.current = bedPlate;

        // Metallic/Alert boundary border
        const edgeGeo = new THREE.EdgesGeometry(plateGeo);
        const edgeLineMat = new THREE.LineBasicMaterial({
          color: isTooBig ? 0xef4444 : 0xe2e8f0,
          linewidth: 2,
        });
        const bedBorder = new THREE.LineSegments(edgeGeo, edgeLineMat);
        bedBorder.position.y = (bottomY * currentScale) - 0.21;
        scene.add(bedBorder);
        bedBorderRef.current = bedBorder;

        // Configure Grid Helper exactly sitting on top of printer bed
        if (gridHelperRef.current) {
          scene.remove(gridHelperRef.current);
          const grid = new THREE.GridHelper(bedSize, 25, 0xff6b00, 0xd1d5db);
          grid.position.y = (bottomY * currentScale) - 0.01;
          scene.add(grid);
          gridHelperRef.current = grid;
        }

        if (axesHelperRef.current) {
          const gridBound = Math.max(25, (width * scaleFactor * 1.2));
          axesHelperRef.current.position.set(-gridBound, (bottomY * currentScale) + 0.1, -gridBound);
        }

        // Fit camera to see entire bounds
        if (cameraRef.current && controlsRef.current) {
          const distance = maxDim * scaleFactor * 1.8;
          cameraRef.current.position.set(distance, distance, distance * 1.2);
          cameraRef.current.lookAt(0, 0, 0);
          controlsRef.current.target.set(0, 0, 0);
          controlsRef.current.update();
        }

        // Notify parent about loaded geometry stats
        // Volume: totalVolume is in mm³
        // 1 cm³ = 1000 mm³
        const volCm3 = Math.abs(totalVolume); // absolute volume in cubic mm
        const densityPLA = 1.24; // standard PLA is 1.24 g/cm³
        const weightGrams = (volCm3 / 1000.0) * densityPLA;
        
        // Filament length (using 1.75mm diameter filament)
        // Volume of 1m of 1.75mm filament: Pi * r² * h = Pi * (1.75/2)² * 1000 = 2405.28 mm³
        const filamentL = volCm3 / 2405.28;

        onModelLoaded({
          volume: Math.abs(totalVolume),
          surfaceArea: totalSurfaceArea,
          boundingBox: {
            width,
            height,
            depth,
          },
          triangleCount,
          estimatedWeight: weightGrams,
          filamentLength: filamentL,
        });

        // Trigger updates once mesh is generated
        applyDisplayMode(settings.mode);
        applyUtilityStates(settings);

      } catch (err: any) {
        console.error("Error building 3D STL structure:", err);
        setError(err?.message || "Ocurrió un error al procesar el archivo STL.");
      } finally {
        setLoading(false);
      }
    }, 50);

  }, [modelData]);

  // 4. Update renderer elements based on fine grain controls
  const applyDisplayMode = (mode: 'solid' | 'wireframe' | 'points' | 'xray') => {
    if (!meshRef.current || !pointsRef.current || !edgeSegmentsRef.current) return;

    // Turn off everything first
    meshRef.current.visible = false;
    pointsRef.current.visible = false;
    edgeSegmentsRef.current.visible = false;

    // Apply specific modes
    const mat = meshRef.current.material as THREE.MeshStandardMaterial;
    
    if (mode === 'solid') {
      meshRef.current.visible = true;
      mat.wireframe = false;
      mat.transparent = false;
      mat.opacity = 1.0;
    } else if (mode === 'wireframe') {
      meshRef.current.visible = true;
      mat.wireframe = true;
      mat.transparent = false;
      mat.opacity = 1.0;
    } else if (mode === 'points') {
      pointsRef.current.visible = true;
    } else if (mode === 'xray') {
      meshRef.current.visible = true;
      edgeSegmentsRef.current.visible = true;
      mat.wireframe = false;
      mat.transparent = true;
      mat.opacity = 0.35;
    }
  };

  // 5. Apply utility states (Grid, helpers, colors, materials)
  const applyUtilityStates = (s: DisplaySettings) => {
    if (boundingBoxRef.current) boundingBoxRef.current.visible = s.showBoundingBox;
    if (gridHelperRef.current) gridHelperRef.current.visible = s.showGrid;
    if (axesHelperRef.current) axesHelperRef.current.visible = s.showAxes;
    
    if (meshRef.current) {
      const mat = meshRef.current.material as THREE.MeshStandardMaterial;
      mat.color.set(s.color);
      mat.roughness = s.roughness;
      mat.metalness = s.metalness;
      mat.needsUpdate = true;
    }

    if (edgeSegmentsRef.current) {
      // invert edge color if setting color is very light
      const col = new THREE.Color(s.color);
      const isLight = (col.r + col.g + col.b) / 3 > 0.7;
      (edgeSegmentsRef.current.material as THREE.LineBasicMaterial).color.set(isLight ? 0x111827 : 0xffffff);
    }
    
    if (pointsRef.current) {
      const pMat = pointsRef.current.material as THREE.PointsMaterial;
      pMat.color.set(s.color);
      pMat.needsUpdate = true;
    }
  };

  // Re-run triggers on display adjustments
  useEffect(() => {
    if (!meshRef.current) return;
    applyDisplayMode(settings.mode);
    applyUtilityStates(settings);
  }, [settings.color, settings.mode, settings.roughness, settings.metalness, settings.showGrid, settings.showAxes, settings.showBoundingBox]);

  // 3.5 Dynamic scaling update when modelScale changes
  useEffect(() => {
    if (!meshRef.current) return;
    const s = modelScale / 100;
    
    // Scale 3D meshes
    meshRef.current.scale.setScalar(s);
    if (pointsRef.current) pointsRef.current.scale.setScalar(s);
    if (edgeSegmentsRef.current) edgeSegmentsRef.current.scale.setScalar(s);
    
    // Refresh Bounding Box Outline
    if (boundingBoxRef.current) {
      boundingBoxRef.current.update();
    }
    
    // Recalculate relative bottom coordinate
    const bottomY = bottomYRef.current * s;
    
    // Position Grid helper under the scaled model
    if (gridHelperRef.current) {
      gridHelperRef.current.position.y = bottomY - 0.01;
    }
    
    // Position Axes relative to bottom
    if (axesHelperRef.current && scaleFactorRef.current) {
      const gridBound = Math.max(25, (initialModelWidthRef.current * scaleFactorRef.current * 1.2));
      axesHelperRef.current.position.set(-gridBound, bottomY + 0.1, -gridBound);
    }
    
    // Update Printer Bed plate positions
    if (bedPlateRef.current) {
      bedPlateRef.current.position.y = bottomY - 0.21;
      
      // Update color matching fit warning
      const isTooBig = (initialModelWidthRef.current * s) > 250 || (initialModelDepthRef.current * s) > 250;
      const mat = bedPlateRef.current.material as THREE.MeshStandardMaterial;
      mat.color.set(isTooBig ? new THREE.Color(0xef4444) : new THREE.Color(0xf8fafc)); // warning red or crisp white
      mat.opacity = isTooBig ? 0.35 : 0.6; // slightly more solid red outline
      mat.needsUpdate = true;
    }
    
    if (bedBorderRef.current) {
      bedBorderRef.current.position.y = bottomY - 0.21;
      const isTooBig = (initialModelWidthRef.current * s) > 250 || (initialModelDepthRef.current * s) > 250;
      const borderMat = bedBorderRef.current.material as THREE.LineBasicMaterial;
      borderMat.color.set(isTooBig ? new THREE.Color(0xef4444) : new THREE.Color(0xe2e8f0));
      borderMat.needsUpdate = true;
    }
    
  }, [modelScale]);

  // Camera preset shortcuts
  const adjustCameraPreset = (direction: 'top' | 'front' | 'side' | 'reset') => {
    if (!cameraRef.current || !controlsRef.current || !meshRef.current) return;
    
    // Calculate fit-scale distance
    const bbox = meshRef.current.geometry.boundingBox!;
    const maxDim = Math.max(bbox.max.x - bbox.min.x, bbox.max.y - bbox.min.y, bbox.max.z - bbox.min.z);
    const scale = 1.6;

    controlsRef.current.target.set(0, 0, 0);

    if (direction === 'top') {
      cameraRef.current.position.set(0, maxDim * scale * 2, 0);
    } else if (direction === 'front') {
      cameraRef.current.position.set(0, 0, maxDim * scale * 2);
    } else if (direction === 'side') {
      cameraRef.current.position.set(maxDim * scale * 2, 0, 0);
    } else { // reset perspective
      const distance = maxDim * 1.5;
      cameraRef.current.position.set(distance, distance, distance * 1.2);
    }
    
    controlsRef.current.update();
  };

  const handleZoom = (direction: 'in' | 'out') => {
    if (!cameraRef.current || !controlsRef.current) return;
    const factor = direction === 'in' ? 0.8 : 1.2;
    cameraRef.current.position.multiplyScalar(factor);
    controlsRef.current.update();
  };

  return (
    <div id="stl-viewer-root" className="relative w-full h-full bg-surface2 rounded-none overflow-hidden border border-border flex flex-col min-h-0">
      
      {/* 3D WebGL Canvas container */}
      <div 
        ref={containerRef} 
        id="canvas-container" 
        className="w-full flex-grow relative cursor-grab active:cursor-grabbing" 
      />

      {/* Overlaid UI Widgets */}
      {/* 1. Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 bg-surface/95 backdrop-blur-sm z-35 flex flex-col items-center justify-center">
          <Loader2 className="w-12 h-12 text-orange animate-spin mb-4" />
          <p className="text-text text-sm font-mono uppercase tracking-widest font-bold">Analizando y renderizando STL...</p>
          <p className="text-muted text-[10px] uppercase font-mono mt-2">Calculando métricas volumétricas físicas...</p>
        </div>
      )}

      {/* 2. Error Overlay */}
      {error && (
        <div className="absolute inset-0 bg-red-100/95 backdrop-blur-sm z-35 flex flex-col items-center justify-center p-6 text-center border-2 border-red-250">
          <ShieldAlert className="w-14 h-14 text-red-650 mb-4" />
          <p className="text-text text-base font-semibold font-mono uppercase tracking-wider">Error al cargar modelo STL</p>
          <p className="text-red-850 text-xs max-w-md mt-2 leading-relaxed bg-white/80 p-3 rounded-none border border-red-300 font-mono">{error}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-5 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-none text-xs font-mono font-semibold shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Reintentar
          </button>
        </div>
      )}

      {/* Display Instructions overlay in corner when fine */}
      {!loading && !error && modelData && (
        <div className="absolute top-4 left-4 z-10 pointer-events-none bg-surface/90 backdrop-blur-md px-3 py-2.5 rounded-none border border-border hidden sm:block shadow-sm">
          <p className="text-orange font-mono text-[10px] uppercase tracking-widest mb-2.5 flex items-center gap-1.5 font-bold">
            <span className="w-1.5 h-1.5 bg-orange rounded-full"></span> CONTROLES NAVEGACIÓN
          </p>
          <ul className="text-muted font-mono text-[10px] leading-relaxed space-y-1">
            <li>• <strong className="text-text">Arrastrar:</strong> Rotar modelo</li>
            <li>• <strong className="text-text">Click Der. / Shift:</strong> Desplazar (Pan)</li>
            <li>• <strong className="text-text">Scroll:</strong> Zoom Acercar / Alejar</li>
          </ul>
        </div>
      )}

      {/* Quick Access Floating Controls */}
      {!loading && !error && modelData && (
        <div className="absolute bottom-4 right-4 z-10 flex items-center gap-1 bg-surface/95 backdrop-blur-md p-1 rounded-none border border-border shadow-md">
          <button
            onClick={() => adjustCameraPreset('reset')}
            title="Vista de Perspectiva"
            className="p-1.5 hover:bg-surface2 text-muted hover:text-orange rounded-none transition-all cursor-pointer"
          >
            <Compass className="w-4 h-4" />
          </button>
          
          <div className="h-4 w-[1px] bg-border mx-1" />

          <button
            onClick={() => adjustCameraPreset('top')}
            title="Vista Superior"
            className="px-2 py-1 text-[10px] font-bold font-mono tracking-wider hover:bg-surface2 text-muted hover:text-text rounded-none transition-all uppercase cursor-pointer"
          >
            Top
          </button>
          <button
            onClick={() => adjustCameraPreset('front')}
            title="Vista Frontal"
            className="px-2 py-1 text-[10px] font-bold font-mono tracking-wider hover:bg-surface2 text-muted hover:text-text rounded-none transition-all uppercase cursor-pointer"
          >
            Front
          </button>
          <button
            onClick={() => adjustCameraPreset('side')}
            title="Vista Lateral"
            className="px-2 py-1 text-[10px] font-bold font-mono tracking-wider hover:bg-surface2 text-muted hover:text-text rounded-none transition-all uppercase cursor-pointer"
          >
            Side
          </button>

          <div className="h-4 w-[1px] bg-border mx-1" />

          <button
            onClick={() => handleZoom('in')}
            title="Acercar"
            className="p-1.5 hover:bg-surface2 text-muted hover:text-orange rounded-none transition-all cursor-pointer"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleZoom('out')}
            title="Alejar"
            className="p-1.5 hover:bg-surface2 text-muted hover:text-orange rounded-none transition-all cursor-pointer"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Footer Status Indicators */}
      <div id="canvas-footer" className="bg-surface border-t border-border px-4 py-2.5 flex items-center justify-between text-[10px] text-muted font-mono uppercase tracking-wider">
        <div className="flex items-center gap-1.5 font-semibold">
          <span className={`w-1.5 h-1.5 rounded-full ${modelData ? 'bg-orange animate-pulse' : 'bg-amber-500'}`} />
          <span>{modelData ? 'ENGINE.ST_ONLINE' : 'WAITING.STL'}</span>
        </div>
        {settings.autoRotate && modelData && (
          <div className="flex items-center gap-1.5 text-orange font-bold">
            <RefreshCw className="w-3 h-3 animate-spin" />
            <span>ROTACIÓN_CONSOLA</span>
          </div>
        )}
      </div>
      
    </div>
  );
};
