import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy } from '@angular/core';
import { Peer, ServerValidationError } from '../../webapi.entities';
import { WebapiService } from '../../services/webapi.service';
import { AppSharedModule } from '../../app-shared.module';

import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ValidationErrorsDisplayComponent } from '../../controls/validation-errors-display/validation-errors-display.component';
import { ConfirmationDialogService } from '../../services/confirmation-dialog.service';
import { NotificationService } from '../../services/notification.service';
import { managementText } from '../management-text.zh-cn';
import { smtpMessage } from '../manage-server-configuration/settings-text.zh-cn';
import { downloadPeerConfiguration } from '../peer-configuration';
import { PeerConfigurationPreviewComponent } from '../peer-configuration-preview/peer-configuration-preview.component';
import { peerExportText } from '../../ui-text.zh-cn';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  standalone: true,
  selector: 'app-manage-peers-editor',
  imports: [FormsModule, AppSharedModule, ValidationErrorsDisplayComponent, PeerConfigurationPreviewComponent],
  templateUrl: './manage-peers-editor.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './manage-peers-editor.component.scss'
})
export class ManagePeersEditorComponent {
  @Input()
  get editItem(): Peer { return this.peer; }
  set editItem(value: Peer) {
    this.peer = value;
    this.captureSnapshot();
    if (value.id) {
      this.webapiService.getPeer(value.id).subscribe(data => {
        this.peer = data;
        this.getLookupData();
        this.captureSnapshot();
      });
    }
    else {
      this.getLookupData();
      this.captureSnapshot();
    }
  }

  peer: Peer = {} as Peer;
  readonly peerExportText = peerExportText;

  /** Serialized snapshot of the editable fields as originally loaded. */
  private snapshot = '';

  validationResult?: ServerValidationError;
  emailAvailable = false;
  emailStatusMessage = managementText.emailUnavailable;

  @Output() onFinish = new EventEmitter<boolean>();

  constructor(private notification: NotificationService,
    private webapiService: WebapiService,
    private confirmationDialogService: ConfirmationDialogService) {
    this.webapiService.serverStatus.pipe(takeUntilDestroyed()).subscribe(status => {
      const emailStatus = status.application_details?.email;
      this.emailAvailable = emailStatus
        ? emailStatus.status === 'configured'
        : status.application_details?.is_email_enabled === true;
      this.emailStatusMessage = emailStatus?.message
        ? smtpMessage(emailStatus.message)
        : this.emailAvailable ? managementText.emailConfigured : managementText.emailUnavailable;
    });
  }

  getLookupData() {
    if (this.peer) {
      this.webapiService.getPeerGroupList().subscribe(lookup => {
        let lookupItems = this.peer.peer_groups ?
          lookup.filter(x => !this.peer.peer_groups.some(y => y.id === x.id) && !x.is_everyone_group)
          : lookup;
        this.peer.peer_groups_lookup = lookupItems;
      });
    }
  }

  getQrCode() {
    let imagePath = this.editItem.qr ? 'data:image/png;base64,' + this.editItem.qr : '';
    return imagePath;
  }

  /** Sorted list of ids from the given related-item array (order-independent). */
  private sortedIds(list: Array<{ id: number }> | undefined): number[] {
    return (list || []).map(x => x.id).sort((a, b) => a - b);
  }

  /** Normalized representation of the user-editable fields. */
  private get editableState(): any {
    return {
      name: this.peer.name,
      description: this.peer.description,
      email_address: this.peer.email_address,
      disabled: this.peer.disabled,
      peer_groups: this.sortedIds(this.peer.peer_groups),
      client_use_vpn_dns: this.peer.client_use_vpn_dns ?? null,
      client_include_server_route: this.peer.client_include_server_route ?? false,
    };
  }

  private captureSnapshot(): void {
    this.snapshot = JSON.stringify(this.editableState);
  }

  /** True when any user-editable field differs from the originally loaded data. */
  get hasChanges(): boolean {
    return JSON.stringify(this.editableState) !== this.snapshot;
  }

  ok() {
    if (!this.peer) {
      return;
    }
    this.webapiService.savePeer(this.peer)
      .subscribe({
        next: data => {
        },
        error: error => {
          let response = error as HttpErrorResponse;
          if (response) {
            this.validationResult = response.error as ServerValidationError;
          }
        },
        complete: () => {
          this.onFinish.emit(true);
        },
      });
  }

  cancel() {
    this.onFinish.emit(false);
  }

  delete(event: Event) {
    if (!this.peer) {
      return;
    }

    this.confirmationDialogService.confirm(managementText.confirmTitle, managementText.confirmDelete(this.editItem.name))
      .subscribe(dialogResult => {
        if (dialogResult) {
          this.webapiService.deletePeer(this.peer)
            .subscribe({
              next: data => {
              },
              error: error => {
                let response = error as HttpErrorResponse;
                if (response) {
                  this.validationResult = response.error as ServerValidationError;
                }
              },
              complete: () => {
                this.onFinish.emit(true);
              },
            });
        }
      });

  }

  downloadConfigFile(): void {
    downloadPeerConfiguration(this.peer);
  }

  sendConfigurationByEmail(event: Event): void {
    this.validationResult = undefined;
    this.confirmationDialogService.confirm(
      managementText.confirmTitle,
      managementText.confirmSendConfiguration(this.editItem.email_address)
    )
      .subscribe(dialogResult => {
        if (dialogResult) {
          this.webapiService.sendConfigurationByEmail(this.peer).subscribe({
            next: data => {
              this.notification.success(managementText.emailSent);
            },
            error: error => {
              const response = error as HttpErrorResponse;
              this.notification.showEmailDeliveryFailure(smtpMessage(response?.error?.message));
            },
          });
        }
      });
  }

}
