import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnDestroy, OnInit, TemplateRef, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Clipboard } from '@angular/cdk/clipboard';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { AppSharedModule } from '../../app-shared.module';
import { ConnectedPeerInformation, ConnectedPeerInformationItem, Peer } from '../../webapi.entities';
import { EMPTY, Subscription, catchError, exhaustMap, finalize, switchMap, throwError, timer } from 'rxjs';
import { WebapiService } from '../../services/webapi.service';
import { NotificationService } from '../../services/notification.service';
import { ConfirmationDialogService } from '../../services/confirmation-dialog.service';
import { trafficResetText } from '../../ui-text.zh-cn';
import { ManagePeersEditorComponent } from '../manage-peers-editor/manage-peers-editor.component';
import { downloadPeerConfiguration } from '../peer-configuration';
import { PeerConfigurationPreviewComponent } from '../peer-configuration-preview/peer-configuration-preview.component';

type PeerState = 'connected' | 'inactive' | 'disabled' | 'disconnected';
type PeerMonitorRow = ConnectedPeerInformationItem & {
  downloadRate: number | null;
  uploadRate: number | null;
};
type ClientRow = { name: string; ip: string; state: PeerState; peer?: Peer; stats?: PeerMonitorRow };
type ConfigurationAction = 'qr' | 'download' | 'show';
type ConfigurationDialog = { action: 'qr' | 'show'; name: string; configuration: string; qr: string };

const transferUnits = ['B', 'KB', 'MB', 'GB', 'TB'];
const transferNumber = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

@Component({
    standalone: true,
    selector: 'app-server-monitor-peers',
    imports: [CommonModule, FormsModule, AppSharedModule, ManagePeersEditorComponent, PeerConfigurationPreviewComponent],
    templateUrl: './server-monitor-peers.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrl: './server-monitor-peers.component.scss'
})
export class ServerMonitorPeersComponent implements OnInit, OnDestroy {
  connectedPeerData: Omit<ConnectedPeerInformation, 'items'> & { items: PeerMonitorRow[] } = { datetime: '', items: [], message: '' };
  clients: ClientRow[] = [];
  search = '';
  sortDirection: 'asc' | 'desc' = 'asc';
  readonly changingPeers = new Set<number>();
  readonly resettingTransfers = new Set<number | null>();
  readonly trafficResetText = trafficResetText;
  loadingConfiguration = false;
  private configuredPeers: Peer[] = [];
  private monitorSubscription?: Subscription;
  private previousSampleTime: number | null = null;
  private editorDialog?: MatDialogRef<unknown>;
  private exportDialog?: MatDialogRef<unknown>;
  @ViewChild('peerEditor') private peerEditor!: TemplateRef<{ $implicit: Peer }>;
  @ViewChild('peerExport') private peerExport!: TemplateRef<{ $implicit: ConfigurationDialog }>;

  get visibleClients(): ClientRow[] {
    const search = this.search.trim().toLocaleLowerCase();
    const direction = this.sortDirection === 'asc' ? 1 : -1;
    return this.clients.filter(client => !search ||
      [client.name, client.ip, client.stats?.end_point_ip].some(value => value?.toLocaleLowerCase().includes(search))
    ).sort((a, b) => direction * a.name.localeCompare(b.name, 'zh-CN'));
  }

  get connectedCount(): number {
    return this.clients.filter(client => client.state === 'connected').length;
  }

  get inactiveCount(): number {
    return this.clients.filter(client => client.state === 'inactive').length;
  }

  get disabledCount(): number {
    return this.clients.filter(client => client.state === 'disabled').length;
  }

  get offlineCount(): number {
    return this.clients.filter(client => client.state === 'disconnected').length;
  }

  // WireGuard reports transfers from the server's viewpoint.
  get totalDownload(): number {
    return this.connectedPeerData.total_tx ??
      this.connectedPeerData.items.reduce((sum, peer) => sum + (peer.transfer_tx ?? 0), 0);
  }

  get totalUpload(): number {
    return this.connectedPeerData.total_rx ??
      this.connectedPeerData.items.reduce((sum, peer) => sum + (peer.transfer_rx ?? 0), 0);
  }

  get canResetTransfers(): boolean {
    return this.connectedPeerData.total_tx !== undefined && this.connectedPeerData.total_rx !== undefined;
  }

  peerKey(peer: ConnectedPeerInformationItem): string {
    return peer.peer_id == null ? `${peer.allowed_ips_ip}:${peer.peer_name}` : `peer:${peer.peer_id}`;
  }

  formatTransfer(bytes: number | null, suffix = ''): string {
    if (bytes === null) {
      return '—';
    }
    let unit = 0;
    while (bytes >= 1000 && unit < transferUnits.length - 1) {
      bytes /= 1000;
      unit++;
    }
    return `${transferNumber.format(bytes)} ${transferUnits[unit]}${suffix}`;
  }

  formatHandshake(handshake: string | null): string {
    if (!handshake) {
      return '—';
    }
    // The API sends both times in the same server timezone, without an offset.
    // Compare their wall-clock values without applying the browser's timezone.
    const sampleTime = Date.parse(this.connectedPeerData.datetime.replace(' ', 'T') + 'Z');
    const handshakeTime = Date.parse(handshake.replace(' ', 'T') + 'Z');
    if (!Number.isFinite(sampleTime) || !Number.isFinite(handshakeTime) || handshake.startsWith('1970-01-01')) {
      return '—';
    }
    const seconds = Math.max(0, Math.floor((sampleTime - handshakeTime) / 1000));
    if (seconds === 0) return '刚刚';
    if (seconds < 60) return `${seconds} 秒前`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`;
    return `${Math.floor(seconds / 86400)} 天前`;
  }

  private peerState(peer?: ConnectedPeerInformationItem, configured?: Peer): PeerState {
    const status = (peer?.status ?? '').trim().toLowerCase();
    if (configured?.disabled || peer?.is_disabled === true || status === 'disabled') {
      return 'disabled';
    }
    if (peer?.is_inactive === true || status === 'inactive') {
      return 'inactive';
    }
    if (peer?.is_connected === true || status === 'connected') {
      return 'connected';
    }
    return 'disconnected';
  }

  constructor(private webapiService: WebapiService, private router: Router, private dialog: MatDialog,
    private clipboard: Clipboard, private notification: NotificationService, private destroyRef: DestroyRef,
    private confirmation: ConfirmationDialogService) { }

  ngOnInit(): void {
    this.monitorSubscription = this.webapiService.checkIsUserAuthenticated().pipe(
      switchMap(session => {
        if (!session.is_logged_in) {
          void this.router.navigate(['/login']);
          return EMPTY;
        }
        this.loadConfiguredPeers();
        return timer(0, 1000).pipe(exhaustMap(() => this.webapiService.getConnectedPeers().pipe(
          catchError(failure => {
            const error = failure instanceof Error ? failure.cause : failure;
            if (error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403)) {
              void this.router.navigate(['/login']);
              return throwError(() => failure);
            }
            this.previousSampleTime = null;
            this.connectedPeerData.items = this.connectedPeerData.items.map(peer => ({ ...peer, downloadRate: null, uploadRate: null }));
            this.updateClients();
            return EMPTY;
          })
        )));
      }),
      catchError(() => EMPTY)
    ).subscribe(data => this.updatePeerData(data));
  }

  ngOnDestroy(): void {
    this.monitorSubscription?.unsubscribe();
    this.editorDialog?.close();
    this.exportDialog?.close();
  }

  openEditor(peer?: Peer): void {
    const item = peer ? { ...peer } : {
      name: '',
      disabled: false,
      peer_groups: [] as Peer['peer_groups'],
      peer_group_ids: [] as number[]
    } as Peer;
    this.editorDialog = this.dialog.open(this.peerEditor, { data: item, width: '50rem', maxWidth: 'calc(100vw - 1.5rem)' });
    this.editorDialog.afterClosed().pipe(takeUntilDestroyed(this.destroyRef)).subscribe(changed => {
      if (changed) {
        this.loadConfiguredPeers();
      }
    });
  }

  finishEditor(changed: boolean): void {
    this.editorDialog?.close(changed);
  }

  togglePeer(peer: Peer): void {
    this.changingPeers.add(peer.id);
    this.webapiService.setPeerDisabled(peer.id, !peer.disabled).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.changingPeers.delete(peer.id))
    ).subscribe({
      next: updated => {
        this.configuredPeers = this.configuredPeers.map(item => item.id === updated.id ? updated : item);
        this.updateClients();
      },
      error: () => this.notification.error('更新客户端状态失败。')
    });
  }

  resetTransferTotals(peer?: Peer): void {
    const peerId = peer?.id ?? null;
    if (this.resettingTransfers.has(peerId)) {
      return;
    }
    this.resettingTransfers.add(peerId);
    const title = peer ? trafficResetText.peerLabel(peer.name) : trafficResetText.totalButton;
    const message = peer ? trafficResetText.peerConfirmation(peer.name) : trafficResetText.totalConfirmation;
    this.confirmation.confirm(title, message).pipe(
      switchMap(confirmed => confirmed ? this.webapiService.resetTransferTotals(peerId) : EMPTY),
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.resettingTransfers.delete(peerId))
    ).subscribe({
      next: () => this.notification.success(peer ? trafficResetText.peerSuccess(peer.name) : trafficResetText.totalSuccess),
      error: () => this.notification.error(trafficResetText.error)
    });
  }

  openConfiguration(peer: Peer, action: ConfigurationAction): void {
    this.loadingConfiguration = true;
    this.webapiService.getPeer(peer.id).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => { this.loadingConfiguration = false; })
    ).subscribe({
      next: details => {
        if (!details.configuration || (action === 'qr' && !details.qr)) {
          this.notification.error('此客户端暂无可用配置。');
          return;
        }
        if (action === 'download') {
          downloadPeerConfiguration(details);
          return;
        }
        const data: ConfigurationDialog = {
          action, name: peer.name, configuration: details.configuration, qr: details.qr,
        };
        this.exportDialog = this.dialog.open(this.peerExport, { data, width: '34rem', maxWidth: 'calc(100vw - 1.5rem)' });
      },
      error: () => this.notification.error('获取客户端配置失败。')
    });
  }

  copyConfiguration(value: string): void {
    if (this.clipboard.copy(value)) {
      this.notification.success('已复制客户端配置。');
    } else {
      this.notification.warn('无法自动复制，请手动选中配置文本。');
    }
  }

  private loadConfiguredPeers(): void {
    this.webapiService.getPeerList().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: peers => {
        this.configuredPeers = peers;
        this.updateClients();
      },
      error: () => this.notification.error('读取客户端列表失败。')
    });
  }

  private updateClients(): void {
    const samples = new Map<number | string, PeerMonitorRow>(this.connectedPeerData.items.map(stats => {
      const key = stats.peer_id === undefined ? stats.allowed_ips_ip : stats.peer_id ?? this.peerKey(stats);
      return [key, stats];
    }));
    const clients: ClientRow[] = this.configuredPeers.map(peer => {
      const stats = samples.get(peer.id) ?? samples.get(peer.ip_address);
      if (stats) {
        samples.delete(stats.peer_id ?? peer.ip_address);
      }
      return { name: peer.name, ip: peer.ip_address, state: this.peerState(stats, peer), peer, stats };
    });
    for (const stats of samples.values()) {
      clients.push({ name: stats.peer_name, ip: stats.allowed_ips_ip, state: this.peerState(stats), stats });
    }
    this.clients = clients;
  }

  private updatePeerData(data: ConnectedPeerInformation): void {
    const sampleTime = performance.now();
    const elapsedSeconds = this.previousSampleTime === null ? 0 : (sampleTime - this.previousSampleTime) / 1000;
    const previousPeers = new Map(this.connectedPeerData.items.map(peer => [this.peerKey(peer), peer]));
    const items = data.items.map(peer => {
      const previous = previousPeers.get(this.peerKey(peer));
      const { transfer_tx: sent, transfer_rx: received } = peer;
      const previousSent = previous?.transfer_tx;
      const previousReceived = previous?.transfer_rx;
      if (elapsedSeconds <= 0 || sent == null || received == null ||
          previousSent == null || previousReceived == null || sent < previousSent || received < previousReceived) {
        return { ...peer, downloadRate: null, uploadRate: null };
      }
      return {
        ...peer,
        downloadRate: (sent - previousSent) / elapsedSeconds,
        uploadRate: (received - previousReceived) / elapsedSeconds,
      };
    });
    this.previousSampleTime = sampleTime;
    this.connectedPeerData = { ...data, items };
    this.updateClients();
  }

}
