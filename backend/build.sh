#!/usr/bin/env bash
# Render build script for the ZENSURE backend
set -o errexit

pip install --upgrade pip
pip install -r requirements.txt
