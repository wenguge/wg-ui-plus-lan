import { Component, Input, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AppSharedModule } from '../../app-shared.module';
import { NavMenuItem } from '../../nav-menu-item';
import { UserSessionInfo } from '../../webapi.entities';
import { Subscription } from 'rxjs';
import { LoginService } from '../../services/login.service';

/**
 * Navigation item: a NavMenuItem plus the optional bits the navigation drawer
 * needs (tooltip text, a click command for items such as "Log out" that perform
 * an action instead of navigating, and `replaceUrl` for router links such as
 * "Log in" that should not leave a back-navigation entry behind).
 */
export interface NavDrawerMenuItem extends NavMenuItem {
    tooltip: string;
    command?: () => void;
    replaceUrl?: boolean;
}

/** A labelled group of navigation items (rendered as a subheader in the nav list). */
export interface NavDrawerMenuSection {
    label?: string;
    items: NavDrawerMenuItem[];
}

/**
 * Side navigation drawer rendered inside the app's `mat-sidenav`.
 *
 * Supports a collapsible icon-only rail: when `collapsed` is true the item
 * labels and section headers are hidden and full labels are revealed via
 * hover tooltips. The authentication item (Log in / Log out) is pinned at the
 * bottom of the drawer.
 */
@Component({
  standalone: true,
  selector: 'app-nav-drawer',
  imports: [FormsModule, RouterModule, AppSharedModule],
  templateUrl: './app-nav-drawer.component.html',
  styleUrl: './app-nav-drawer.component.scss',
  // Exposes the collapsed state as a host class so the icon-only rail's
  // Material list-item internals can be styled globally (see styles.scss).
  changeDetection: ChangeDetectionStrategy.Eager,
  host: { '[class.nav-drawer-collapsed]': 'collapsed' },
})
export class AppNavDrawerComponent implements OnInit {
  private menuItemMonitorPeers: NavDrawerMenuItem = {
    label: '节点监控',
    route: '/server-monitor-peers',
    icon: 'visibility',
    tooltip: '查看所有节点的状态。',
  };
  private menuItemMonitorIPTables: NavDrawerMenuItem = {
    label: '防火墙监控',
    route: '/server-monitor-iptables',
    icon: 'visibility',
    tooltip: '查看 iptables 规则链。',
  };
  private menuItemVPNLayout: NavDrawerMenuItem = {
    label: 'VPN 拓扑',
    route: '/server-vpn-layout',
    icon: 'grid_view',
    tooltip: '查看节点、分组和访问目标之间的关系。',
  };
  private menuItemServerConfiguration: NavDrawerMenuItem = {
    label: '服务器配置',
    route: '/server-configuration',
    icon: 'build',
    tooltip: '管理服务器端 VPN 配置。',
  };
  private menuItemAbout: NavDrawerMenuItem = {
    label: '关于',
    route: '/about',
    icon: 'help',
    tooltip: '查看应用信息。',
  };
  private menuItemLogIn: NavDrawerMenuItem = {
    label: '登录',
    route: '/login',
    icon: 'login',
    tooltip: '登录后可管理节点、分组和访问目标。',
    replaceUrl: true,
  };
  private menuItemLogOut: NavDrawerMenuItem = {
    label: '退出登录',
    icon: 'logout',
    tooltip: '结束当前登录会话。',
    command: () => {
      this.loginService.logout();
    },
  };
  private menuItemPeerGroups: NavDrawerMenuItem = {
    label: '节点分组',
    route: '/manage-peer-groups',
    icon: 'account_tree',
    tooltip: '管理节点分组及关联的访问目标。',
  };
  private menuItemPeers: NavDrawerMenuItem = {
    label: '节点',
    route: '/manage-peers',
    icon: 'desktop_windows',
    tooltip: '管理节点和组成员。',
  };
  private menuItemTargets: NavDrawerMenuItem = {
    label: '访问目标',
    route: '/manage-targets',
    icon: 'track_changes',
    tooltip: '管理访问目标及关联的节点分组。',
  };

  /** Sections rendered in the upper portion of the drawer. */
  sections: NavDrawerMenuSection[] = [];

  /** Items pinned at the bottom of the drawer (About + auth item). */
  bottomItems: NavDrawerMenuItem[] = [];

  private itemsAuthorized: NavDrawerMenuSection[] = [
    {
      label: '服务器',
      items: [
        this.menuItemMonitorPeers,
        this.menuItemMonitorIPTables,
        this.menuItemVPNLayout,
        this.menuItemServerConfiguration,
      ]
    },
    {
      label: '数据管理',
      items: [
        this.menuItemPeerGroups,
        this.menuItemPeers,
        this.menuItemTargets,
      ]
    },
  ];

  private bottomAuthorized: NavDrawerMenuItem[] = [
    this.menuItemAbout,
    this.menuItemLogOut,
  ];

  private itemsAnonymous: NavDrawerMenuSection[] = [
    {
      label: '服务器',
      items: [
        this.menuItemMonitorPeers,
        this.menuItemMonitorIPTables,
        this.menuItemVPNLayout,
      ]
    },
  ];

  private bottomAnonymous: NavDrawerMenuItem[] = [
    this.menuItemAbout,
    this.menuItemLogIn,
  ];

  /** When true, the drawer renders as an icon-only rail. */
  @Input() collapsed: boolean = false;

  userSessionInfo!: UserSessionInfo;
  loginServiceSubscription !: Subscription;

  constructor(private loginService: LoginService) { }

  ngOnInit(): void {
    this.loginServiceSubscription = this.loginService.getUserSessionInfo().subscribe(data => {
      this.userSessionInfo = data;
      this.sections = this.userSessionInfo.is_logged_in ? this.itemsAuthorized : this.itemsAnonymous;
      this.bottomItems = this.userSessionInfo.is_logged_in ? this.bottomAuthorized : this.bottomAnonymous;
    });
    this.loginService.checkIsUserAuthenticated();
  }

  ngOnDestroy() {
    if (this.loginServiceSubscription) {
      this.loginServiceSubscription.unsubscribe();
    }
  }

  onItemCommand(item: NavDrawerMenuItem): void {
    if (item.command) {
      item.command();
    }
  }
}
