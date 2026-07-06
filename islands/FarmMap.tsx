import { useEffect, useRef, useState } from "preact/hooks";

interface Props {
  center?: { lat: number; lng: number };
  zoom?: number;
  polygon?: number[][];
  onPolygonChange?: (polygon: number[][]) => void;
  editable?: boolean;
  showLayers?: boolean;
  height?: string;
  useSatellite?: boolean;
}

declare const L: {
  map: (
    el: HTMLElement,
    options?: Record<string, unknown>,
  ) => {
    setView: (center: [number, number], zoom: number) => void;
    remove: () => void;
    fitBounds: (bounds: [[number, number], [number, number]]) => void;
    addLayer: (layer: unknown) => void;
    removeLayer: (layer: unknown) => void;
    on: (event: string, callback: (e?: unknown) => void) => void;
    addControl: (control: unknown) => void;
    locate: (options?: Record<string, unknown>) => void;
  };
  tileLayer: (
    url: string,
    options?: Record<string, unknown>,
  ) => {
    addTo: (map: unknown) => unknown;
  };
  polygon: (
    latlngs: [number, number][],
    options?: Record<string, unknown>,
  ) => {
    addTo: (map: unknown) => unknown;
    getBounds: () => {
      getNorthEast: () => { lat: number; lng: number };
      getSouthWest: () => { lat: number; lng: number };
    };
  };
  control: {
    layers: (
      baseLayers: Record<string, unknown>,
      overlays?: Record<string, unknown>,
      options?: Record<string, unknown>,
    ) => { addTo: (map: unknown) => void };
  };
  Control: {
    Draw: new (
      options: Record<string, unknown>,
    ) => { addTo: (map: unknown) => void };
  };
  FeatureGroup: new () => {
    addTo: (map: unknown) => unknown;
    addLayer: (layer: unknown) => void;
    clearLayers: () => void;
    getLayers: () => Array<{
      getLatLngs: () => Array<Array<{ lat: number; lng: number }>>;
    }>;
  };
  marker: (
    latlng: [number, number],
    options?: Record<string, unknown>,
  ) => { addTo: (map: unknown) => unknown; remove: () => void };
  circle: (
    latlng: [number, number],
    options?: Record<string, unknown>,
  ) => { addTo: (map: unknown) => unknown };
};

export default function FarmMap({
  center = { lat: 20.5937, lng: 78.9629 },
  zoom = 5,
  polygon,
  onPolygonChange,
  editable = false,
  showLayers = true,
  height = "400px",
  useSatellite = true,
}: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<ReturnType<typeof L.map> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [locating, setLocating] = useState(false);

  const goToCurrentLocation = () => {
    if (!mapInstance.current) return;

    setLocating(true);

    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          mapInstance.current?.setView([latitude, longitude], 16);
          setLocating(false);
        },
        (error) => {
          console.error("Geolocation error:", error);
          alert(
            "Could not get your location. Please enable location services.",
          );
          setLocating(false);
        },
        { enableHighAccuracy: true, timeout: 10000 },
      );
    } else {
      alert("Geolocation is not supported by your browser");
      setLocating(false);
    }
  };

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const loadLeaflet = () => {
      if (typeof L !== "undefined" && L.Control?.Draw) {
        initMap();
        return;
      }

      // Load Leaflet CSS
      if (!document.querySelector('link[href*="leaflet.css"]')) {
        const cssLink = document.createElement("link");
        cssLink.rel = "stylesheet";
        cssLink.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(cssLink);
      }

      // Load Draw plugin CSS
      if (!document.querySelector('link[href*="leaflet.draw.css"]')) {
        const drawCssLink = document.createElement("link");
        drawCssLink.rel = "stylesheet";
        drawCssLink.href =
          "https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.css";
        document.head.appendChild(drawCssLink);
      }

      // Load Leaflet JS
      if (typeof L === "undefined") {
        const script = document.createElement("script");
        script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
        script.onload = () => loadDrawPlugin();
        document.head.appendChild(script);
      } else {
        loadDrawPlugin();
      }
    };

    const loadDrawPlugin = () => {
      if (typeof L !== "undefined" && L.Control?.Draw) {
        initMap();
        return;
      }

      const drawScript = document.createElement("script");
      drawScript.src =
        "https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.js";
      drawScript.onload = () => {
        // Small delay to ensure plugin is ready
        setTimeout(initMap, 100);
      };
      document.head.appendChild(drawScript);
    };

    const initMap = () => {
      if (!mapRef.current || mapInstance.current) return;

      // Initialize map
      const map = L.map(mapRef.current, {
        center: [center.lat, center.lng],
        zoom: zoom,
        maxBounds: [
          [6.0, 68.0],
          [37.0, 97.5],
        ],
        maxBoundsViscosity: 0.8,
      });

      // Base layers - Satellite as default
      const satelliteLayer = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
          attribution: "Tiles &copy; Esri",
          maxZoom: 19,
        },
      );

      const osmLayer = L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          attribution: "&copy; OpenStreetMap contributors",
          maxZoom: 19,
        },
      );

      const hybridLayer = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
        {
          attribution: "Labels &copy; Esri",
          maxZoom: 19,
        },
      );

      // Add default layer based on useSatellite prop
      if (useSatellite) {
        satelliteLayer.addTo(map);
        // Always add labels on top of satellite by default
        hybridLayer.addTo(map);
      } else {
        osmLayer.addTo(map);
      }

      // Layer control
      if (showLayers) {
        const baseLayers: Record<string, unknown> = {
          "Satellite": satelliteLayer,
          "Street Map": osmLayer,
        };

        const overlays: Record<string, unknown> = {
          "Labels": hybridLayer,
        };

        L.control.layers(baseLayers, overlays, { position: "topright" }).addTo(
          map,
        );
      }

      // Drawing controls for editable mode
      if (editable) {
        const drawnItems = new L.FeatureGroup();
        drawnItems.addTo(map);

        // Add existing polygon if provided
        if (polygon && polygon.length >= 3) {
          const latlngs: [number, number][] = polygon.map((coord) => [
            coord[1],
            coord[0],
          ]);
          const poly = L.polygon(latlngs, {
            color: "#22c55e",
            fillColor: "#22c55e",
            fillOpacity: 0.3,
            weight: 3,
          });
          drawnItems.addLayer(poly);

          const bounds = poly.getBounds();
          map.fitBounds([
            [bounds.getSouthWest().lat, bounds.getSouthWest().lng],
            [bounds.getNorthEast().lat, bounds.getNorthEast().lng],
          ]);
        }

        // Add draw control
        if (L.Control?.Draw) {
          const drawControl = new L.Control.Draw({
            position: "topleft",
            draw: {
              polygon: {
                allowIntersection: false,
                showArea: true,
                shapeOptions: {
                  color: "#22c55e",
                  fillColor: "#22c55e",
                  fillOpacity: 0.3,
                  weight: 3,
                },
              },
              polyline: false,
              rectangle: false,
              circle: false,
              marker: false,
              circlemarker: false,
            },
            edit: {
              featureGroup: drawnItems,
              remove: true,
            },
          });
          drawControl.addTo(map);

          // Handle draw:created event
          map.on("draw:created", (e: { layer: unknown }) => {
            drawnItems.clearLayers();
            drawnItems.addLayer(e.layer);

            const layer = e.layer as {
              getLatLngs: () => Array<Array<{ lat: number; lng: number }>>;
            };
            const latlngs = layer.getLatLngs()[0];
            const coords = latlngs.map((ll) => [ll.lng, ll.lat]);
            onPolygonChange?.(coords);
          });

          // Handle draw:edited event
          map.on("draw:edited", () => {
            const layers = drawnItems.getLayers();
            if (layers.length > 0) {
              const latlngs = layers[0].getLatLngs()[0];
              const coords = latlngs.map((ll) => [ll.lng, ll.lat]);
              onPolygonChange?.(coords);
            }
          });

          // Handle draw:deleted event
          map.on("draw:deleted", () => {
            onPolygonChange?.([]);
          });
        }
      } else if (polygon && polygon.length >= 3) {
        // Display-only polygon
        const latlngs: [number, number][] = polygon.map((coord) => [
          coord[1],
          coord[0],
        ]);
        const poly = L.polygon(latlngs, {
          color: "#22c55e",
          fillColor: "#22c55e",
          fillOpacity: 0.3,
          weight: 3,
        });
        poly.addTo(map);

        const bounds = poly.getBounds();
        map.fitBounds([
          [bounds.getSouthWest().lat, bounds.getSouthWest().lng],
          [bounds.getNorthEast().lat, bounds.getNorthEast().lng],
        ]);
      }

      mapInstance.current = map;
      setIsLoading(false);
    };

    loadLeaflet();

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, []);

  return (
    <div class="relative">
      {isLoading && (
        <div
          class="absolute inset-0 bg-gray-100 flex items-center justify-center z-10 rounded-lg"
          style={{ height }}
        >
          <div class="text-center">
            <div class="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto mb-2" />
            <p class="text-gray-500 text-sm">Loading map...</p>
          </div>
        </div>
      )}

      <div
        ref={mapRef}
        style={{ height, width: "100%" }}
        class="rounded-lg overflow-hidden border border-gray-200"
      />

      {/* Current Location Button */}
      <button
        type="button"
        onClick={goToCurrentLocation}
        disabled={isLoading || locating}
        class="absolute bottom-4 right-4 z-[1000] bg-white p-3 rounded-full shadow-lg hover:bg-gray-50 disabled:opacity-50 border border-gray-200"
        title="Go to current location"
      >
        {locating
          ? (
            <div class="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          )
          : (
            <svg
              class="w-5 h-5 text-gray-700"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
              />
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          )}
      </button>

      {editable && (
        <div class="mt-2 p-3 bg-blue-50 rounded-lg border border-blue-100">
          <p class="text-sm text-blue-800 font-medium mb-1">
            How to draw your farm boundary:
          </p>
          <ol class="text-xs text-blue-700 list-decimal list-inside space-y-1">
            <li>
              Click the <strong>polygon icon</strong>{" "}
              (pentagon shape) in the top-left toolbar
            </li>
            <li>Click on the map to add corners of your farm</li>
            <li>Click the first point again or click "Finish" to complete</li>
            <li>Use the location button (bottom-right) to find your farm</li>
          </ol>
        </div>
      )}
    </div>
  );
}
