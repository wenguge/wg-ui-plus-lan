import { Peer } from '../webapi.entities';

export function downloadPeerConfiguration(peer: Pick<Peer, 'configuration' | 'name'>): void {
  if (!peer.configuration) {
    return;
  }
  const url = URL.createObjectURL(new Blob([peer.configuration], { type: 'text/plain' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = (peer.name.replace(/[^a-z0-9]+/gi, '') || 'wireguard') + '.conf';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
