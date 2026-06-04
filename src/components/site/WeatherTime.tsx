import { useState, useEffect } from "react";
import { Thermometer, MapPin } from "lucide-react";

interface WeatherData {
  temp: number;
}

export default function WeatherTime({ city = "Aracaju" }: { city?: string }) {
  const [time, setTime] = useState(new Date());
  const [weather, setWeather] = useState<WeatherData | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const coords: Record<string, { lat: number, lon: number }> = {
          "Aracaju": { lat: -10.9472, lon: -37.0731 },
          "Lagarto": { lat: -10.9161, lon: -37.6506 }
        };

        const { lat, lon } = coords[city] || coords["Aracaju"];
        
        const response = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`
        );
        const data = await response.json();
        
        if (data.current_weather) {
          setWeather({
            temp: Math.round(data.current_weather.temperature)
          });
        }
      } catch (error) {
        console.error("Error fetching weather:", error);
      }
    };

    fetchWeather();
    const weatherTimer = setInterval(fetchWeather, 600000); // 10 minutes
    return () => clearInterval(weatherTimer);
  }, [city]);

  const formattedDate = time.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const formattedTime = time.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className="flex items-center gap-4 text-[10px] sm:text-[11px] font-medium tracking-tight text-white/90">
      <div className="flex items-center gap-2">
        <span className="capitalize hidden md:inline opacity-80">{formattedDate}</span>
        <span className="hidden md:inline opacity-30">|</span>
        <span className="font-bold tabular-nums text-alert">{formattedTime}</span>
      </div>
      
      {weather && (
        <div className="flex items-center gap-3 border-l border-white/20 pl-4 ml-2">
          <div className="flex items-center gap-1 opacity-80">
            <MapPin className="h-3 w-3" />
            <span className="uppercase text-[9px] font-bold">{city}</span>
          </div>
          <div className="flex items-center gap-1 font-black text-white">
            <Thermometer className="h-3 w-3 text-alert" />
            <span>{weather.temp}°C</span>
          </div>
        </div>
      )}
    </div>
  );
}
