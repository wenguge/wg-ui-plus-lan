#!/bin/bash
set -e

cd /app/api_project
./manage.py backup_db_before_upgrade
./manage.py makemigrations
./manage.py migrate
./manage.py db_init_db_on_start
./manage.py mcp_initialize
./manage.py clear_cache
./manage.py wg_start_applied_config

./manage.py runserver 0.0.0.0:8000
