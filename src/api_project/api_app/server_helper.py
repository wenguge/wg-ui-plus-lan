import datetime
import os
import requests

from django.core.cache import cache
from django.core.exceptions import ImproperlyConfigured

from api_app.wireguard_helper import WireGuardHelper

from .models import Peer, PeerGroup, ServerConfiguration, Target
from .mcp_configuration import MCPConfigurationService

from .common import CACHE_KEY_APP_LIVE_VERSION, CACHE_TTL, APP_URL
from .email_service import get_email_status
from .configuration_revision import configuration_pending, stage_configuration


def get_server_status():
    peers = Peer.objects.all()
    peer_groups = PeerGroup.objects.all()
    targets = Target.objects.all()
    server_configurations = ServerConfiguration.objects.all()
    last_db_change_datetimes = (
        [x.last_changed_datetime for x in peers]
        + [x.last_changed_datetime for x in peer_groups]
        + [x.last_changed_datetime for x in targets]
        + [x.last_changed_datetime for x in server_configurations]
    )
    last_db_change_datetime = (
        max(last_db_change_datetimes) if last_db_change_datetimes else None
    )

    wg = WireGuardHelper()
    res = wg.get_server_status(
        last_db_change_datetime=last_db_change_datetime
    )
    pending = configuration_pending()
    res["can_undo_configuration"] = pending is True
    if pending is not None:
        res["need_regenerate_files"] = pending
        res["status"] = "warning" if pending else "ok"
        if pending:
            res["message"] = "WireGuard configuration changes are pending."
        else:
            res.pop("message", None)
    return res


def get_application_details():
    res = {}
    latest_live_version = "unknown"
    res["current_version"] = "v0.0.0"
    res["current_time"] = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    allow_check_updates = False
    email_status = None
    try:
        res["current_version"] = os.environ.get("APP_VERSION", "v0.0.0")
    except Exception:
        res["current_version"] = "**Error**"
        pass
    try:
        sc = ServerConfiguration.objects.all()[0]
        # Compute the (database-aware) email status before any network call so
        # a failing update check cannot degrade it to the env-only fallback.
        email_status = get_email_status(sc)
        try:
            allow_check_updates = MCPConfigurationService.allow_check_updates(sc)
        except ImproperlyConfigured:
            raise
        latest_live_version = (
            "v0.0.0" if allow_check_updates else "Updates check diabled."
        )

        latest_live_version_temp = cache.get(CACHE_KEY_APP_LIVE_VERSION)
        if latest_live_version_temp:
            latest_live_version = latest_live_version_temp
        else:
            if allow_check_updates:
                response = requests.get(APP_URL)
                latest_live_version = response.url.split("/").pop()
                cache.add(CACHE_KEY_APP_LIVE_VERSION, latest_live_version, CACHE_TTL)
    except ImproperlyConfigured:
        raise
    except Exception:
        latest_live_version = "**Error**"
        pass

    res["latest_live_version"] = latest_live_version
    res["allow_allow_check_updates"] = allow_check_updates
    res["email"] = email_status if email_status is not None else get_email_status()
    res["is_email_enabled"] = res["email"]["status"] == "configured"
    return res


def generate_configuration_files():
    return stage_configuration()
