from django.core.management.base import BaseCommand, CommandError

from api_app.configuration_revision import ConfigurationError, apply_configuration


class Command(BaseCommand):
    help = 'Restart WireGuard VPN'

    def handle(self, *args, **options):
        try:
            apply_configuration(existing_files=True)
        except (ConfigurationError, OSError) as error:
            raise CommandError("Could not restart WireGuard.") from error
        self.stdout.write(self.style.SUCCESS("WireGuard VPN restarted."))
