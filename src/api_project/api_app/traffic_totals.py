import os
import socket
from pathlib import Path

from .models import TransferBaseline


def interface_generation(configuration):
    """Identify the running interface so a recreated interface starts with fresh counters."""
    try:
        index = socket.if_nametoindex(Path(configuration.wireguard_config_path).stem)
        namespace = os.stat("/proc/self/ns/net").st_ino
        boot = Path("/proc/sys/kernel/random/boot_id").read_text(encoding="ascii").strip()
    except OSError:
        return None
    return f"{boot}:{namespace}:{index}"


def peer_counters(items):
    return {
        str(item["peer_id"]): (item["transfer_tx"] or 0, item["transfer_rx"] or 0)
        for item in items
        if item["peer_id"] is not None
    }


def apply_baselines(snapshot, generation):
    baselines = dict(
        TransferBaseline.objects.filter(interface_generation=generation)
        .values_list("scope", "counters")
    )
    total_before = baselines.get("total", {})
    totals = {"tx": 0, "rx": 0}
    for item in snapshot["items"]:
        peer_id = str(item["peer_id"])
        own_before = baselines.get(f"peer:{peer_id}", {}).get(peer_id)
        aggregate_before = total_before.get(peer_id, (0, 0))
        for index, direction in enumerate(("tx", "rx")):
            current = item[f"transfer_{direction}"]
            if current is None:
                item[f"cumulative_{direction}"] = 0 if own_before else None
                continue
            offset = own_before[index] if own_before else 0
            item[f"cumulative_{direction}"] = since_reset(current, offset)
            if item["peer_id"] is not None:
                totals[direction] += since_reset(current, aggregate_before[index])
    snapshot["total_tx"] = totals["tx"]
    snapshot["total_rx"] = totals["rx"]
    return snapshot


def since_reset(current, offset):
    return current - offset if current >= offset else current


def reset_baseline(peer_id, generation, items):
    counters = peer_counters(items)
    scope = "total"
    if peer_id is not None:
        key = str(peer_id)
        scope = f"peer:{key}"
        counters = {key: counters.get(key, (0, 0))}
    TransferBaseline.objects.update_or_create(
        scope=scope,
        defaults={"interface_generation": generation, "counters": counters},
    )
