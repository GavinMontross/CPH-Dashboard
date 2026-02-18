import json
import sys
import requests
import config
from tdx_client import TDXClient

# -------------------------------------------------
# CONFIGURATION
# -------------------------------------------------

ALL_UIDS = [
    "80c0c3d5-d245-f011-9fa5-9c0eadb6129c",
    "8ab9df26-d145-f011-9fa5-9c0eadb6129c",
    "07d8cdbd-d245-f011-9fa5-9c0eadb6129c",
    "1acfd965-cf45-f011-9fa5-9c0eadb6129c",
]

CPH_GROUP_ID = 3974

# STANDARD TDX STATUS CLASSES
# 1 = New, 2 = In Process, 5 = On Hold
ACTIVE_STATUS_CLASSES = [1, 2, 5]


def main():
    try:
        client = TDXClient()
        url = f"{client.base_url}/api/{config.APP_ID}/tickets/search"
        headers = client.get_headers()

        # ---------------------------------------------------------
        # 1. FETCH TEAM TICKETS (For Display Cards)
        # ---------------------------------------------------------
        all_found_tickets = []
        
        # UPDATED: Use StatusClassIDs instead of IsActive
        payload_team = {
            "MaxResults": 500, 
            "ResponsibilityUids": ALL_UIDS,
            "StatusClassIDs": ACTIVE_STATUS_CLASSES
        }

        try:
            resp_team = requests.post(url, headers=headers, json=payload_team)
            resp_team.raise_for_status()
            all_found_tickets = resp_team.json()
        except Exception as e:
            sys.stderr.write(f"Warning: Team-ticket search failed: {e}\n")

        # ---------------------------------------------------------
        # 2. FETCH GROUP TOTAL (For Header Metric)
        # ---------------------------------------------------------
        group_total_count = 0
        try:
            # UPDATED: Use StatusClassIDs instead of IsActive
            # Also removed "IsOnHold" filter since we are handling that via Class 5
            payload_group = {
                "MaxResults": 5000, 
                "ResponsibilityGroupIDs": [CPH_GROUP_ID],
                "StatusClassIDs": ACTIVE_STATUS_CLASSES
            }
            resp_group = requests.post(url, headers=headers, json=payload_group)
            resp_group.raise_for_status()
            group_tickets = resp_group.json()

            # "Scheduled" is usually not in Classes 1/2/5, but just in case:
            ignored_status_names = ["Scheduled"]
            
            actionable_tickets = [
                t for t in group_tickets 
                if t.get("StatusName") not in ignored_status_names
            ]
            
            group_total_count = len(actionable_tickets)
            
            sys.stderr.write(f"DEBUG: Group Search returned {len(group_tickets)} tickets (Classes {ACTIVE_STATUS_CLASSES}).\n")

        except Exception as e:
            sys.stderr.write(f"Warning: Group count search failed: {e}\n")

        # ---------------------------------------------------------
        # PROCESS & FORMAT CARDS
        # ---------------------------------------------------------
        dashboard_tickets = []
        seen_ids = set()
        # Double check safety filter
        ignored_statuses = ["Resolved", "Closed", "Cancelled"]

        for t in all_found_tickets:
            ticket_id = t.get("ID")
            status_name = t.get("StatusName")

            if status_name in ignored_statuses: continue
            if ticket_id in seen_ids: continue
            seen_ids.add(ticket_id)

            r_name = t.get("ResponsibleFullName")
            r_group_name = t.get("ResponsibleGroupName")
            display_owner = r_name if r_name else (r_group_name or "Unassigned")
            
            requestor_name = t.get("RequestorName") or "Unknown"

            dashboard_tickets.append({
                "id": ticket_id,
                "title": t.get("Title"),
                "assignedTo": display_owner,
                "status": status_name,
                "requestor": requestor_name
            })

        output = {
            "tickets": dashboard_tickets,
            "groupCount": group_total_count
        }
        print(json.dumps(output))

    except Exception as e:
        print(json.dumps({"tickets": [], "groupCount": 0}))
        sys.stderr.write(f"CRITICAL ERROR: {str(e)}\n")


if __name__ == "__main__":
    main()