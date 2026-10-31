// Keyless fallback for static deployments without Pages Functions.
// The Cloudflare endpoint remains the default to provide shared caching.
export async function fetchWeatherDirect(city: string, coordinates?: { lat: number; lon: number }) {
  let latitude=coordinates?.lat??8.5241,longitude=coordinates?.lon??76.9366;
  let name=coordinates?'Your location':city||'Thiruvananthapuram',country=coordinates?'':'India';
  if(city&&!coordinates){
    const response=await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`,{signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw new Error('City lookup is unavailable.');
    const data=await response.json() as {results?:{latitude:number;longitude:number;name:string;country:string}[]};
    const place=data.results?.[0];if(!place)throw new Error('No city by that name was found.');
    latitude=place.latitude;longitude=place.longitude;name=place.name;country=place.country;
  }
  const url=`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m&hourly=temperature_2m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=7`;
  const response=await fetch(url,{signal:AbortSignal.timeout(12000)});if(!response.ok)throw new Error('The weather provider is temporarily unavailable.');
  return {...await response.json(),city:name,country,latitude,longitude};
}
