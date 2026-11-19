from django.core.management.base import BaseCommand, CommandError

from api_app.configuration_revision import ConfigurationError, stage_configuration


class Command(BaseCommand):
    help = 'Generate WireGuard Configuration files.'

    def handle(self, *args, **options):
        try:
            stage_configuration()
        except (ConfigurationError, OSError) as error:
            raise CommandError("Could not generate WireGuard configuration.") from error
        self.stdout.write(self.style.SUCCESS("Generated WireGuard configuration files."))
