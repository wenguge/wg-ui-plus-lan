import { Component, ChangeDetectionStrategy } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { AppSharedModule } from '../../app-shared.module';
import { WebapiService } from '../../services/webapi.service';
import { NotificationService } from '../../services/notification.service';
import { ConfirmationDialogService } from '../../services/confirmation-dialog.service';

@Component({
    standalone: true,
    selector: 'app-testpage',
    imports: [FormsModule, AppSharedModule],
    templateUrl: './test-page.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrl: './test-page.component.scss'
})
export class TestPageComponent {

    constructor(private notification: NotificationService,
        private confirmationDialogService: ConfirmationDialogService,
        private webapiService: WebapiService) { }

    ngOnInit() {
        this.refreshData();
    }

    refreshData() {
    }

    showSuccess(): void {
        this.notification.success('操作成功。');
    }

    showError(): void {
        this.notification.error('操作出错。');
    }

    showWarn(): void {
        this.notification.warn('请检查当前操作。');
    }

    showInfo(): void {
        this.notification.info('这是一条信息通知。');
    }

    confirmDemo(): void {
        this.confirmationDialogService.confirm('确认', '要继续吗？').subscribe(ok => {
            if (ok) {
                this.notification.success('已确认操作。');
            } else {
                this.notification.info('已取消操作。');
            }
        });
    }

    showMessageDemo(): void {
        this.confirmationDialogService.showMessage('信息', '这是一条提示信息。').subscribe(() => {
        });
    }
}
