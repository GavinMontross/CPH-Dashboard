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

// --- ROUTE 1: Asset Search (Backend Bridge) ---
app.get('/api/search', (req, res) => {
    const serialNumber = req.query.serial;
    if (!serialNumber) return res.status(400).json({ error: "Serial required" });

    const pythonProcess = spawn('python', [
        path.join(__dirname, 'python', 'search_bridge.py'), 
        serialNumber
    ]);

    let dataString = '';
    pythonProcess.stdout.on('data', (data) => dataString += data.toString());
    
    pythonProcess.on('close', (code) => {
        if (code !== 0) return res.status(500).json({ error: "Search failed" });
        try {
            res.json(JSON.parse(dataString));
        } catch (e) {
            res.status(500).json({ error: "Invalid data from scanner" });
        }
    });
});

// --- ROUTE 2: Get Today's Shifts (Timezone Fixed) ---
app.get('/api/shifts', async (req, res) => {
    try {
        const events = await ical.async.fromURL(CALENDAR_ICS_URL);
        const now = moment().tz("America/New_York");
        const startOfDay = now.clone().startOf('day');
        const endOfDay = now.clone().endOf('day');

        let shifts = [];

        for (let k in events) {
            const ev = events[k];
            if (ev.type !== 'VEVENT') continue;

            let eventStart = null;

            // --- RECURRING EVENTS ---
            if (ev.rrule) {
                const dates = ev.rrule.between(startOfDay.toDate(), endOfDay.toDate());
                if (dates.length > 0) {
                    // PROBLEM: Dates usually come back as UTC, causing the 5-hour drift.
                    // FIX: We format the date to a simple string (e.g., "2023-12-15 09:00:00") 
                    // and then re-parse it explicitly as New York time.
                    const rawDate = moment(dates[0]).utc(); 
                    eventStart = moment.tz(rawDate.format('YYYY-MM-DD HH:mm:ss'), "America/New_York");
                }
            } 
            // --- SINGLE EVENTS ---
            else {
                const simpleStart = moment(ev.start);
                if (simpleStart.isBetween(startOfDay, endOfDay)) {
                    // Apply the same fix for single events just in case
                    const rawDate = moment(ev.start).utc();
                    eventStart = moment.tz(rawDate.format('YYYY-MM-DD HH:mm:ss'), "America/New_York");
                }
            }

            if (eventStart) {
                // Calculate duration to get the correct End Time
                const durationMillis = new Date(ev.end) - new Date(ev.start);
                const eventEnd = eventStart.clone().add(durationMillis, 'milliseconds');
                
                shifts.push({
                    name: ev.summary, 
                    timeRange: `${eventStart.format('h:mm A')} - ${eventEnd.format('h:mm A')}`,
                    sortTime: eventStart.unix()
                });
            }
        }
        res.json(shifts.sort((a, b) => a.sortTime - b.sortTime));
    } catch (error) {
        console.error("Calendar Error:", error.message);
        res.status(500).json({ error: "Failed to fetch shifts" });
    }
});

// --- ROUTE 3: Get Tickets (Real Python Bridge) ---
app.get('/api/tickets', (req, res) => {
    console.log("[Node] Fetching real tickets via Python...");

    const pythonProcess = spawn('python', [
        path.join(__dirname, 'python', 'tickets_bridge.py')
    ]);

    let dataString = '';

    pythonProcess.stdout.on('data', (data) => {
        dataString += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
        console.error(`[Python Ticket Error]: ${data}`);
    });

    pythonProcess.on('close', (code) => {
        if (code !== 0) {
            console.error("Ticket script failed with code", code);
            return res.json([]); 
        }
        try {
            const tickets = JSON.parse(dataString);
            console.log(`[Node] Found ${tickets.length} tickets for the team.`);
            res.json(tickets);
        } catch (e) {
            console.error("Failed to parse ticket JSON");
            res.json([]);
        }
    });
});

app.listen(3000, () => console.log('Dashboard running at http://localhost:3000'));