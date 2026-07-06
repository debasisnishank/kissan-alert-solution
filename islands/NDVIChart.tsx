interface Observation {
  date: string;
  ndvi: number;
  rainfall: number;
  isPrediction?: boolean;
}

interface Props {
  observations: Observation[];
  showPredictions?: boolean;
  cropType?: string;
  daysAfterSowing?: number;
}

// Crop-specific NDVI prediction curves
const CROP_NDVI_CURVES: Record<string, number[]> = {
  wheat: [
    0.15,
    0.25,
    0.40,
    0.55,
    0.70,
    0.80,
    0.85,
    0.82,
    0.75,
    0.60,
    0.45,
    0.30,
  ],
  rice: [
    0.12,
    0.20,
    0.35,
    0.50,
    0.65,
    0.78,
    0.85,
    0.88,
    0.82,
    0.70,
    0.50,
    0.35,
  ],
  cotton: [
    0.10,
    0.18,
    0.30,
    0.45,
    0.60,
    0.72,
    0.80,
    0.82,
    0.78,
    0.65,
    0.50,
    0.40,
  ],
  soybean: [
    0.12,
    0.22,
    0.38,
    0.55,
    0.70,
    0.80,
    0.82,
    0.75,
    0.60,
    0.40,
    0.25,
    0.15,
  ],
  maize: [
    0.10,
    0.20,
    0.35,
    0.52,
    0.68,
    0.80,
    0.85,
    0.82,
    0.72,
    0.55,
    0.38,
    0.22,
  ],
  default: [
    0.12,
    0.22,
    0.38,
    0.55,
    0.70,
    0.80,
    0.82,
    0.78,
    0.68,
    0.52,
    0.38,
    0.25,
  ],
};

function generatePredictions(
  lastNdvi: number,
  cropType: string,
  daysAfterSowing: number,
  daysToPredict: number = 30,
): Observation[] {
  const predictions: Observation[] = [];
  const curve = CROP_NDVI_CURVES[cropType] || CROP_NDVI_CURVES.default;
  const totalDays = 120; // Typical crop cycle

  for (let i = 1; i <= daysToPredict; i += 5) {
    const futureDay = daysAfterSowing + i;
    const stageIndex = Math.min(
      Math.floor((futureDay / totalDays) * curve.length),
      curve.length - 1,
    );
    const baseNdvi = curve[stageIndex];

    // Add some variance based on current health
    const healthFactor = lastNdvi / 0.7; // Normalize against expected healthy value
    const predictedNdvi = Math.max(
      0.1,
      Math.min(0.95, baseNdvi * healthFactor * (0.95 + Math.random() * 0.1)),
    );

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + i);

    predictions.push({
      date: futureDate.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
      }),
      ndvi: predictedNdvi,
      rainfall: 0,
      isPrediction: true,
    });
  }

  return predictions;
}

export default function NDVIChart(
  {
    observations,
    showPredictions = true,
    cropType = "wheat",
    daysAfterSowing = 60,
  }: Props,
) {
  // If no observations, generate estimated historical data based on crop stage
  let displayObservations = observations;
  if (observations.length === 0 && daysAfterSowing > 0) {
    const curve = CROP_NDVI_CURVES[cropType] || CROP_NDVI_CURVES.default;
    const totalDays = 120;
    const estimatedData: Observation[] = [];

    // Generate past 30 days of estimated data
    for (let i = 30; i >= 0; i -= 5) {
      const pastDay = Math.max(1, daysAfterSowing - i);
      const stageIndex = Math.min(
        Math.floor((pastDay / totalDays) * curve.length),
        curve.length - 1,
      );
      const baseNdvi = curve[stageIndex];
      const ndvi = baseNdvi * (0.95 + Math.random() * 0.1);

      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - i);

      estimatedData.push({
        date: pastDate.toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
        }),
        ndvi: Math.max(0.1, Math.min(0.95, ndvi)),
        rainfall: Math.random() > 0.7 ? Math.floor(Math.random() * 20) : 0,
      });
    }
    displayObservations = estimatedData;
  }

  // Generate predictions if enabled
  const lastObservation = displayObservations[displayObservations.length - 1];
  const predictions = showPredictions && lastObservation
    ? generatePredictions(lastObservation.ndvi, cropType, daysAfterSowing)
    : [];

  const allData = [...displayObservations, ...predictions];

  if (allData.length === 0) {
    return (
      <div class="h-40 flex items-center justify-center text-gray-400 text-sm">
        No satellite data yet. Add a crop to see health predictions.
      </div>
    );
  }

  const maxNdvi = Math.max(...allData.map((o) => o.ndvi), 0.1);
  const maxRainfall = Math.max(
    ...displayObservations.map((o) => o.rainfall),
    10,
  );

  const width = 100;
  const height = 140;
  const padding = { top: 15, right: 10, bottom: 30, left: 10 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Find index where predictions start
  const predictionStartIndex = displayObservations.length;

  // Generate historical path
  const historicalPoints = displayObservations.map((o, i) => {
    const x = padding.left + (i / (allData.length - 1)) * chartWidth;
    const y = padding.top + chartHeight - (o.ndvi / maxNdvi) * chartHeight;
    return `${x},${y}`;
  });
  const historicalPath = historicalPoints.length > 1
    ? `M ${historicalPoints.join(" L ")}`
    : "";

  // Generate prediction path (dashed)
  const predictionPoints = predictions.map((o, i) => {
    const idx = predictionStartIndex + i;
    const x = padding.left + (idx / (allData.length - 1)) * chartWidth;
    const y = padding.top + chartHeight - (o.ndvi / maxNdvi) * chartHeight;
    return `${x},${y}`;
  });

  // Connect to last historical point
  let predictionPath = "";
  if (predictionPoints.length > 0 && historicalPoints.length > 0) {
    predictionPath = `M ${historicalPoints[historicalPoints.length - 1]} L ${
      predictionPoints.join(" L ")
    }`;
  }

  // Generate area under historical curve
  const areaPath = historicalPoints.length > 1
    ? `M ${padding.left},${padding.top + chartHeight} L ${
      historicalPath.slice(2)
    } L ${
      padding.left +
      ((observations.length - 1) / (allData.length - 1)) * chartWidth
    },${padding.top + chartHeight} Z`
    : "";

  // Divider line between historical and prediction
  const dividerX = padding.left +
    ((predictionStartIndex - 1) / (allData.length - 1)) * chartWidth;

  // X-axis labels
  const xLabels: Array<{ label: string; x: number; isPrediction: boolean }> =
    [];
  const labelInterval = Math.ceil(allData.length / 6);

  allData.forEach((o, i) => {
    if (
      i % labelInterval === 0 || i === allData.length - 1 ||
      i === predictionStartIndex - 1
    ) {
      xLabels.push({
        label: o.date,
        x: padding.left + (i / (allData.length - 1)) * chartWidth,
        isPrediction: o.isPrediction || false,
      });
    }
  });

  return (
    <div class="relative">
      {/* Timeline labels */}
      <div class="flex justify-between text-xs mb-2">
        <span class="text-gray-500">← Past</span>
        <span class="text-gray-900 font-medium">Today</span>
        <span class="text-orange-500">Future →</span>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} class="w-full h-48">
        {/* Grid lines */}
        {[0.25, 0.5, 0.75, 1].map((ratio) => (
          <line
            key={ratio}
            x1={padding.left}
            y1={padding.top + chartHeight * (1 - ratio)}
            x2={padding.left + chartWidth}
            y2={padding.top + chartHeight * (1 - ratio)}
            stroke="#e5e7eb"
            stroke-width="0.3"
          />
        ))}

        {/* Prediction zone background */}
        {predictions.length > 0 && (
          <rect
            x={dividerX}
            y={padding.top}
            width={chartWidth - (dividerX - padding.left)}
            height={chartHeight}
            fill="#fef3c7"
            opacity="0.3"
          />
        )}

        {/* Today marker line */}
        {predictions.length > 0 && (
          <line
            x1={dividerX}
            y1={padding.top - 5}
            x2={dividerX}
            y2={padding.top + chartHeight}
            stroke="#f59e0b"
            stroke-width="1"
            stroke-dasharray="2,2"
          />
        )}

        {/* Historical area fill */}
        {areaPath && (
          <path d={areaPath} fill="url(#ndviGradient)" opacity="0.3" />
        )}

        {/* Historical NDVI line (solid) */}
        {historicalPath && (
          <path
            d={historicalPath}
            fill="none"
            stroke="#16a34a"
            stroke-width="1.5"
            stroke-linecap="round"
          />
        )}

        {/* Prediction NDVI line (dashed) */}
        {predictionPath && (
          <path
            d={predictionPath}
            fill="none"
            stroke="#f59e0b"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-dasharray="3,2"
          />
        )}

        {/* Rainfall bars (historical only) */}
        {observations.map((o, i) => {
          if (o.rainfall <= 0) {
            return null;
          }
          const x = padding.left + (i / (allData.length - 1)) * chartWidth;
          const barHeight = (o.rainfall / maxRainfall) * (chartHeight * 0.25);
          return (
            <rect
              key={i}
              x={x - 1}
              y={padding.top + chartHeight - barHeight}
              width="2"
              height={barHeight}
              fill="#3b82f6"
              opacity="0.6"
            />
          );
        })}

        {/* Historical data points */}
        {observations.map((o, i) => {
          const x = padding.left + (i / (allData.length - 1)) * chartWidth;
          const y = padding.top + chartHeight -
            (o.ndvi / maxNdvi) * chartHeight;
          return (
            <circle
              key={`hist-${i}`}
              cx={x}
              cy={y}
              r="2"
              fill="#16a34a"
            />
          );
        })}

        {/* Prediction data points (hollow) */}
        {predictions.map((o, i) => {
          const idx = predictionStartIndex + i;
          const x = padding.left + (idx / (allData.length - 1)) * chartWidth;
          const y = padding.top + chartHeight -
            (o.ndvi / maxNdvi) * chartHeight;
          return (
            <circle
              key={`pred-${i}`}
              cx={x}
              cy={y}
              r="2"
              fill="white"
              stroke="#f59e0b"
              stroke-width="1"
            />
          );
        })}

        {/* X-axis labels */}
        {xLabels.map((label, i) => (
          <text
            key={i}
            x={label.x}
            y={height - 8}
            text-anchor="middle"
            font-size="5"
            fill={label.isPrediction ? "#f59e0b" : "#6b7280"}
          >
            {label.label}
          </text>
        ))}

        {/* Y-axis labels */}
        <text
          x={padding.left + 2}
          y={padding.top + 3}
          font-size="5"
          fill="#9ca3af"
        >
          1.0
        </text>
        <text
          x={padding.left + 2}
          y={padding.top + chartHeight - 2}
          font-size="5"
          fill="#9ca3af"
        >
          0
        </text>

        {/* Gradient definition */}
        <defs>
          <linearGradient id="ndviGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#16a34a" />
            <stop offset="100%" stop-color="#16a34a" stop-opacity="0" />
          </linearGradient>
        </defs>
      </svg>

      {/* Legend */}
      <div class="flex flex-wrap items-center justify-center gap-4 text-xs text-gray-500 mt-2">
        <div class="flex items-center gap-1">
          <div class="w-4 h-0.5 bg-green-600 rounded"></div>
          <span>Historical NDVI</span>
        </div>
        <div class="flex items-center gap-1">
          <div
            class="w-4 h-0.5 bg-orange-500 rounded"
            style="background: repeating-linear-gradient(to right, #f59e0b 0, #f59e0b 3px, transparent 3px, transparent 5px);"
          >
          </div>
          <span>Predicted</span>
        </div>
        <div class="flex items-center gap-1">
          <div class="w-2 h-2 bg-blue-500 opacity-60 rounded-sm"></div>
          <span>Rainfall</span>
        </div>
      </div>

      {/* Prediction disclaimer */}
      {predictions.length > 0 && (
        <div class="mt-3 p-2 bg-orange-50 rounded-lg border border-orange-100">
          <p class="text-xs text-orange-700 flex items-start gap-1">
            <span class="text-orange-500">⚠️</span>
            <span>
              <strong>Predictions</strong>{" "}
              are AI-generated based on crop growth models and current health.
              Actual values may vary with weather and farming practices.
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
