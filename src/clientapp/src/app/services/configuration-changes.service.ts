import { Injectable, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { EMPTY, finalize, switchMap } from 'rxjs';
import { shellText } from '../ui-text.zh-cn';
import { ConfirmationDialogService } from './confirmation-dialog.service';
import { NotificationService } from './notification.service';
import { WebapiService } from './webapi.service';

@Injectable({ providedIn: 'root' })
export class ConfigurationChangesService {
  private readonly submitting = signal(false);
  readonly busy = this.submitting.asReadonly();

  constructor(private webapiService: WebapiService, private confirmation: ConfirmationDialogService,
    private notification: NotificationService) { }

  apply(): void {
    if (this.busy()) {
      return;
    }
    this.submitting.set(true);
    this.webapiService.applyConfiguration().pipe(
      finalize(() => this.submitting.set(false))
    ).subscribe({
      next: () => {
        this.webapiService.checkServerStatus();
        this.notification.showOperationFeedback('success', shellText.wireguardRestarted);
      },
      error: failure => this.reportFailure(failure, shellText.applyFailure)
    });
  }

  undo(): void {
    if (this.busy()) {
      return;
    }
    this.submitting.set(true);
    this.confirmation.confirm(shellText.undoChanges, shellText.undoConfirmation).pipe(
      switchMap(confirmed => confirmed ? this.webapiService.undoConfiguration() : EMPTY),
      finalize(() => this.submitting.set(false))
    ).subscribe({
      next: () => window.location.reload(),
      error: failure => this.reportFailure(failure, shellText.undoFailure)
    });
  }

  private reportFailure(failure: unknown, message: string): void {
    const response = failure instanceof Error ? failure.cause ?? failure : failure;
    this.notification.showOperationFeedback('error', response instanceof HttpErrorResponse && response.status === 409
      ? shellText.configurationConflict
      : message);
    this.webapiService.checkServerStatus();
  }
}
