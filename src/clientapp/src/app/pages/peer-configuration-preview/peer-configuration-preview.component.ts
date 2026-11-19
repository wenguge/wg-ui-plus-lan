import { Component, computed, input } from '@angular/core';
import { peerExportText } from '../../ui-text.zh-cn';

@Component({
  selector: 'app-peer-configuration-preview',
  templateUrl: './peer-configuration-preview.component.html',
  styles: [`
    dl {
      display: grid;
      grid-template-columns: max-content minmax(0, 1fr);
      gap: 0.375rem 0.75rem;
    }
    dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
  `],
})
export class PeerConfigurationPreviewComponent {
  readonly configuration = input.required<string>();
  readonly text = peerExportText;
  readonly fields = computed(() => {
    const values = new Map<string, string>();
    for (const [, key, value] of this.configuration().matchAll(/^[ \t]*(Endpoint|Address|AllowedIPs|DNS)[ \t]*=([^\r\n]*)/gm)) {
      values.set(key, value.trim());
    }
    const routes = values.get('AllowedIPs')?.split(',').map(route => route.trim()).filter(Boolean) ?? [];
    const routeDescription: Record<string, string> = {
      '0.0.0.0/0': this.text.allIPv4,
      '::/0': this.text.allIPv6,
    };
    return [
      { label: this.text.endpoint, value: values.get('Endpoint') || '—' },
      { label: this.text.address, value: values.get('Address') || '—' },
      {
        label: this.text.routes,
        value: routes.map(route => routeDescription[route] ? `${route}（${routeDescription[route]}）` : route).join(', ') || this.text.noRoutes,
      },
      { label: this.text.dns, value: values.get('DNS') || this.text.deviceDns },
    ];
  });
}
