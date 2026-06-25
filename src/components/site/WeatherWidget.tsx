import { useEffect, useState } from "react";
import { Cloud, CloudRain, Sun, CloudSun, Snowflake } from "lucide-react";

type Weather = { temperature: number; weathercode: number; windspeed: number };

function iconFor(code: number) {
  if ([0].includes(code)) return Sun;
  if ([1, 2].includes(code)) return CloudSun;
  if ([3, 45, 48].includes(code)) return Cloud;
  if (code >= 51 && code <= 67) return CloudRain;
  if (code >= 71 && code <= 77) return Snowflake;
  if (code >= 80 && code <= 99) return CloudRain;
  return Cloud;
}

function labelFor(code: number) {
  if (code === 0) return "Céu limpo";
  if ([1, 2].includes(code)) return "Parcialmente nublado";
  if (code === 3) return "Nublado";
  if ([45, 48].includes(code)) return "Neblina";
  if (code >= 51 && code <= 67) return "Chuva";
  if (code >= 80 && code <= 82) return "Pancadas de chuva";
  if (code >= 95) return "Tempestade";
  return "Tempo instável";
}

export default function WeatherWidget() {
  const [data, setData] = useState<Weather | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    fetch(
      "https://api.open-meteo.com/v1/forecast?latitude=-10.91&longitude=-37.07&current_weather=true&timezone=America%2FFortaleza",
      { signal: ac.signal },
    )
      .then((r) => r.json())
      .then((j) => setData(j?.current_weather ?? null))
      .catch(() => setError(true));
    return () => ac.abort();
  }, []);

  if (error) return null;

  return (
    <div className="rounded-md border border-border/60 bg-white p-4">
      <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
        Tempo em Aracaju
      </div>
      {data ? (
        <div className="flex items-center gap-3">
          {(() => {
            const Icon = iconFor(data.weathercode);
            return <Icon className="h-10 w-10 text-primary" />;
          })()}
          <div>
            <div className="text-2xl font-black leading-none">
              {Math.round(data.temperature)}°C
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {labelFor(data.weathercode)}
            </div>
            <div className="text-[10px] text-muted-foreground/70">
              Vento {Math.round(data.windspeed)} km/h
            </div>
          </div>
        </div>
      ) : (
        <div className="h-12 animate-pulse bg-muted rounded" />
      )}
    </div>
  );
}
