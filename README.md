# Court Finder (PerfectMind)

A small Chrome extension that reads **live availability** from the University of Melbourne Sport **PerfectMind** badminton booking pages and shows a simple **time × court** grid for the date and hours you pick.

You do **not** need to be logged in if the booking view is already visible in your browser.

---

## Install

1. Open Chrome and go to `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked**.
4. Choose this project folder (`book-court`), or the folder you get after unzipping a release asset.

After you change any extension files, open `chrome://extensions` again and click **Reload** on this extension.

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
