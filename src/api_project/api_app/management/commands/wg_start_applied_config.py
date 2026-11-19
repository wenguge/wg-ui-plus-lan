from django.core.management.base import BaseCommand, CommandError

from api_app.configuration_revision import ConfigurationError, apply_configuration


class Command(BaseCommand):
    help = "Start WireGuard with its last applied configuration."

    def handle(self, *args, **options):
        try:
            apply_configuration(startup=True)
        except ConfigurationError as error:
            raise CommandError(str(error)) from error
