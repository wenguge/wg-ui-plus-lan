import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from qrcode import QRCode
from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from api_app.common import PEER_GROUP_EVERYONE_NAME
from api_app.configuration_revision import apply_configuration, configuration_pending
from api_app.models import Peer, PeerGroup, ServerConfiguration, Target, TransferBaseline, WireGuardRevision


class ConfigurationRevisionTests(TestCase):
    def setUp(self):
        directory = TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        base = Path(directory.name)
        self.configuration = ServerConfiguration.objects.create(
            network_address="10.66.66.0/24",
            ip_address="10.66.66.1",
            host_name_external="vpn.example.test",
            port_external=51823,
            port_internal=51820,
            upstream_dns_ip_address="192.0.2.53",
            wireguard_config_path=str(base / "wg0.conf"),
            script_path_post_up=str(base / "up.sh"),
            script_path_post_down=str(base / "down.sh"),
            public_key="server-public",
            private_key="server-private",
            peer_default_port=51820,
            strict_allowed_ips_in_peer_config=True,
            last_changed_datetime=timezone.now(),
        )
        self.peer = self.create_peer("Phone", "10.66.66.2")
        self.target = Target.objects.create(name="PVE", ip_address="192.168.50.3", port=8443)
        PeerGroup.objects.create(name=PEER_GROUP_EVERYONE_NAME)
        self.group = PeerGroup.objects.create(name="LAN")
        self.group.peers.add(self.peer)
        self.group.targets.add(self.target)
        self.client = APIClient()
        self.client.force_authenticate(get_user_model().objects.create_user(username="operator"))
        self.apply_url = reverse("wireguard_apply_configuration")
        self.undo_url = reverse("wireguard_undo_configuration")

        with patch("api_app.configuration_revision.interface_running", return_value=False):
            with patch("api_app.configuration_revision.run_command"):
                apply_configuration(startup=True)

    def create_peer(self, name, address):
        return Peer.objects.create(
            name=name, ip_address=address,
            public_key=f"{name}-public", private_key=f"{name}-private",
        )

    def test_undo_restores_identifiers_and_groups_without_restarting(self):
        peer_id = self.peer.pk
        scope = f"peer:{peer_id}"
        TransferBaseline.objects.create(scope=scope, interface_generation="wg0")
        self.peer.delete()
        self.create_peer("Replacement", "10.66.66.2")
        self.group.targets.clear()
        Target.objects.filter(pk=self.target.pk).update(port=9999)
        ServerConfiguration.objects.update(host_name_external="pending.test", email_host="smtp.test")
        self.assertTrue(configuration_pending())

        with patch("api_app.configuration_revision.run_command") as command:
            response = self.client.post(self.undo_url)
        self.assertEqual(response.status_code, 204)
        command.assert_not_called()
        self.assertFalse(configuration_pending())
        self.assertEqual(Peer.objects.get().pk, peer_id)
        self.assertEqual(Peer.objects.get().private_key, "Phone-private")
        self.assertEqual(self.group.peers.get().pk, peer_id)
        self.assertEqual(self.group.targets.get().port, 8443)
        self.assertTrue(TransferBaseline.objects.filter(scope=scope).exists())
        self.configuration.refresh_from_db()
        self.assertEqual(self.configuration.host_name_external, "vpn.example.test")
        self.assertEqual(self.configuration.email_host, "smtp.test")

    def test_apply_failure_keeps_previous_revision_and_pending_changes(self):
        config_file = Path(self.configuration.wireguard_config_path)
        original = config_file.read_bytes()
        applied = WireGuardRevision.objects.get().applied
        Peer.objects.filter(pk=self.peer.pk).update(public_key="pending-public")
        running = True
        started = []

        def command(*args):
            nonlocal running
            if args[1:3] == ("wg-quick", "down"):
                running = False
            if args[1:3] == ("wg-quick", "up"):
                started.append(config_file.read_bytes())
                if len(started) == 1:
                    raise subprocess.CalledProcessError(1, args)
                running = True

        with patch("api_app.configuration_revision.interface_running", side_effect=lambda _path: running):
            with patch("api_app.configuration_revision.run_command", side_effect=command):
                response = self.client.post(self.apply_url)
        self.assertEqual(response.status_code, 503)
        self.assertTrue(running)
        self.assertIn(b"pending-public", started[0])
        self.assertEqual(started[1], original)
        self.assertEqual(config_file.read_bytes(), original)
        self.assertEqual(WireGuardRevision.objects.get().applied, applied)
        self.assertTrue(configuration_pending())

    def test_successful_apply_sets_new_baseline_and_startup_preserves_pending_edits(self):
        Peer.objects.filter(pk=self.peer.pk).update(public_key="next-public")
        with patch("api_app.configuration_revision.interface_running", return_value=False):
            with patch("api_app.configuration_revision.run_command"):
                self.assertEqual(self.client.post(self.apply_url).status_code, 204)
                self.assertFalse(configuration_pending())
                Peer.objects.filter(pk=self.peer.pk).update(public_key="future-public")
                apply_configuration(startup=True)
        self.assertTrue(configuration_pending())
        self.assertIn("next-public", Path(self.configuration.wireguard_config_path).read_text(encoding="utf-8"))
        self.assertEqual(Peer.objects.get().public_key, "future-public")

    def test_unauthenticated_or_missing_csrf_cannot_change_configuration(self):
        client = APIClient(enforce_csrf_checks=True)
        for url in (self.apply_url, self.undo_url):
            self.assertEqual(client.post(url).status_code, 403)
        client.force_login(get_user_model().objects.get(username="operator"))
        for url in (self.apply_url, self.undo_url):
            self.assertEqual(client.post(url).status_code, 403)

    def test_export_options_save_without_marking_legacy_revision_pending(self):
        revision = WireGuardRevision.objects.get()
        revision.applied.pop("peer_export_options")
        revision.save(update_fields=["applied"])
        url = reverse("peer-detail", args=[self.peer.pk])
        self.assertEqual(APIClient().get(url).status_code, 403)
        self.assertNotIn("DNS =", self.client.get(url).json()["configuration"])
        self.assertEqual(self.client.patch(url, {"client_use_vpn_dns": "invalid"}, format="json").status_code, 400)

        response = self.client.patch(url, {
            "client_use_vpn_dns": True,
            "client_include_server_route": True,
        }, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(configuration_pending())

        with patch.object(QRCode, "add_data", autospec=True, side_effect=QRCode.add_data) as encode:
            response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["client_use_vpn_dns"])
        self.assertTrue(payload["client_include_server_route"])
        self.assertIn("DNS = 192.0.2.53\n", payload["configuration"])
        self.assertIn("AllowedIPs = 10.66.66.1/32,192.0.2.53/32,192.168.50.3/32", payload["configuration"])
        self.assertEqual(encode.call_args.args[1], payload["configuration"])

        peer_id = self.peer.pk
        self.peer.delete()
        self.assertEqual(self.client.post(self.undo_url).status_code, 204)
        restored = Peer.objects.get(pk=peer_id)
        self.assertIsNone(restored.client_use_vpn_dns)
        self.assertFalse(restored.client_include_server_route)

    def test_undo_preserves_export_choices_for_existing_and_recreated_peers(self):
        deleted = self.create_peer("Laptop", "10.66.66.3")
        saved_default = Peer.objects.filter(pk=deleted.pk)
        saved_default.update(client_use_vpn_dns=True, client_include_server_route=True)
        with patch("api_app.configuration_revision.interface_running", return_value=False):
            with patch("api_app.configuration_revision.run_command"):
                self.assertEqual(self.client.post(self.apply_url).status_code, 204)

        Peer.objects.filter(pk=self.peer.pk).update(client_use_vpn_dns=True)
        deleted.delete()
        self.assertEqual(self.client.post(self.undo_url).status_code, 204)
        self.assertTrue(Peer.objects.get(pk=self.peer.pk).client_use_vpn_dns)
        self.assertTrue(saved_default.get().client_include_server_route)
        self.assertTrue(saved_default.get().client_use_vpn_dns)
        self.assertFalse(configuration_pending())

    def test_legacy_peer_insert_can_omit_new_export_fields(self):
        with connection.cursor() as cursor:
            cursor.execute(
                "INSERT INTO api_app_peer (name, last_changed_datetime) VALUES (%s, %s)",
                ["Legacy", timezone.now()],
            )
        peer = Peer.objects.get(name="Legacy")
        self.assertIsNone(peer.client_use_vpn_dns)
        self.assertIsNone(peer.client_include_server_route)
