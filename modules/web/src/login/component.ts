// Copyright 2017 The Kubernetes Authors.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {HttpClient, HttpErrorResponse} from '@angular/common/http';
import {Component, Inject, NgZone, OnInit, OnDestroy} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {AuthenticationMode, EnabledAuthenticationModes, LoginSkippableResponse, LoginSpec} from '@api/root.api';
import {KdError} from '@api/root.shared';
import {IConfig, KdFile, StateError} from '@api/root.ui';
import {AsKdError, ErrorCode, ErrorStatus, K8SError} from '@common/errors/errors';
import {AuthService} from '@common/services/global/authentication';
import {HistoryService} from '@common/services/global/history';
import {PluginsConfigService} from '@common/services/global/plugin';
import {CookieService} from 'ngx-cookie-service';
import {map, filter,takeUntil   } from 'rxjs/operators';
import {CONFIG_DI_TOKEN} from '../index.config';
import {SKIP_LOGIN_PAGE_QUERY_STATE_PARAM} from '@common/params/params';
import { MsalService, MsalBroadcastService, MSAL_GUARD_CONFIG, MsalGuardConfiguration } from '@azure/msal-angular';
import { AuthenticationResult, InteractionStatus, PopupRequest, RedirectRequest, EventMessage, EventType } from '@azure/msal-browser';
import { Subject } from 'rxjs';

 


enum LoginModes {
  Kubeconfig = 'kubeconfig',
  Basic = 'basic',
  Token = 'token',
  AzureAD = 'AzureAD'
}

@Component({
  selector: 'kd-login',
  templateUrl: './template.html',
  styleUrls: ['./style.scss'],
})
export class LoginComponent implements OnInit, OnDestroy {
  loginModes = LoginModes;
  selectedAuthenticationMode = '';
  errors: KdError[] = [];
  isIframe = false;
  loginDisplay = false;
  private readonly _destroying$ = new Subject<void>();


  private enabledAuthenticationModes_: AuthenticationMode[] = [];
  private isLoginSkippable_ = false;
  private kubeconfig_: string;
  private token_: string;
  private username_: string;
  private password_: string;

  constructor(
    private readonly authService_: AuthService,
    private readonly cookies_: CookieService,
    private readonly state_: Router,
    private readonly http_: HttpClient,
    private readonly ngZone_: NgZone,
    private readonly route_: ActivatedRoute,
    private readonly pluginConfigService_: PluginsConfigService,
    private readonly historyService_: HistoryService,
    @Inject(CONFIG_DI_TOKEN) private readonly CONFIG: IConfig,
    @Inject(MSAL_GUARD_CONFIG) private msalGuardConfig: MsalGuardConfiguration,
    private authService: MsalService,
    private msalBroadcastService: MsalBroadcastService
  ) {
   
  }


  ngOnInit(): void {
    this.authService.instance.initialize();
 
    this.isIframe = window !== window.parent && !window.opener; 
    this.setLoginDisplay();

    this.authService.instance.enableAccountStorageEvents();

    if (this.authService.instance.getAllAccounts().length > 0) {
      this.authService_.loginAzureAd(this.authService.instance.getActiveAccount().username, this.authService.instance.getActiveAccount().idToken);
      this.historyService_.goToPreviousState('workloads');
    }
   
    this.selectedAuthenticationMode =
      this.selectedAuthenticationMode || this.cookies_.get(this.CONFIG.authModeCookieName) || '';

    this.http_
      .get<EnabledAuthenticationModes>('api/v1/login/modes')
      .subscribe((enabledModes: EnabledAuthenticationModes) => {
        this.enabledAuthenticationModes_ = enabledModes.modes;
        this.enabledAuthenticationModes_.push(LoginModes.AzureAD);
        this.enabledAuthenticationModes_.splice(0, 1);
        
      });

    this.http_
      .get<LoginSkippableResponse>('api/v1/login/skippable')
      .subscribe((loginSkippableResponse: LoginSkippableResponse) => {
        this.isLoginSkippable_ = loginSkippableResponse.skippable;

        const autoSkipLoginPage = this.route_.snapshot.queryParamMap.get(SKIP_LOGIN_PAGE_QUERY_STATE_PARAM) === 'true';
        if (this.isLoginSkippable_ && autoSkipLoginPage) {
          this.skip();
        }
      });

    this.route_.paramMap.pipe(map(() => window.history.state)).subscribe((state: StateError) => {
      if (state.error) {
        this.errors = [state.error];
      }
    });
  }


  checkAndSetActiveAccount(){
  
    let activeAccount = this.authService.instance.getActiveAccount();

    if (!activeAccount && this.authService.instance.getAllAccounts().length > 0) {
      let accounts = this.authService.instance.getAllAccounts();
      this.authService.instance.setActiveAccount(accounts[0]);
    }
  }

  setLoginDisplay() {
    this.loginDisplay = this.authService.instance.getAllAccounts().length > 0;
  }

  getEnabledAuthenticationModes(): AuthenticationMode[] {
    return this.enabledAuthenticationModes_;
  }


   
  loginRedirect():void {
    if (this.msalGuardConfig.authRequest){
      this.authService.loginRedirect({...this.msalGuardConfig.authRequest} as RedirectRequest);
    } else {
      this.authService.loginRedirect();
    }
  }
    

  logout(popup?: boolean) {
    if (popup) {
      this.authService.logoutPopup({
        mainWindowRedirectUri: "/login"
      });
    } else {
      this.authService.logoutRedirect();
    }
  }

  ngOnDestroy(): void {
    this._destroying$.next(undefined);
    this._destroying$.complete();
  }

  login(): void {
    if (this.hasEmptyToken_()) {
      this.errors = [
        {
          code: ErrorCode.badRequest,
          status: ErrorStatus.badRequest,
          message: 'Empty token provided',
        } as KdError,
      ];
      return;
    }

    this.saveLastLoginMode_();

    if(this.selectedAuthenticationMode === LoginModes.AzureAD)
    {

      sessionStorage.removeItem('msal.interaction.status');
      // this.loginRedirect();
      this.authService.loginPopup()
      .subscribe((response: AuthenticationResult) => {
        this.authService.instance.setActiveAccount(response.account);
        this.authService_.loginAzureAd(response.account.username, response.account.idToken);
        this.historyService_.goToPreviousState('workloads');  
      });
     
      // // this.authService_.skipLoginPage(true);
 
    }
    else
    {
      this.authService_.login(this.getLoginSpec_()).subscribe(
        (errors: K8SError[]) => {
          if (errors.length > 0) {
            this.errors = errors.map((error: K8SError) => new K8SError(error.ErrStatus).toKdError().localize());
            return;
          }

          this.pluginConfigService_.refreshConfig();
          this.ngZone_.run(_ => this.historyService_.goToPreviousState('workloads'));
        },
        (err: HttpErrorResponse) => {
          this.errors = [AsKdError(err)];
        }
      );
    }
  }



  skip(): void {
    this.authService_.skipLoginPage(true);
    this.historyService_.goToPreviousState('workloads');
  }

  isSkipButtonEnabled(): boolean {
    return this.isLoginSkippable_;
  }

  isLoginEnabled(): boolean {
    return this.authService_.isLoginEnabled();
  }

  onChange(event: Event & KdFile): void {
    switch (this.selectedAuthenticationMode) {
      case LoginModes.Kubeconfig:
        this.onFileLoad_(event as KdFile);
        break;
      case LoginModes.Token:
        this.token_ = (event.target as HTMLInputElement).value.trim();
        break;
      case LoginModes.AzureAD:
          this.token_ = (event.target as HTMLInputElement).value.trim();
          break;
      case LoginModes.Basic:
        if ((event.target as HTMLInputElement).id === 'username') {
          this.username_ = (event.target as HTMLInputElement).value;
        } else {
          this.password_ = (event.target as HTMLInputElement).value;
        }
        break;
      default:
    }
  }

  private hasEmptyToken_(): boolean {
    return this.selectedAuthenticationMode === LoginModes.Token && (!this.token_ || !this.token_.trim());
  }

  private saveLastLoginMode_(): void {
    this.cookies_.set(
      this.CONFIG.authModeCookieName,
      this.selectedAuthenticationMode,
      null,
      null,
      null,
      false,
      'Strict'
    );
  }

  private onFileLoad_(file: KdFile): void {
    this.kubeconfig_ = file.content;
  }

  private getLoginSpec_(): LoginSpec {
    switch (this.selectedAuthenticationMode) {
      case LoginModes.Kubeconfig:
        return {kubeConfig: this.kubeconfig_} as LoginSpec;
      case LoginModes.Token:
        return {token: this.token_} as LoginSpec;
      case LoginModes.AzureAD:
        return {token: this.token_} as LoginSpec;
      case LoginModes.Basic:
        return {
          username: this.username_,
          password: this.password_,
        } as LoginSpec;
      default:
        return {} as LoginSpec;
    }
  }
}
