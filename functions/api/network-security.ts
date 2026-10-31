// Shared by the proxy and its tests. Keep this module free of Cloudflare globals.
export function publicIP(address: string): boolean {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(address)) {
    const p=address.split('.').map(Number);if(p.some(n=>n>255))return false;
    const [a,b]=p;
    return !(a===0||a===10||a===127||a>=224||a===255||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===192&&b===0)||(a===198&&(b===18||b===19))||(a===198&&b===51)||(a===203&&b===0));
  }
  if (!address.includes(':')) return false;
  const mapped=address.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/i);if(mapped)return publicIP(mapped[1]);
  const halves=address.toLowerCase().split('::');if(halves.length>2)return false;
  const left=halves[0]?halves[0].split(':'):[],right=halves.length===2&&halves[1]?halves[1].split(':'):[];
  if(left.length+right.length>8-(halves.length===2?1:0))return false;
  const groups=[...left,...Array(Math.max(0,8-left.length-right.length)).fill('0'),...right];
  if(groups.length!==8||groups.some(g=>!/^[a-f0-9]{1,4}$/.test(g)))return false;
  const first=parseInt(groups[0],16);
  // Only currently allocated global unicast 2000::/3, excluding transition and documentation ranges.
  return (first>=0x2000&&first<0x4000)&&!(first===0x2001&&parseInt(groups[1],16)===0xdb8)&&first!==0x2002&&!(first===0x2001&&parseInt(groups[1],16)===0);
}
