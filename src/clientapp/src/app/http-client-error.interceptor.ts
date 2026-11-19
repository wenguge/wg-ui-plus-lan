import { Injectable } from '@angular/core';
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor,
  HttpErrorResponse
} from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';
import { WebapiService } from './services/webapi.service';
import { ServerStatus } from './webapi.entities';
import { formatValidationError, httpErrorText, shellText } from './ui-text.zh-cn';

@Injectable({
  providedIn: 'root',
})
export class HttpClientErrorInterceptor implements HttpInterceptor {

  constructor(private webapiService: WebapiService) { }

  getHttpError(statusCode: number): string | null {
    return httpErrorText.find(item => item.from <= statusCode && statusCode <= item.to)?.message ?? null;
  }

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    return next.handle(request)
      .pipe(
        catchError((error: HttpErrorResponse) => {
          // Email delivery has its own safe, categorized UI path. Do not promote
          // its response into the persistent server-status banner or rewrite it.
          if (this.isEmailRequest(request)) {
            return throwError(() => error);
          }

          let message: string;

          if (error.status === 0) {
            // Connection failure (e.g. server unreachable) — report it cleanly.
            message = shellText.serverConnectionLost;
          } else {
            let errorMessageFromList = this.getHttpError(error.status);
            if(!errorMessageFromList)
            {
              return throwError(() => error);
            }
            const detail = error.error?.message;
            message = `服务器返回 HTTP ${error.status}。${errorMessageFromList}`;
            if (typeof detail === 'string' && detail) {
              message += `错误详情：${formatValidationError('', detail)}`;
            }
          }

          this.webapiService.pushServerStatus({ status: 'error', message: message } as ServerStatus)
          return throwError(() => new Error(message, { cause: error }));
        })
      );
  }

  private isEmailRequest(request: HttpRequest<unknown>): boolean {
    const urlWithoutQuery = request.url.split(/[?#]/, 1)[0];
    try {
      const path = new URL(urlWithoutQuery, 'http://localhost').pathname;
      return request.method === 'POST' && (
        path === '/api/v1/data/peer/send_peer_email' ||
        path === '/api/v1/control/send_test_email'
      );
    } catch {
      return false;
    }
  }
}
