import { useEffect, useRef, useState } from "preact/hooks";

interface Props {
  center: { lat: number; lng: number };
  polygon: number[][] | null; // [[lat, lon], ...]
  farmName: string;
  height?: string;
}

declare const L: {
  map: (
    el: HTMLElement,
    options?: Record<string, unknown>,
  ) => {
    setView: (center: [number, number], zoom: number) => void;
    remove: () => void;
    fitBounds: (
      bounds: [[number, number], [number, number]],
      options?: Record<string, unknown>,
    ) => void;
    invalidateSize: () => void;
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
  marker: (
    latlng: [number, number],
    options?: Record<string, unknown>,
  ) => {
    addTo: (map: unknown) => unknown;
    bindPopup: (content: string) => unknown;
  };
};

export default function FarmMapPreview({
  center,
  polygon,
  farmName,
  height = "200px",
}: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<ReturnType<typeof L.map> | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const loadLeaflet = () => {
      if (typeof L !== "undefined") {
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

      // Load Leaflet JS
      const script = document.createElement("script");
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.onload = () => setTimeout(initMap, 100);
      document.head.appendChild(script);
    };

    const initMap = () => {
      if (!mapRef.current || mapInstance.current) return;

      const map = L.map(mapRef.current, {
        center: [center.lat, center.lng],
        zoom: 15,
        zoomControl: false,
        attributionControl: false,
        dragging: true,
        scrollWheelZoom: false,
      });

      // Satellite layer with labels. Esri's imagery isn't captured at high
      // zoom everywhere (rural India especially) -- past maxNativeZoom it
      // serves an opaque "Map data not yet available" placeholder tile
      // instead of a 404, so cap it here and let Leaflet upscale the last
      // real tile for closer zooms instead.
      const satelliteLayer = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 19, maxNativeZoom: 17 },
      );
      satelliteLayer.addTo(map);

      // Add labels overlay
      const labelsLayer = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 19 },
      );
      labelsLayer.addTo(map);

      // Add farm polygon if available
      if (polygon && polygon.length >= 3) {
        const latlngs: [number, number][] = polygon.map((coord) => [
          coord[0],
          coord[1],
        ]);
        const poly = L.polygon(latlngs, {
          color: "#22c55e",
          fillColor: "#22c55e",
          fillOpacity: 0.25,
          weight: 3,
        });
        poly.addTo(map);

        // Fit bounds to polygon
        const bounds = poly.getBounds();
        map.fitBounds(
          [
            [bounds.getSouthWest().lat, bounds.getSouthWest().lng],
            [bounds.getNorthEast().lat, bounds.getNorthEast().lng],
          ],
          { padding: [20, 20] },
        );
      } else {
        // Just center on the point
        map.setView([center.lat, center.lng], 16);
        // Add marker for farm center
        const marker = L.marker([center.lat, center.lng]);
        marker.addTo(map);
        marker.bindPopup(farmName);
      }

      mapInstance.current = map;
      setIsLoading(false);

      // Ensure proper sizing
      setTimeout(() => map.invalidateSize(), 100);
    };

    loadLeaflet();

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [center.lat, center.lng, polygon, farmName]);

  return (
    <div
      class="relative rounded-lg overflow-hidden"
      style={{ height, maxHeight: height, position: "relative", zIndex: 0 }}
    >
      {isLoading && (
        <div class="absolute inset-0 bg-gray-100 flex items-center justify-center z-10">
          <div class="animate-pulse text-gray-400">Loading map...</div>
        </div>
      )}
      <div
        ref={mapRef}
        class="w-full h-full"
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />
      {/* Map overlay with farm name */}
      <div class="absolute bottom-2 left-2 bg-black/60 text-white px-2 py-1 rounded text-xs z-20">
        📍 {farmName}
      </div>
    </div>
  );
}
