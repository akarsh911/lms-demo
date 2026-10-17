import { networkInterfaces } from 'node:os';

import { handle } from '@/server/grasp/http';

export const dynamic = 'force-dynamic';

const WIRELESS = /wi-?fi|wlan|wireless|^wl/i;
const VIRTUAL = /virtual|vbox|vmware|vethernet|hyper-v|docker|wsl|loopback|tailscale|zerotier|^br-|^veth/i;
const VIRTUAL_SUBNETS = ['192.168.56.', '192.168.99.'];

function rank(name: string, address: string): number {
  if (WIRELESS.test(name)) return 0;
  if (VIRTUAL.test(name) || VIRTUAL_SUBNETS.some((prefix) => address.startsWith(prefix))) return 2;
  return 1;
}

// The addresses a phone on the same wifi can reach this machine on, for the join QR code.
export const GET = (request: Request): Promise<Response> =>
  handle(async () => {
    const port = new URL(request.url).port || '3005';
    const found = Object.entries(networkInterfaces())
      .flatMap(([name, nets]) => (nets ?? []).map((net) => ({ name, net })))
      .filter(({ net }) => net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254.'))
      .map(({ name, net }) => ({ name, origin: `http://${net.address}:${port}`, rank: rank(name, net.address) }))
      .sort((left, right) => left.rank - right.rank);
    const chosen = process.env.LAN_ORIGIN?.trim().replace(/\/$/, '');
    const interfaces = [...(chosen ? [{ name: 'LAN_ORIGIN', origin: chosen }] : []), ...found.filter((row) => row.origin !== chosen).map(({ name, origin }) => ({ name, origin }))];
    return { origins: interfaces.map((row) => row.origin), interfaces };
  });
