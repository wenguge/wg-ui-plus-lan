import { registerLocaleData } from '@angular/common';
import localeZhHans from '@angular/common/locales/zh-Hans';
import { ApplicationConfig, LOCALE_ID } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideClientHydration, withNoIncrementalHydration } from '@angular/platform-browser';
import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi, withXsrfConfiguration, withXhr } from '@angular/common/http';
import { HttpClientErrorInterceptor } from './http-client-error.interceptor';

import { routes } from './app.routes';

registerLocaleData(localeZhHans);

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: LOCALE_ID, useValue: 'zh-Hans' },
    provideHttpClient(withXhr(), withXsrfConfiguration(
      {
        cookieName: 'csrftoken',
        headerName: 'X-CSRFToken',
      }
    )),
    provideAnimationsAsync(),
    provideRouter(routes), provideAnimationsAsync('noop'),
    provideClientHydration(withNoIncrementalHydration()), provideHttpClient(withXhr(), withInterceptorsFromDi()),
    {
      provide: HTTP_INTERCEPTORS,
      useClass: HttpClientErrorInterceptor,
      multi: true,
    },]
};
