import json
import sys
import requests
import config
from tdx_client import TDXClient

# -------------------------------------------------
# CONFIGURATION
# -------------------------------------------------

TEAM_UIDS = [
    "80c0c3d5-d245-f011-9fa5-9c0eadb6129c",
    "8ab9df26-d145-f011-9fa5-9c0eadb6129c",
    "07d8cdbd-d245-f011-9fa5-9c0eadb6129c",
    "1acfd965-cf45-f011-9fa5-9c0eadb6129c"
]

ALL_UIDS = TEAM_UIDS

def main():
    try:
        client = TDXClient()
        url = f"{client.base_url}/api/{config.APP_ID}/tickets/search"
        headers = client.get_headers()
        
        all_found_tickets = []

        # ---------------------------------------------------------
        # REQUEST: Tickets assigned to me OR my teammates
        # ---------------------------------------------------------
        # Uses TicketSearch.ResponsibilityUids (Guid[])
        payload_team = {
            "MaxResults": 500,
            "ResponsibilityUids": ALL_UIDS
            # If you specifically want only primary-responsibility:
            # "PrimaryResponsibilityUids": ALL_UIDS
        }

        try:
            resp_team = requests.post(url, headers=headers, json=payload_team)
            resp_team.raise_for_status()
            team_tickets = resp_team.json()
            all_found_tickets.extend(team_tickets)
        except Exception as e:
            sys.stderr.write(f"Warning: Team-ticket search failed: {e}\n")

        # ---------------------------------------------------------
        # PROCESS & FORMAT
        # ---------------------------------------------------------
        dashboard_tickets = []
        seen_ids = set()
        
        ignored_statuses = ["Resolved", "Closed", "Cancelled"]

        for t in all_found_tickets:
            ticket_id = t.get("ID")
            status_name = t.get("StatusName")

            # 1. Filter out Resolved/Closed/Cancelled
            if status_name in ignored_statuses:
                continue

            # 2. Deduplicate
            if ticket_id in seen_ids:
                continue
            seen_ids.add(ticket_id)

            # 3. Determine Display Owner
            r_name = t.get("ResponsibleFullName")
            r_group_name = t.get("ResponsibleGroupName")
            
            if r_name:
                display_owner = r_name
            elif r_group_name:
                display_owner = r_group_name
            else:
                display_owner = "Unassigned"

            dashboard_tickets.append({
                "id": ticket_id,
                "title": t.get("Title"),
                "assignedTo": display_owner,
                "status": status_name
            })

        # Output Final JSON
        print(json.dumps(dashboard_tickets))

    except Exception as e:
        print(json.dumps([])) 
        sys.stderr.write(f"CRITICAL ERROR: {str(e)}\n")

if __name__ == "__main__":
    main()
