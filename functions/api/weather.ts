const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':status===200?'public, max-age=600':'no-store','X-Content-Type-Options':'nosniff'}});
export const onRequestGet: PagesFunction = async ({request})=>{
  const input=new URL(request.url);let lat=input.searchParams.get('lat'),lon=input.searchParams.get('lon');let city=input.searchParams.get('city')?.trim()||'Thiruvananthapuram',country='India';
  try{
    if(input.searchParams.has('city')){
      if(city.length<2||city.length>100)return reply({error:'Enter a city name between 2 and 100 characters.'},400);
      const result=await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`,{signal:AbortSignal.timeout(10000)});
      if(!result.ok)throw new Error('City lookup is temporarily unavailable.');const data=await result.json() as {results?:{latitude:number;longitude:number;name:string;country:string}[]};const place=data.results?.[0];if(!place)return reply({error:'No city by that name was found. Try a nearby city.'},404);lat=String(place.latitude);lon=String(place.longitude);city=place.name;country=place.country;
    }
    const latitude=Number(lat||8.5241),longitude=Number(lon||76.9366);
    if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)return reply({error:'Invalid coordinates.'},400);
    if(!input.searchParams.has('city')&&!input.searchParams.has('lat')){lat=String(latitude);lon=String(longitude);}else if(input.searchParams.has('lat')){city='Your location';country='';}
    const forecastURL=`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m&hourly=temperature_2m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=7`;
    const response=await fetch(forecastURL,{signal:AbortSignal.timeout(12000)});if(!response.ok)throw new Error('The weather provider is temporarily unavailable.');const data=await response.json() as Record<string,unknown>;return reply({...data,city,country,latitude,longitude});
  }catch(error){return reply({error:error instanceof Error?error.message:'Weather is unavailable. Your saved forecast is still accessible.'},502);}
};
