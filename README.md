# Present Planner

A simple app for keeping track of the people you buy presents for, so you never forget a birthday or Christmas present.

- **People** – add each person with their birthday (day and month, plus the year if you want to see their age), whether you buy them a Christmas present, whether you send them a card, an optional budget per present (per year), and notes (sizes, likes, address).
- **Presents** – record each present against Christmas or their birthday for a year: what it is, how much it cost, and where it's at (💡 idea, 🛍️ bought, ✅ sent). Tap the status on a present to move it on. When you add one, it shows what you've given that person before, so you don't give the same thing twice.
- **🎂 Birthdays tab** – opens first. **To sort** lists birthdays in the next 30 days that aren't sorted yet, marked *Nothing yet*, *Only ideas*, *Not sent yet* or *Card not sent* (red in the last week), with **+ Present** (you can keep adding presents until everything's sent), **Mark sent** and **✉️ Card: Yes / No** buttons. **Coming up** shows everyone else's birthday over the next 12 months, in date order.
- **🎄 Christmas tab** – everyone you buy a Christmas present for, split into **Still to sort** and **Sorted**, with how many days to go, how many are sorted and what you've spent against their budgets.
- Each tab shows a red count of what still needs sorting (Christmas from 60 days before). An occasion only counts as sorted once the presents are sent and, for people who get one, the card is too. Card toggles for the year are also on each person's card.
- **Spending** – for any year: total spent, Christmas, birthdays, ideas not bought yet, and a breakdown per person. Ideas only count as spent once they're bought. People's cards warn when a present goes over their budget.
- **Calendar reminders** – **📅 Add birthdays to my calendar** downloads a calendar file with everyone's birthday repeating every year and a reminder a week before. Open it on your phone to add them to your calendar (download it again after adding new people).
- **Backup** – everything is saved on the device. **Export data** saves a backup file and **Import data** restores it (for example on a new phone).

- **Years** – the year at the top (this year when the app opens) applies to every tab: each year has its own presents, cards, budgets and spending. Use ‹ › to look back at past years or plan ahead, and **Back to this year** to return. Budgets carry on to later years until you change them; changing a past year's budget only changes that year. **To sort** and the red counts on the tabs are always about what's coming up now.

## Running it

There's no build step. Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Installing it on your phone

It's an installable web app: once installed it opens full screen from your home screen and works offline.

1. Host it with GitHub Pages: in the repo go to **Settings → Pages**, choose **Deploy from a branch**, pick `main` and `/ (root)`, and save. After a minute you get a link like `https://<username>.github.io/present-planner/`.
2. Open that link on your phone:
   - **iPhone (Safari):** tap the Share button, then **Add to Home Screen**.
   - **Android (Chrome):** tap the ⋮ menu, then **Install app** (or **Add to Home screen**).

Deleting the app from your home screen also deletes its saved data, so export a backup first.
