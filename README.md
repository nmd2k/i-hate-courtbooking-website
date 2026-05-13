# Court Finder (PerfectMind)

A small Chrome extension that reads **live availability** from the University of Melbourne Sport **PerfectMind** badminton booking pages and shows a simple **time × court** grid for the date and hours you pick.

You do **not** need to be logged in if the booking view is already visible in your browser.

---

## Install

1. Open Chrome and go to `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked**.
4. Choose this project folder (`book-court`).

After you change any extension files, open `chrome://extensions` again and click **Reload** on this extension.

---

## How to use

1. In Chrome, open the **badminton court booking** view, either:
   - on **https://unimelb.perfectmind.com** (e.g. facility map / booking page), or  
   - on **https://sport.unimelb.edu.au** if the booking UI is shown **inside the sport site** (embedded PerfectMind frame).
2. Wait until the map or timetable has **fully loaded**.
3. Click the **Court Finder** extension icon in the toolbar.
4. Set **Date**, **Start time**, and **End time**.
5. Click **Search on current page**.

The popup fills a grid: each row is a time slot; each column is a court. A **green** cell means that slot looked **bookable** in the data returned by the site; a **grey** cell means it did not.

Your last date and time choices are remembered for the current browser session.

---

## If something goes wrong

- **“Could not reach the booking frame”** (or similar): the active tab must be the one where PerfectMind is actually running. Use the tab that shows the booking UI (sport site or PerfectMind directly), then try again.
- **Courts load but no green cells for your date**: the site may not have returned that day in its availability window, or the date does not match any row in the response. Try another date or check **DevTools → Network** for `FacilityAvailability` if you are debugging.
- **Extension stopped updating after you edited files**: reload the extension on `chrome://extensions`.

---

## For developers

From this folder:

```bash
npm test
```

runs Node tests against `lib/availability.js` (parsing and date logic). The injected `content.js` mirrors that logic; if you change one, keep the other in sync.

---

## Disclaimer

Availability comes from PerfectMind’s own APIs. If the official site and this grid disagree, trust the **official booking flow** when deciding whether you can reserve a court.
