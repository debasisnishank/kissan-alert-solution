import { useState } from "preact/hooks";
import FarmMap from "./FarmMap.tsx";
import { INDIAN_STATES } from "$utils/constants.ts";

interface CropType {
  id: string;
  name: string;
  nameHi: string;
}

interface IrrigationType {
  id: string;
  name: string;
  nameHi: string;
}

interface EditableFarm {
  id: string;
  name: string;
  state: string;
  district: string;
  village: string;
  soilType: string;
  waterSource: string;
  // GeoJSON order: [lon, lat], same as FarmMap/onPolygonChange.
  polygonCoords: number[][];
}

interface Props {
  cropTypes: readonly CropType[];
  irrigationTypes: readonly IrrigationType[];
  farm?: EditableFarm;
}

export default function FarmForm({ cropTypes, irrigationTypes, farm }: Props) {
  const isEdit = !!farm;
  const knownSoilIds = [
    "black_cotton",
    "red",
    "alluvial",
    "laterite",
    "sandy",
    "clay",
  ];

  const [step, setStep] = useState<"info" | "location" | "crop">("info");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Farm info
  const [name, setName] = useState(farm?.name ?? "");
  const [district, setDistrict] = useState(farm?.district ?? "");
  const [state, setState] = useState(farm?.state ?? "Maharashtra");
  const [village, setVillage] = useState(farm?.village ?? "");
  const [soilType, setSoilType] = useState(
    farm && !knownSoilIds.includes(farm.soilType) ? "other" : (
      farm?.soilType ?? "black_cotton"
    ),
  );
  const [soilTypeOther, setSoilTypeOther] = useState(
    farm && !knownSoilIds.includes(farm.soilType) ? farm.soilType : "",
  );
  const [waterSource, setWaterSource] = useState(
    farm && !irrigationTypes.some((t) => t.id === farm.waterSource)
      ? "other"
      : (farm?.waterSource ?? "tubewell"),
  );
  const [waterSourceOther, setWaterSourceOther] = useState(
    farm && !irrigationTypes.some((t) => t.id === farm.waterSource)
      ? farm.waterSource
      : "",
  );

  // Location - using map polygon drawing
  const [polygonCoords, setPolygonCoords] = useState<number[][]>(
    farm?.polygonCoords ?? [],
  );
  const [manualCoords, setManualCoords] = useState("");
  const [useManualEntry, setUseManualEntry] = useState(false);

  // Crop info
  const [cropType, setCropType] = useState("");
  const [variety, setVariety] = useState("");
  const [sowingDate, setSowingDate] = useState("");
  const [irrigationType, setIrrigationType] = useState("rainfed");
  const [season, setSeason] = useState<"kharif" | "rabi" | "zaid">("kharif");

  const parseCoordinates = (text: string): number[][] => {
    try {
      const lines = text.trim().split("\n");
      return lines.map((line) => {
        const [lat, lng] = line.split(",").map((s) => parseFloat(s.trim()));
        if (isNaN(lat) || isNaN(lng)) throw new Error("Invalid coordinates");
        return [lng, lat]; // GeoJSON format: [lon, lat]
      });
    } catch {
      return [];
    }
  };

  const handlePolygonChange = (coords: number[][]) => {
    setPolygonCoords(coords);
  };

  const getPolygonPoints = (): number[][] => {
    if (useManualEntry && manualCoords) {
      return parseCoordinates(manualCoords);
    }
    return polygonCoords;
  };

  const handleSubmit = async () => {
    setError("");
    setLoading(true);

    try {
      // Get polygon coordinates
      const coords = getPolygonPoints();
      if (coords.length < 3) {
        throw new Error("At least 3 points required for polygon");
      }

      // Close the polygon if not already closed
      const closedCoords = [...coords];
      if (
        coords[0][0] !== coords[coords.length - 1][0] ||
        coords[0][1] !== coords[coords.length - 1][1]
      ) {
        closedCoords.push(coords[0]);
      }

      const polygon = {
        type: "Polygon" as const,
        coordinates: [closedCoords],
      };

      const body = {
        name,
        polygon,
        district,
        state,
        village,
        soilType: soilType === "other" ? soilTypeOther.trim() : soilType,
        waterSource: waterSource === "other"
          ? waterSourceOther.trim()
          : waterSource,
      };

      const farmRes = await fetch(
        farm ? `/api/farms/${farm.id}` : "/api/farms",
        {
          method: farm ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );

      if (!farmRes.ok) {
        const data = await farmRes.json();
        throw new Error(
          data.error ||
            (isEdit ? "Failed to update farm" : "Failed to create farm"),
        );
      }

      const { data: savedFarm } = await farmRes.json();

      if (isEdit) {
        globalThis.location.href = `/app/farm/${savedFarm.id}`;
        return;
      }

      // Create crop declaration if provided
      if (cropType && sowingDate) {
        const currentYear = new Date().getFullYear();
        await fetch("/api/crops", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            farmId: savedFarm.id,
            cropType,
            variety: variety || undefined,
            sowingDate,
            irrigationType,
            season,
            year: currentYear,
          }),
        });
      }

      // Redirect to processing screen to fetch satellite data
      globalThis.location.href = `/app/farm/processing/${savedFarm.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const states = INDIAN_STATES;

  const soilTypes = [
    { id: "black_cotton", name: "Black Cotton (Vertisol)" },
    { id: "red", name: "Red Soil" },
    { id: "alluvial", name: "Alluvial" },
    { id: "laterite", name: "Laterite" },
    { id: "sandy", name: "Sandy" },
    { id: "clay", name: "Clay" },
    { id: "other", name: "Other" },
  ];

  return (
    <div>
      {error && (
        <div class="bg-red-50 text-red-600 text-sm p-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      {/* Progress Steps */}
      <div class="flex items-center justify-between mb-6">
        {(isEdit ? ["info", "location"] : ["info", "location", "crop"]).map((
          s,
          i,
          steps,
        ) => (
          <div key={s} class="flex items-center">
            <div
              class={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                step === s
                  ? "bg-primary-600 text-white"
                  : i < steps.indexOf(step)
                  ? "bg-primary-100 text-primary-600"
                  : "bg-gray-100 text-gray-400"
              }`}
            >
              {i + 1}
            </div>
            {i < steps.length - 1 &&
              <div class="w-12 h-0.5 bg-gray-200 mx-2" />}
          </div>
        ))}
      </div>

      {/* Step 1: Basic Info */}
      {step === "info" && (
        <div class="space-y-4">
          <h2 class="text-lg font-semibold text-gray-900">
            {isEdit ? "Edit Farm Details" : "Farm Details"}
          </h2>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Farm Name *
            </label>
            <input
              type="text"
              value={name}
              onInput={(e) => setName((e.target as HTMLInputElement).value)}
              placeholder="e.g., North Field"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              required
            />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                State
              </label>
              <select
                value={state}
                onChange={(e) =>
                  setState((e.target as HTMLSelectElement).value)}
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              >
                {states.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                District
              </label>
              <input
                type="text"
                value={district}
                onInput={(e) =>
                  setDistrict((e.target as HTMLInputElement).value)}
                placeholder="e.g., Pune"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Village
            </label>
            <input
              type="text"
              value={village}
              onInput={(e) => setVillage((e.target as HTMLInputElement).value)}
              placeholder="e.g., Khed"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Soil Type
              </label>
              <select
                value={soilType}
                onChange={(e) =>
                  setSoilType((e.target as HTMLSelectElement).value)}
                class="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                {soilTypes.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              {soilType === "other" && (
                <input
                  type="text"
                  value={soilTypeOther}
                  onInput={(e) =>
                    setSoilTypeOther((e.target as HTMLInputElement).value)}
                  placeholder="Enter soil type"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg mt-2"
                />
              )}
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Water Source
              </label>
              <select
                value={waterSource}
                onChange={(e) =>
                  setWaterSource((e.target as HTMLSelectElement).value)}
                class="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                {irrigationTypes.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
                <option value="other">Other</option>
              </select>
              {waterSource === "other" && (
                <input
                  type="text"
                  value={waterSourceOther}
                  onInput={(e) =>
                    setWaterSourceOther((e.target as HTMLInputElement).value)}
                  placeholder="Enter water source"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg mt-2"
                />
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setStep("location")}
            disabled={!name}
            class="w-full bg-primary-600 text-white py-3 rounded-lg font-semibold hover:bg-primary-700 disabled:opacity-50"
          >
            {isEdit ? "Next: Farm Boundary" : "Next: Add Location"}
          </button>
        </div>
      )}

      {/* Step 2: Location/Polygon */}
      {step === "location" && (
        <div class="space-y-4">
          <h2 class="text-lg font-semibold text-gray-900">Farm Boundary</h2>
          <p class="text-sm text-gray-500">
            Draw your farm boundary on the map or enter coordinates manually.
          </p>

          {/* Toggle between map and manual entry */}
          <div class="flex gap-2 mb-3">
            <button
              type="button"
              onClick={() => setUseManualEntry(false)}
              class={`flex-1 py-2 px-3 rounded-lg text-sm font-medium ${
                !useManualEntry
                  ? "bg-primary-100 text-primary-700 border-2 border-primary-500"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              Draw on Map
            </button>
            <button
              type="button"
              onClick={() => setUseManualEntry(true)}
              class={`flex-1 py-2 px-3 rounded-lg text-sm font-medium ${
                useManualEntry
                  ? "bg-primary-100 text-primary-700 border-2 border-primary-500"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              Enter Coordinates
            </button>
          </div>

          {!useManualEntry
            ? (
              <>
                {/* Leaflet Map with drawing tools */}
                <FarmMap
                  center={{ lat: 20.5937, lng: 78.9629 }}
                  zoom={5}
                  editable
                  polygon={polygonCoords}
                  onPolygonChange={handlePolygonChange}
                  showLayers
                  height="350px"
                />
                {polygonCoords.length >= 3 && (
                  <div class="bg-green-50 p-3 rounded-lg">
                    <p class="text-sm text-green-700">
                      ✓ {polygonCoords.length} points detected
                    </p>
                  </div>
                )}
              </>
            )
            : (
              <>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">
                    Polygon Coordinates (lat, lng per line) *
                  </label>
                  <textarea
                    value={manualCoords}
                    onInput={(e) =>
                      setManualCoords((e.target as HTMLTextAreaElement).value)}
                    placeholder="18.5204, 74.0060&#10;18.5204, 74.0080&#10;18.5224, 74.0080&#10;18.5224, 74.0060"
                    class="w-full px-3 py-2 border border-gray-300 rounded-lg h-32 font-mono text-sm"
                    required
                  />
                  <p class="text-xs text-gray-500 mt-1">
                    Enter at least 3 corner points. Get coordinates from Google
                    Maps.
                  </p>
                </div>

                {manualCoords && parseCoordinates(manualCoords).length >= 3 && (
                  <div class="bg-green-50 p-3 rounded-lg">
                    <p class="text-sm text-green-700">
                      ✓ {parseCoordinates(manualCoords).length} points detected
                    </p>
                  </div>
                )}
              </>
            )}

          <div class="flex gap-3">
            <button
              type="button"
              onClick={() => setStep("info")}
              class="flex-1 border border-gray-300 py-3 rounded-lg font-semibold hover:bg-gray-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => isEdit ? handleSubmit() : setStep("crop")}
              disabled={getPolygonPoints().length < 3 || loading}
              class="flex-1 bg-primary-600 text-white py-3 rounded-lg font-semibold hover:bg-primary-700 disabled:opacity-50"
            >
              {isEdit
                ? (loading ? "Saving..." : "Save Changes")
                : "Next: Add Crop"}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Crop Declaration */}
      {step === "crop" && (
        <div class="space-y-4">
          <h2 class="text-lg font-semibold text-gray-900">Current Crop</h2>
          <p class="text-sm text-gray-500">
            Optional: Add crop details for better advisories
          </p>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Crop
            </label>
            <select
              value={cropType}
              onChange={(e) =>
                setCropType((e.target as HTMLSelectElement).value)}
              class="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">Select crop (optional)</option>
              {cropTypes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {cropType && (
            <>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">
                  Variety (optional)
                </label>
                <input
                  type="text"
                  value={variety}
                  onInput={(e) =>
                    setVariety((e.target as HTMLInputElement).value)}
                  placeholder="e.g., JS-335"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">
                  Sowing Date *
                </label>
                <input
                  type="date"
                  value={sowingDate}
                  onInput={(e) =>
                    setSowingDate((e.target as HTMLInputElement).value)}
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  required
                />
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">
                    Season
                  </label>
                  <select
                    value={season}
                    onChange={(e) =>
                      setSeason(
                        (e.target as HTMLSelectElement)
                          .value as typeof season,
                      )}
                    class="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="kharif">Kharif (Jun-Oct)</option>
                    <option value="rabi">Rabi (Nov-Mar)</option>
                    <option value="zaid">Zaid (Mar-Jun)</option>
                  </select>
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">
                    Irrigation
                  </label>
                  <select
                    value={irrigationType}
                    onChange={(e) =>
                      setIrrigationType((e.target as HTMLSelectElement).value)}
                    class="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    {irrigationTypes.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}

          <div class="flex gap-3">
            <button
              type="button"
              onClick={() => setStep("location")}
              class="flex-1 border border-gray-300 py-3 rounded-lg font-semibold hover:bg-gray-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading || !!(cropType && !sowingDate)}
              class="flex-1 bg-primary-600 text-white py-3 rounded-lg font-semibold hover:bg-primary-700 disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create Farm"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
