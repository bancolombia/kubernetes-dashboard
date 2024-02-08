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

import {NgModule} from '@angular/core';
import {Routes, RouterModule} from '@angular/router';
import {BREADCRUMBS} from '../index.messages';
import {SettingsComponent} from './component';
import { BrowserUtils } from "@azure/msal-browser";

// export const SETTINGS_ROUTE: Route = {
//   path: '',
//   component: SettingsComponent,
//   data: {
//     breadcrumb: BREADCRUMBS.Settings,
//   },
// };

const routes: Routes = [
  {
    path: "",
    component: SettingsComponent,
    data: {
      breadcrumb: BREADCRUMBS.Settings,
    },
  },
];
const isIframe = window !== window.parent && !window.opener;

@NgModule({
  imports:[],
  exports: [RouterModule],

})
export class SettingsRoutingModule {}
