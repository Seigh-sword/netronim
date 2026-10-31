import release from '../../public/release.json';
export const onRequestGet: PagesFunction = async ({request})=>{
  const url=new URL(request.url);const channel=url.searchParams.get('channel')==='preview'?'preview':'stable';
  return new Response(JSON.stringify({...release,channel}),{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'}});
};
