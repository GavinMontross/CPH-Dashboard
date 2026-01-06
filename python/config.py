import os
from dotenv import load_dotenv

# Load the .env file
load_dotenv()

# Assign to variables
BASE_URL = os.getenv("TDX_BASE_URL")
USERNAME = os.getenv("TDX_USERNAME")
PASSWORD = os.getenv("TDX_PASSWORD")

# Add the App ID (Required for ticket searches)
# We cast to int because the API expects an integer, but handle missing env var safely
try:
    APP_ID = int(os.getenv("TDX_APP_ID"))
except (TypeError, ValueError):
    # This will cause the script to crash later if not fixed, but prevents immediate import error
    APP_ID = None

if not all([BASE_URL, USERNAME, PASSWORD, APP_ID]):
    raise ValueError(
        "Missing credentials! Check your .env file for BASE_URL, USERNAME, PASSWORD, and TDX_APP_ID."
    )
