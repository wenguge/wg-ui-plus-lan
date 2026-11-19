from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from api_app.models import Peer, ServerConfiguration, TransferBaseline


class TrafficTotalsTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.configuration = ServerConfiguration.objects.create(
            network_address="10.66.66.0/24",
            ip_address="10.66.66.1",
            host_name_external="vpn.example.test",
            port_external=51823,
            port_internal=51820,
            upstream_dns_ip_address="192.0.2.53",
            wireguard_config_path="/config/wireguard/wg0.conf",
            public_key="server-public",
            private_key="server-private",
            peer_default_port=51820,
            last_changed_datetime=timezone.now() - timedelta(minutes=1),
        )
        cls.phone = Peer.objects.create(
            name="Phone", ip_address="10.66.66.2",
            public_key="phone-public", private_key="phone-private",
        )
        cls.laptop = Peer.objects.create(
            name="Laptop", ip_address="10.66.66.3",
            public_key="laptop-public", private_key="laptop-private",
        )
        cls.user = get_user_model().objects.create_user(username="monitor")

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.monitor_url = reverse("wireguard_get_connected_peers")
        self.reset_url = reverse("wireguard_reset_transfer_totals")
        self.counters = {self.phone.pk: (100, 80), self.laptop.pk: (60, 40)}
        read_peers = patch("api_app.views.get_connected_peers", side_effect=self.snapshot)
        read_peers.start()
        self.addCleanup(read_peers.stop)
        generation = patch("api_app.views.interface_generation", return_value="first-interface")
        self.generation = generation.start()
        self.addCleanup(generation.stop)

    def snapshot(self, _configuration):
        return {"items": [
            {"peer_id": peer_id, "transfer_tx": tx, "transfer_rx": rx}
            for peer_id, (tx, rx) in self.counters.items()
        ]}

    def totals(self, client=None):
        response = (client or self.client).get(self.monitor_url)
        self.assertEqual(response.status_code, 200)
        return response.json()

    def test_independent_resets_preserve_raw_counters_and_persist(self):
        response = self.client.post(self.reset_url, {"peer_id": self.phone.pk}, format="json")
        self.assertEqual(response.status_code, 204)
        data = self.totals()
        self.assertEqual((data["total_tx"], data["total_rx"]), (160, 120))
        self.assertEqual(data["items"][0]["transfer_tx"], 100)
        self.assertEqual(data["items"][0]["cumulative_tx"], 0)
        self.assertEqual(data["items"][1]["cumulative_tx"], 60)

        self.counters[self.phone.pk] = (120, 94)
        response = self.client.post(self.reset_url, {"peer_id": None}, format="json")
        self.assertEqual(response.status_code, 204)
        other_client = APIClient()
        other_client.force_authenticate(self.user)
        data = self.totals(other_client)
        self.assertEqual((data["total_tx"], data["total_rx"]), (0, 0))
        self.assertEqual(data["items"][0]["cumulative_tx"], 20)

        self.counters[self.laptop.pk] = (70, 46)
        data = self.totals(other_client)
        self.assertEqual((data["total_tx"], data["total_rx"]), (10, 6))
        self.assertEqual(data["items"][1]["cumulative_tx"], 70)

    def test_new_wireguard_interface_ignores_existing_baselines(self):
        self.client.post(self.reset_url, {"peer_id": None}, format="json")
        self.client.post(self.reset_url, {"peer_id": self.phone.pk}, format="json")
        self.generation.return_value = "replacement-interface"
        self.counters[self.phone.pk] = (130, 15)
        data = self.totals()
        self.assertEqual((data["total_tx"], data["total_rx"]), (190, 55))
        self.assertEqual(data["items"][0]["cumulative_tx"], 130)

    def test_unavailable_or_unauthorized_resets_do_not_create_baselines(self):
        response = APIClient().post(self.reset_url, {"peer_id": None}, format="json")
        self.assertEqual(response.status_code, 403)
        response = self.client.post(self.reset_url, {}, format="json")
        self.assertEqual(response.status_code, 400)
        response = self.client.post(self.reset_url, {"peer_id": 99999}, format="json")
        self.assertEqual(response.status_code, 404)
        self.generation.side_effect = ["first-interface", "replacement-interface"]
        response = self.client.post(self.reset_url, {"peer_id": None}, format="json")
        self.assertEqual(response.status_code, 409)
        self.assertFalse(TransferBaseline.objects.exists())

    def test_peer_delete_marks_wireguard_configuration_dirty(self):
        self.client.post(self.reset_url, {"peer_id": self.phone.pk}, format="json")
        before = self.configuration.last_changed_datetime
        response = self.client.delete(reverse("peer-detail", args=[self.phone.pk]))
        self.assertEqual(response.status_code, 204)
        self.configuration.refresh_from_db()
        self.assertGreater(self.configuration.last_changed_datetime, before)
        self.assertTrue(TransferBaseline.objects.filter(scope__startswith="peer:").exists())
