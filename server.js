const express = require('express');
const ical = require('node-ical');
const cors = require('cors');
const moment = require('moment-timezone');
const { spawn } = require('child_process');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.static('public'));

// --- CONFIGURATION ---
const CALENDAR_ICS_URL = "https://outlook.office365.com/owa/calendar/559a8ce39ea84986a802986542fad4c8@temple.edu/311df36b86d34d5c9431c24ce70bc14415029843121899045862/calendar.ics";

// --- ROUTE 1: Get Today and Tomorrow's Shifts ---
app.get('/api/shifts', async (req, res) => {
    try {
        const events = await ical.async.fromURL(CALENDAR_ICS_URL);
        const now = moment().tz("America/New_York");

        // Define Ranges
        const startToday = now.clone().startOf('day');
        const endToday = now.clone().endOf('day');
        const startTomorrow = now.clone().add(1, 'day').startOf('day');
        const endTomorrow = now.clone().add(1, 'day').endOf('day');

        const shifts = { today: [], tomorrow: [] };

        // Helper 1: For Recurring Events (The "Hack" for Outlook RRule TZs)
        const processRecurring = (ev, date) => {
            // Force "Face Value" Time (Fixes RRULE timezone stripping)
            const rawTime = moment(date).utc().format('YYYY-MM-DD HH:mm:ss');
            const start = moment.tz(rawTime, "America/New_York");

            const duration = new Date(ev.end) - new Date(ev.start);
            const end = start.clone().add(duration, 'milliseconds');

            return {
                name: ev.summary || "Unnamed Shift",
                timeRange: `${start.format('h:mm A')} - ${end.format('h:mm A')}`,
                sortTime: start.unix()
            };
        };

        // Helper 2: For Single Events (Standard TZ parsing works here)
        const processSingle = (ev, date) => {
            // Standard Timezone Conversion (Trusts the ICS file)
            const start = moment(date).tz("America/New_York");

            const duration = new Date(ev.end) - new Date(ev.start);
            const end = start.clone().add(duration, 'milliseconds');

            return {
                name: ev.summary || "Unnamed Shift",
                timeRange: `${start.format('h:mm A')} - ${end.format('h:mm A')}`,
                sortTime: start.unix()
            };
        };

        for (let k in events) {
            const ev = events[k];
            if (ev.type !== 'VEVENT') continue;

            if (ev.rrule) {
                // RECURRING: Use "processRecurring"
                const todayInstances = ev.rrule.between(startToday.toDate(), endToday.toDate());
                todayInstances.forEach(date => shifts.today.push(processRecurring(ev, date)));

                const tomorrowInstances = ev.rrule.between(startTomorrow.toDate(), endTomorrow.toDate());
                tomorrowInstances.forEach(date => shifts.tomorrow.push(processRecurring(ev, date)));
            } else {
                // SINGLE: Use "processSingle"
                const start = moment(ev.start);
                if (start.isBetween(startToday, endToday)) {
                    shifts.today.push(processSingle(ev, ev.start));
                } else if (start.isBetween(startTomorrow, endTomorrow)) {
                    shifts.tomorrow.push(processSingle(ev, ev.start));
                }
            }
        }

        // Sort shifts chronologically
        shifts.today.sort((a, b) => a.sortTime - b.sortTime);
        shifts.tomorrow.sort((a, b) => a.sortTime - b.sortTime);

        res.json(shifts);

    } catch (error) {
        console.error("Calendar Error:", error);
        res.status(500).json({ error: "Failed to fetch shifts" });
    }
});

// --- ROUTE 2: Get Tickets (Python Bridge) ---
app.get('/api/tickets', (req, res) => {
    // Construct path to Python executable and script
    // Using path.join ensures we don't have slash direction issues
    const pythonExec = path.join(__dirname, '.venv', 'bin', 'python3');
    const scriptPath = path.join(__dirname, 'python', 'tickets_bridge.py');

    const pythonProcess = spawn(pythonExec, [scriptPath]);

    let dataString = '';

    // Collect data from STDOUT
    pythonProcess.stdout.on('data', (data) => {
        dataString += data.toString();
    });

    // Log errors from STDERR (Non-blocking)
    pythonProcess.stderr.on('data', (data) => {
        console.error(`[Python Ticket Log]: ${data}`);
    });

    pythonProcess.on('close', (code) => {
        if (code !== 0) {
            console.error("Ticket script failed with code", code);
            // Return empty array on crash so dashboard doesn't break
            return res.json([]);
        }

        try {
            // Attempt to parse the output.
            // If python printed "CRITICAL: Login failed" to stdout, this will fail safely.
            const tickets = JSON.parse(dataString);
            res.json(tickets);
        } catch (e) {
            console.error("Failed to parse ticket JSON. Output was:", dataString);
            res.json([]);
        }
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Dashboard running at http://localhost:${PORT}`));