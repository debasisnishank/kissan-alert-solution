import { useState } from "preact/hooks";
import FarmMap from "./FarmMap.tsx";

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

interface Props {
  customerId: string;
  userId: string;
  customerName: string;
  cropTypes: readonly CropType[];
  irrigationTypes: readonly IrrigationType[];
}

export default function BankFarmForm({
  customerId,
  userId,
  customerName,
  cropTypes,
  irrigationTypes,
}: Props) {
  const [step, setStep] = useState<"info" | "location" | "crop">("info");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Farm info
  const [name, setName] = useState("");
  const [district, setDistrict] = useState("");
  const [state, setState] = useState("Maharashtra");
  const [village, setVillage] = useState("");
  const [soilType, setSoilType] = useState("black_cotton");
  const [waterSource, setWaterSource] = useState("tubewell");
  const [ownershipType, setOwnershipType] = useState("owned");

  // Location
  const [polygonCoords, setPolygonCoords] = useState<number[][]>([]);
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
        return [lng, lat];
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
      const coords = getPolygonPoints();
      if (coords.length < 3) {
        throw new Error("At least 3 points required for polygon");
      }

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

      // Create farm for the customer (not the bank officer)
      const farmRes = await fetch("/api/farms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          farmerId: userId, // This is the customer's user ID
          name,
          polygon,
          district,
          state,
          village,
          soilType,
          waterSource,
          ownershipType,
        }),
      });

      if (!farmRes.ok) {
        const data = await farmRes.json();
        throw new Error(data.error || "Failed to create farm");
      }

      const { data: farm } = await farmRes.json();

      // Create crop declaration if provided
      if (cropType && sowingDate) {
        const currentYear = new Date().getFullYear();
        await fetch("/api/crops", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            farmId: farm.id,
            cropType,
            variety: variety || undefined,
            sowingDate,
            irrigationType,
            season,
            year: currentYear,
          }),
        });
      }

      // Redirect back to customer detail
      globalThis.location.href = `/bank/customers/${customerId}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="bg-white rounded-xl border p-6">
      {/* Customer Info Banner */}
      <div class="mb-6 p-4 bg-indigo-50 rounded-lg">
        <p class="text-sm text-indigo-600">
          Adding farm for: <strong>{customerName}</strong>
        </p>
      </div>

      {/* Progress Steps */}
      <div class="flex items-center gap-2 mb-6">
        {["info", "location", "crop"].map((s, i) => (
          <div key={s} class="flex items-center">
            <div
              class={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step === s ? "bg-indigo-600 text-white" : i <
                    ["info", "location", "crop"].indexOf(step)
                  ? "bg-green-500 text-white"
                  : "bg-gray-200 text-gray-500"
              }`}
            >
              {i + 1}
            </div>
            {i < 2 && <div class="w-8 h-0.5 bg-gray-200 mx-1" />}
          </div>
        ))}
      </div>

      {error && (
        <div class="mb-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Step 1: Farm Info */}
      {step === "info" && (
        <div class="space-y-4">
          <h2 class="text-lg font-semibold text-gray-900">Farm Information</h2>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Farm Name *
            </label>
            <input
              type="text"
              value={name}
              onInput={(e) => setName(e.currentTarget.value)}
              class="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g., North Field"
            />
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Village
              </label>
              <input
                type="text"
                value={village}
                onInput={(e) => setVillage(e.currentTarget.value)}
                class="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                District
              </label>
              <input
                type="text"
                value={district}
                onInput={(e) => setDistrict(e.currentTarget.value)}
                class="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              State
            </label>
            <select
              value={state}
              onChange={(e) => setState(e.currentTarget.value)}
              class="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500"
            >
              <option value="Maharashtra">Maharashtra</option>
              <option value="Madhya Pradesh">Madhya Pradesh</option>
              <option value="Gujarat">Gujarat</option>
              <option value="Rajasthan">Rajasthan</option>
              <option value="Karnataka">Karnataka</option>
              <option value="Andhra Pradesh">Andhra Pradesh</option>
              <option value="Telangana">Telangana</option>
              <option value="Tamil Nadu">Tamil Nadu</option>
              <option value="Uttar Pradesh">Uttar Pradesh</option>
              <option value="Punjab">Punjab</option>
              <option value="Haryana">Haryana</option>
            </select>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Soil Type
              </label>
              <select
                value={soilType}
                onChange={(e) => setSoilType(e.currentTarget.value)}
                class="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500"
              >
                <option value="black_cotton">Black Cotton</option>
                <option value="red">Red Soil</option>
                <option value="alluvial">Alluvial</option>
                <option value="laterite">Laterite</option>
                <option value="sandy">Sandy</option>
                <option value="loamy">Loamy</option>
                <option value="clay">Clay</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Water Source
              </label>
              <select
                value={waterSource}
                onChange={(e) => setWaterSource(e.currentTarget.value)}
                class="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500"
              >
                <option value="tubewell">Tubewell/Borewell</option>
                <option value="canal">Canal</option>
                <option value="well">Open Well</option>
                <option value="river">River/Stream</option>
                <option value="tank">Tank/Pond</option>
                <option value="rainfed">Rainfed Only</option>
              </select>
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Ownership Type
            </label>
            <select
              value={ownershipType}
              onChange={(e) => setOwnershipType(e.currentTarget.value)}
              class="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500"
            >
              <option value="owned">Owned</option>
              <option value="leased">Leased</option>
              <option value="shared">Shared/Joint</option>
              <option value="government">Government Land</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() =>
              name ? setStep("location") : setError("Farm name is required")}
            class="w-full py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700"
          >
            Next: Draw Farm Boundary
          </button>
        </div>
      )}

      {/* Step 2: Location */}
      {step === "location" && (
        <div class="space-y-4">
          <h2 class="text-lg font-semibold text-gray-900">Farm Location</h2>
          <p class="text-sm text-gray-500">
            Draw the farm boundary on the map or enter coordinates manually.
          </p>

          <div class="flex gap-2 mb-4">
            <button
              type="button"
              onClick={() => setUseManualEntry(false)}
              class={`px-4 py-2 rounded-lg text-sm font-medium ${
                !useManualEntry
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              Draw on Map
            </button>
            <button
              type="button"
              onClick={() => setUseManualEntry(true)}
              class={`px-4 py-2 rounded-lg text-sm font-medium ${
                useManualEntry
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              Enter Coordinates
            </button>
          </div>

          {!useManualEntry
            ? (
              <div class="h-[400px] rounded-lg overflow-hidden border">
                <FarmMap
                  editable
                  onPolygonChange={handlePolygonChange}
                  useSatellite
                />
              </div>
            )
            : (
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">
                  Enter coordinates (lat, lng per line)
                </label>
                <textarea
                  value={manualCoords}
                  onInput={(e) => setManualCoords(e.currentTarget.value)}
                  class="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
                  rows={6}
                  placeholder="18.5204, 74.0060&#10;18.5204, 74.0080&#10;18.5224, 74.0080&#10;18.5224, 74.0060"
                />
              </div>
            )}

          {polygonCoords.length > 0 && !useManualEntry && (
            <p class="text-sm text-green-600">
              {polygonCoords.length} points selected
            </p>
          )}

          <div class="flex gap-3">
            <button
              type="button"
              onClick={() => setStep("info")}
              class="flex-1 py-3 border border-gray-300 rounded-lg font-medium hover:bg-gray-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => {
                const coords = getPolygonPoints();
                if (coords.length < 3) {
                  setError("Draw at least 3 points for the farm boundary");
                } else {
                  setStep("crop");
                }
              }}
              class="flex-1 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700"
            >
              Next: Crop Details
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Crop */}
      {step === "crop" && (
        <div class="space-y-4">
          <h2 class="text-lg font-semibold text-gray-900">
            Current Crop (Optional)
          </h2>
          <p class="text-sm text-gray-500">
            Add the current crop if one is planted.
          </p>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Crop Type
            </label>
            <select
              value={cropType}
              onChange={(e) => setCropType(e.currentTarget.value)}
              class="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Select crop (optional)</option>
              {cropTypes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.nameHi})
                </option>
              ))}
            </select>
          </div>

          {cropType && (
            <>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">
                  Variety (Optional)
                </label>
                <input
                  type="text"
                  value={variety}
                  onInput={(e) => setVariety(e.currentTarget.value)}
                  class="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g., JS-335"
                />
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">
                  Sowing Date *
                </label>
                <input
                  type="date"
                  value={sowingDate}
                  onInput={(e) => setSowingDate(e.currentTarget.value)}
                  class="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">
                    Irrigation
                  </label>
                  <select
                    value={irrigationType}
                    onChange={(e) => setIrrigationType(e.currentTarget.value)}
                    class="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                  >
                    {irrigationTypes.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">
                    Season
                  </label>
                  <select
                    value={season}
                    onChange={(e) =>
                      setSeason(
                        e.currentTarget.value as "kharif" | "rabi" | "zaid",
                      )}
                    class="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="kharif">Kharif (Jun-Oct)</option>
                    <option value="rabi">Rabi (Nov-Mar)</option>
                    <option value="zaid">Zaid (Mar-Jun)</option>
                  </select>
                </div>
              </div>
            </>
          )}

          <div class="flex gap-3">
            <button
              type="button"
              onClick={() => setStep("location")}
              class="flex-1 py-3 border border-gray-300 rounded-lg font-medium hover:bg-gray-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading || !!(cropType && !sowingDate)}
              class="flex-1 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create Farm"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
