import requests
import config  # Ensure config.py has BASE_URL, USERNAME, PASSWORD, and APP_ID


class TDXClient:
    def __init__(self):
        self.base_url = config.BASE_URL.rstrip("/")
        self.token = None

        # Authenticate immediately
        self.authenticate()

    def authenticate(self):
        """Exchanges User/Pass for a Bearer Token"""
        # Auth endpoint is usually at the API root: /api/auth/login
        url = f"{self.base_url}/api/auth/login"
        payload = {"UserName": config.USERNAME, "Password": config.PASSWORD}
        headers = {"Content-Type": "application/json"}

        try:
            response = requests.post(url, json=payload, headers=headers)
            response.raise_for_status()

            # Clean up the token (remove quotes)
            self.token = response.text.replace('"', "").strip()

        except requests.exceptions.RequestException as e:
            print(f"CRITICAL: Login failed. Check credentials in .env. Error: {e}")
            raise

    def get_headers(self):
        """Helper to format headers"""
        if not self.token:
            raise Exception("No token available. Authentication failed.")

        return {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }

    def get_all_active_tickets(self):
        """
        Fetches tickets using a combined strategy to ensure Group 3974
        and personal active tickets are both captured.
        """
        # NOTE: Ticket searches require the App ID in the URL
        # URL format: .../api/{appId}/tickets/search
        url = f"{self.base_url}/api/{config.APP_ID}/tickets/search"

        all_found_tickets = []

        # --- SEARCH 1: Your Specific Group (3974) ---
        try:
            payload_group = {
                "IsActive": True,
                "ResponsibleGroupId": [3974],  # Explicitly grab your queue
                "MaxResults": 100,
            }
            res_group = requests.post(
                url, json=payload_group, headers=self.get_headers()
            )
            res_group.raise_for_status()
            all_found_tickets.extend(res_group.json())
        except Exception as e:
            print(f"Warning: Failed to fetch Group 3974 tickets: {e}")

        # --- SEARCH 2: General Active Tickets (Broad Sweep) ---
        try:
            payload_general = {
                "IsActive": True,
                "MaxResults": 100,  # Increased from default (likely 20 or 50)
            }
            res_gen = requests.post(
                url, json=payload_general, headers=self.get_headers()
            )
            res_gen.raise_for_status()
            all_found_tickets.extend(res_gen.json())
        except Exception as e:
            print(f"Warning: Failed to fetch general tickets: {e}")

        # --- DEDUPLICATE ---
        # Since a ticket might appear in both searches, we use a dictionary to remove duplicates by ID
        unique_tickets = {t["ID"]: t for t in all_found_tickets if "ID" in t}

        return list(unique_tickets.values())

    def search_asset(self, serial_number):
        """
        Searches for assets matching the serial number.
        """
        # Check if assets are in a specific App ID or global.
        # Usually /api/{appId}/assets/search OR /api/assets/search depending on TDX version.
        # We will try the global endpoint first as written in your original code.
        url = f"{self.base_url}/api/assets/search"

        payload = {"SerialNumber": serial_number, "IsActive": True}

        try:
            response = requests.post(url, json=payload, headers=self.get_headers())
            response.raise_for_status()
            results = response.json()

            if isinstance(results, list) and len(results) > 0:
                return results[0]
            return None

        except requests.exceptions.RequestException as e:
            print(f"Error searching for asset {serial_number}: {e}")
            return None
