import { connect } from 'node:net';

export type ScanResult = 'clean' | 'infected' | 'error' | 'pending';

export interface MalwareScanner {
  scan(buf: Buffer): Promise<ScanResult>;
}

/** ClamAV clamd INSTREAM scanner. Configure CLAMAV_HOST to enable. */
export function clamav(host: string, port: number): MalwareScanner {
  return {
    scan(buf) {
      return new Promise((resolve) => {
        const sock = connect(port, host);
        let reply = '';
        sock.setTimeout(20_000, () => {
          sock.destroy();
          resolve('error');
        });
        sock.on('connect', () => {
          sock.write('zINSTREAM\0');
          for (let i = 0; i < buf.length; i += 64 * 1024) {
            const chunk = buf.subarray(i, i + 64 * 1024);
            const len = Buffer.alloc(4);
            len.writeUInt32BE(chunk.length);
            sock.write(len);
            sock.write(chunk);
          }
          sock.write(Buffer.alloc(4));
        });
        sock.on('data', (d) => (reply += d.toString()));
        sock.on('end', () => resolve(/OK/.test(reply) && !/FOUND/.test(reply) ? 'clean' : /FOUND/.test(reply) ? 'infected' : 'error'));
        sock.on('error', () => resolve('error'));
      });
    },
  };
}

/** Without a scanner, assets stay "pending" and the database refuses approval until scanned. */
export const noScanner: MalwareScanner = { scan: async () => 'pending' };
