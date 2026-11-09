# Homestay & guest house booking manager

A simple booking system for a small homestay, guest house or resort: a room calendar, bookings, check-in and
check-out, payments with **PromptPay QR**, guest messages by **WhatsApp, LINE or SMS**, invoices and receipts,
housekeeping, a **TM.30** reminder for foreign guests, and reports (occupancy, ADR, RevPAR).
In English, Thai and Sinhala.

No installation, no server, no monthly fee and no commission. Open `index.html` in Chrome or Edge.

## What it does

**🏠 Today**
- Tonight's occupancy, arrivals, departures and guests in house, with one-click **Check in** / **Check out**
- Alerts: foreign guests not yet reported to Immigration (**TM.30**), holds whose deposit time has run out, and guests who haven't arrived
- **Housekeeping**: a room is marked "to clean" at check-out; tap **Mark clean** when it's ready

**📅 Calendar**: every room for the next two weeks. Click an empty night to book that room; click a booking to
open it. Colours show hold / confirmed / in house / checked out, and a red dot means money is still due.

**Bookings**
- Pick dates and the number of guests, and only the **free rooms** are offered, each with its price
  (weekend nights use the weekend price automatically). You can also set a fixed price per night.
- **Double bookings are impossible.** Back-to-back stays (one guest leaves the morning the next arrives) are fine.
- Source: walk-in, phone, LINE, WhatsApp, Facebook, Booking.com, Agoda, Airbnb, website… plus the OTA booking number
- **Hold** a room while you wait for a deposit (24 hours by default); the first payment confirms it
- **Extras**: breakfast (per person per night), extra bed, motorbike rental, airport pickup… quantities are calculated for you.
  Edit your own list in Settings.
- **Discounts**, **payments** (cash, bank transfer, PromptPay, card, paid via OTA) and refunds (a negative amount)
- **PromptPay QR** for the exact amount, on screen and on the invoice
- **Check-out** won't go through while money is still due (you can override it). If a guest leaves early, the unused nights are removed.
- Change room or dates, cancel (with a reason), no-show, restore
- **Invoice / receipt** printing

**💬 Messages to guests**: booking confirmation (with deposit and PromptPay details), arrival info (map, Wi-Fi,
check-in time, house rules), and a thank-you with your **review link**. They open in WhatsApp, LINE, SMS or email
with the text ready. Change the wording in Settings.

**👤 Guests**: nationality, passport/ID number, notes ("likes a quiet room"), their stays and total spent. Repeat guests get a ★.

**📊 Reports**: occupancy, room revenue, **ADR** (average price per night), **RevPAR** (revenue per available room),
extras, money received by payment method, revenue by booking source and by room, rooms sold per night, average stay,
cancellations and no-shows, foreign guests, and guests who left with money still due. Bookings export to CSV/Excel.

## Start

1. Open `index.html` in **Chrome** or **Edge**.
2. **⚙️ Settings**:
   - Your property's name, address, phone and Google Maps link; the language and currency
   - **Rooms**: name/number, type, how many people it sleeps, and the normal and weekend prices. Four sample rooms are there to start with: edit or remove them.
   - Weekend nights (Friday and Saturday by default), and check-in/check-out times
   - **PromptPay ID** (mobile or ID number) for QR codes, and your bank account
   - Wi-Fi, house rules and review link, which go into the guest messages
3. Press **＋ New booking**, or click an empty night on the calendar.

## Thailand: TM.30

The law requires you to report foreign guests to Immigration within 24 hours. The app reminds you about every foreign
guest in house who isn't marked as reported. Report them (TM.30 website/app or the Immigration office), then tick
**Reported to Immigration (TM.30)** in the booking. Outside Thailand, untick the reminder in Settings.

## Booking.com, Agoda and Airbnb

This app doesn't connect to OTAs automatically (that needs a paid "channel manager"). When an OTA booking comes in,
add it here with the source and the OTA number, so the room is blocked on your calendar. When you take a booking
directly, close those dates on the OTA extranet too.

## Your data

- Everything stays **in this browser on this computer**. Nothing is uploaded.
- **Make a backup every week**: Settings → **Backup** saves one file. Keep it safe, because it contains guest details
  (passport numbers). **Restore** loads it on another computer.
- Clearing the browser's history/site data deletes the data, which is why backups matter.
- A **PIN** in Settings locks the screen when it opens (🔒 locks it any time). It keeps casual eyes out but is not encryption.
- One computer at a time. Sharing bookings live across several phones/computers would need a server.

## Files

| File | What it does |
|---|---|
| `index.html`, `app.js`, `style.css` | The app |
| `core.js` | All the rules: availability, prices, payments, check-in/out, reports |
| `i18n.js` | Texts in English, Thai and Sinhala: edit here to change any wording |
