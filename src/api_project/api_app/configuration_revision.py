import logging
import os
import socket
import subprocess
from pathlib import Path
from tempfile import NamedTemporaryFile

from django.db import transaction

from .models import Peer, PeerGroup, ServerConfiguration, Target, TransferBaseline, WireGuardRevision
from .wireguard_helper import WireGuardHelper


logger = logging.getLogger(__name__)

SERVER_FIELDS = (
    "network_address", "ip_address", "host_name_external", "port_external",
    "port_internal", "upstream_dns_ip_address", "local_networks",
    "wireguard_config_path", "script_path_post_down", "script_path_post_up",
    "public_key", "private_key", "peer_default_port", "strict_allowed_ips_in_peer_config",
)

CONFIGURED_MODELS = (Peer, Target, PeerGroup)
PEER_EXPORT_FIELDS = ("client_use_vpn_dns", "client_include_server_route")


class ConfigurationError(Exception):
    pass


def writable_revision():
    # Begin with a write so concurrent configuration edits cannot interleave
    # with the SQLite transaction that captures, applies or restores a revision.
    WireGuardRevision.objects.bulk_create([WireGuardRevision(pk=1)], ignore_conflicts=True)
    return WireGuardRevision.objects.get(pk=1)


def model_fields(model):
    return [field.attname for field in model._meta.concrete_fields
            if field.name != "last_changed_datetime" and field.name not in PEER_EXPORT_FIELDS]


def capture_configuration():
    state = {"server": ServerConfiguration.objects.values(*SERVER_FIELDS).first()}
    for model in CONFIGURED_MODELS:
        state[model._meta.model_name] = list(
            model.objects.order_by("pk").values(*model_fields(model))
        )
    for relation in ("peers", "targets"):
        through = getattr(PeerGroup, relation).through
        related_id = "peer_id" if relation == "peers" else "target_id"
        state[relation] = list(
            through.objects.order_by("peergroup_id", related_id)
            .values("peergroup_id", related_id)
        )
    return state


def render_configuration():
    state = capture_configuration()
    configuration = ServerConfiguration.objects.first()
    if configuration is None:
        raise ConfigurationError("WireGuard configuration is not initialized.")
    peers = Peer.objects.all()
    groups = PeerGroup.objects.all()
    helper = WireGuardHelper()
    files = helper.get_wireguard_configuration(configuration, groups, peers)
    up, down = helper.get_wireguard_iptables_script(configuration, Target.objects.all(), groups, peers)
    return {
        "state": state,
        # Save export options for deleted peers without making export edits pending.
        "peer_export_options": {
            str(peer["id"]): {field: peer[field] for field in PEER_EXPORT_FIELDS}
            for peer in peers.values("id", *PEER_EXPORT_FIELDS)
        },
        "files": {
            "wireguard_config_path": files["server_configuration"] + "\n",
            "script_path_post_up": up,
            "script_path_post_down": down,
        },
    }


def write_configuration(revision):
    for field, content in revision["files"].items():
        path = Path(revision["state"]["server"][field])
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary_path = None
        try:
            with NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, delete=False) as temporary:
                temporary_path = Path(temporary.name)
                temporary.write(content)
            temporary_path.chmod(0o600 if field == "wireguard_config_path" else 0o700)
            temporary_path.replace(path)
        finally:
            if temporary_path is not None:
                temporary_path.unlink(missing_ok=True)


def configuration_path(revision):
    return revision["state"]["server"]["wireguard_config_path"]


def interface_running(config_path):
    try:
        socket.if_nametoindex(Path(config_path).stem)
    except OSError:
        return False
    return True


def run_command(*command):
    # Command output is not returned to the panel and may contain network data.
    subprocess.run(
        command, check=True, timeout=45,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )


def activate_configuration(candidate, previous):
    new_path = configuration_path(candidate)
    old_path = configuration_path(previous) if previous else new_path
    was_running = interface_running(old_path)
    if was_running and previous is None:
        raise ConfigurationError("The running WireGuard configuration has no recorded revision.")
    attempting_new_interface = False
    try:
        if was_running:
            # A legacy generate-only call may have staged different disk files.
            write_configuration(previous)
            run_command("sudo", "wg-quick", "down", old_path)
            run_command("sudo", "conntrack", "-F")
        write_configuration(candidate)
        attempting_new_interface = True
        run_command("sudo", "wg-quick", "up", new_path)
    except (OSError, subprocess.SubprocessError) as error:
        logger.warning("WireGuard apply failed (%s).", type(error).__name__)
        if previous:
            try:
                if attempting_new_interface and interface_running(new_path):
                    run_command("sudo", "wg-quick", "down", new_path)
                write_configuration(previous)
                if was_running and not interface_running(old_path):
                    run_command("sudo", "wg-quick", "up", old_path)
            except (OSError, subprocess.SubprocessError):
                logger.error("Could not restore the last applied WireGuard configuration.")
                raise ConfigurationError("WireGuard apply and automatic recovery failed.") from error
        raise ConfigurationError("WireGuard did not load the new configuration.") from error


@transaction.atomic
def stage_configuration():
    revision = writable_revision()
    candidate = render_configuration()
    write_configuration(candidate)
    revision.staged = candidate
    revision.save(update_fields=["staged"])
    return {"status": "ok", "output": ""}


@transaction.atomic
def apply_configuration(*, existing_files=False, startup=False):
    revision = writable_revision()
    if startup and revision.applied:
        activate_configuration(revision.applied, revision.applied)
        return {"status": "ok", "output": ""}
    candidate = (revision.staged or revision.applied) if existing_files else None
    candidate = candidate or render_configuration()
    previous = revision.applied
    revision.applied = candidate
    revision.staged = None
    revision.save(update_fields=["applied", "staged"])
    keep = ["total", *(f"peer:{row['id']}" for row in candidate["state"]["peer"])]
    TransferBaseline.objects.exclude(scope__in=keep).delete()
    activate_configuration(candidate, previous)
    return {"status": "ok", "output": ""}


@transaction.atomic
def undo_configuration():
    revision = writable_revision()
    if not revision.applied:
        return False
    state = revision.applied["state"]
    ServerConfiguration.objects.update(**state["server"])
    for model in CONFIGURED_MODELS:
        rows = state[model._meta.model_name]
        fields = [field for field in model_fields(model) if field != "id"]
        export_options = revision.applied.get("peer_export_options", {}) if model is Peer else {}
        model.objects.exclude(pk__in=[row["id"] for row in rows]).delete()
        model.objects.bulk_create(
            [model(**row, **export_options.get(str(row["id"]), {})) for row in rows],
            update_conflicts=True, update_fields=fields, unique_fields=["id"],
        )
    for relation in ("peers", "targets"):
        through = getattr(PeerGroup, relation).through
        through.objects.all().delete()
        through.objects.bulk_create([through(**row) for row in state[relation]])
    if revision.staged:
        write_configuration(revision.applied)
        revision.staged = None
        revision.save(update_fields=["staged"])
    return True


def configuration_pending():
    revision = WireGuardRevision.objects.filter(pk=1).first()
    if revision is None or revision.applied is None:
        return None
    return capture_configuration() != revision.applied["state"]
