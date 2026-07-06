interface WeatherData {
  date: string;
  temperatureMax: number;
  temperatureMin: number;
  precipitation: number;
  humidity?: number;
  condition?: string;
}

interface Props {
  forecast: WeatherData[];
  location?: string;
}

export function WeatherWidget({ forecast, location }: Props) {
  if (!forecast || forecast.length === 0) {
    return (
      <div class="bg-white rounded-xl border border-gray-100 p-4">
        <h3 class="font-semibold text-gray-900 mb-2">Weather</h3>
        <p class="text-sm text-gray-500">No weather data available</p>
      </div>
    );
  }

  const today = forecast[0];

  const getWeatherIcon = (precip: number, tempMax: number) => {
    if (precip > 10) return "🌧️";
    if (precip > 0) return "🌦️";
    if (tempMax > 35) return "☀️";
    if (tempMax > 25) return "⛅";
    return "🌤️";
  };

  const getCondition = (precip: number, tempMax: number) => {
    if (precip > 20) return "Heavy Rain";
    if (precip > 5) return "Rainy";
    if (precip > 0) return "Light Showers";
    if (tempMax > 40) return "Very Hot";
    if (tempMax > 35) return "Hot";
    if (tempMax > 25) return "Warm";
    return "Pleasant";
  };

  return (
    <div class="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 text-white">
      {location && <p class="text-blue-100 text-xs mb-1">{location}</p>}
      <div class="flex items-center justify-between mb-4">
        <div>
          <div class="text-4xl font-bold">
            {today.temperatureMax.toFixed(0)}°
          </div>
          <div class="text-blue-100 text-sm">
            Low: {today.temperatureMin.toFixed(0)}°
          </div>
        </div>
        <div class="text-5xl">
          {getWeatherIcon(today.precipitation, today.temperatureMax)}
        </div>
      </div>

      <div class="flex items-center gap-4 text-sm mb-4">
        <span class="flex items-center gap-1">
          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path
              fill-rule="evenodd"
              d="M5.5 17a4.5 4.5 0 01-1.44-8.765 4 4 0 018.302-1.69A4.5 4.5 0 0118 11.5a4.5 4.5 0 01-4.5 4.5H6a.5.5 0 01-.5-.5V17z"
            />
          </svg>
          {getCondition(today.precipitation, today.temperatureMax)}
        </span>
        {today.precipitation > 0 && (
          <span class="flex items-center gap-1">
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 2a.75.75 0 01.75.75v.5a.75.75 0 01-1.5 0v-.5A.75.75 0 0110 2zM10 15a3 3 0 100-6 3 3 0 000 6z" />
            </svg>
            {today.precipitation.toFixed(0)}mm
          </span>
        )}
      </div>

      {/* 5-day forecast */}
      <div class="border-t border-blue-400 pt-3">
        <div class="flex justify-between">
          {forecast.slice(0, 5).map((day, i) => {
            const date = new Date(day.date);
            const dayName = i === 0 ? "Today" : date.toLocaleDateString("en", {
              weekday: "short",
            });
            return (
              <div key={i} class="text-center">
                <div class="text-xs text-blue-100 mb-1">{dayName}</div>
                <div class="text-lg">
                  {getWeatherIcon(day.precipitation, day.temperatureMax)}
                </div>
                <div class="text-xs font-medium">
                  {day.temperatureMax.toFixed(0)}°
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
