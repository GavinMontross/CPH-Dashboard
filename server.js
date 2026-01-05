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

    const pythonProcess = spawn(path.join(__dirname, '.venv/bin/python3'), [
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

// --- ROUTE 2: Get Today and Tomorrow's Shifts ---
app.get('/api/shifts', async (req, res) => {
    try {
        const events = await ical.async.fromURL(CALENDAR_ICS_URL);
        const now = moment().tz("America/New_York");
        
        // Time Ranges
        const startToday = now.clone().startOf('day');
        const endToday = now.clone().endOf('day');
        const startTomorrow = now.clone().add(1, 'day').startOf('day');
        const endTomorrow = now.clone().add(1, 'day').endOf('day');

        let shifts = { today: [], tomorrow: [] };

        for (let k in events) {
            const ev = events[k];
            if (ev.type !== 'VEVENT') continue;

            const processEvent = (date) => {
                const rawDate = moment(date).utc();
                const eventStart = moment.tz(rawDate.format('YYYY-MM-DD HH:mm:ss'), "America/New_York");
                const durationMillis = new Date(ev.end) - new Date(ev.start);
                const eventEnd = eventStart.clone().add(durationMillis, 'milliseconds');

                return {
                    name: ev.summary,
                    timeRange: `${eventStart.format('h:mm A')} - ${eventEnd.format('h:mm A')}`,
                    sortTime: eventStart.unix()
                };
            };

            // Handle Recurring and Single Events
            if (ev.rrule) {
                const todayDates = ev.rrule.between(startToday.toDate(), endToday.toDate());
                const tomorrowDates = ev.rrule.between(startTomorrow.toDate(), endTomorrow.toDate());
                
                if (todayDates.length > 0) shifts.today.push(processEvent(todayDates[0]));
                if (tomorrowDates.length > 0) shifts.tomorrow.push(processEvent(tomorrowDates[0]));
            } else {
                const simpleStart = moment(ev.start);
                if (simpleStart.isBetween(startToday, endToday)) {
                    shifts.today.push(processEvent(ev.start));
                } else if (simpleStart.isBetween(startTomorrow, endTomorrow)) {
                    shifts.tomorrow.push(processEvent(ev.start));
                }
            }
        }

        // Sort both arrays
        shifts.today.sort((a, b) => a.sortTime - b.sortTime);
        shifts.tomorrow.sort((a, b) => a.sortTime - b.sortTime);
        
        res.json(shifts);
    } catch (error) {
        console.error("Calendar Error:", error.message);
        res.status(500).json({ error: "Failed to fetch shifts" });
    }
});

// --- ROUTE 3: Get Tickets (Real Python Bridge) ---
app.get('/api/tickets', (req, res) => {
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
            res.json(tickets);
        } catch (e) {
            console.error("Failed to parse ticket JSON");
            res.json([]);
        }
    });
});

app.listen(3000, () => console.log('Dashboard running at http://localhost:3000'));