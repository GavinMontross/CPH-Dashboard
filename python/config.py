import os
from dotenv import load_dotenv

# Load the .env file
load_dotenv()

# Assign to variables
BASE_URL = os.getenv("TDX_BASE_URL")
USERNAME = os.getenv("TDX_USERNAME")
PASSWORD = os.getenv("TDX_PASSWORD")

# Add the App ID (Required for ticket searches)
try:
    # Handle case where env var is missing or empty string
    app_id_str = os.getenv("TDX_APP_ID", "")
    APP_ID = int(app_id_str) if app_id_str else None
except ValueError:
    APP_ID = None

# If any credential is missing, we must fail
if not all([BASE_URL, USERNAME, PASSWORD, APP_ID]):
    raise ValueError(
        "Missing credentials! Check your .env file for BASE_URL, USERNAME, PASSWORD, and TDX_APP_ID."
    )
