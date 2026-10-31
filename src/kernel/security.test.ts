import { describe, expect, it } from 'vitest';
import { publicIP } from '../../functions/api/network-security';
describe('public website proxy address guard',()=>{
  it.each(['127.0.0.1','10.0.0.1','172.16.0.1','192.168.1.1','169.254.169.254','100.64.0.1','0.0.0.0','224.0.0.1','::1','::','fc00::1','fe80::1','::ffff:127.0.0.1','2001:db8::1'])('blocks reserved address %s',address=>expect(publicIP(address)).toBe(false));
  it.each(['8.8.8.8','1.1.1.1','93.184.216.34','2606:4700:4700::1111'])('allows public address %s',address=>expect(publicIP(address)).toBe(true));
});
