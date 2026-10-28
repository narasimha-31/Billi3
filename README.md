# Billie

[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

Open source under the MIT License. Free to use, change and share.

Billie reads your grocery receipts and remembers every price you paid, store by store. It shows where the same item costs less, when a price goes up, and when food you bought is recalled.

**Try it live, no sign-in:** [billi3.vercel.app/demo](https://billi3.vercel.app/demo)

![Billie on a laptop](screenshots/landing.jpg)

## What it does

- **Reads any receipt.** Snap a photo or upload a PDF. Every line is read, named in plain words and checked against the printed total. The photo is deleted once it is read, unless you choose to keep it.
- **Remembers every price.** Pick an item and see what you paid, where, and how the price moved.
- **Finds the cheaper store.** Your stores on a map, with the cheapest one near you for each item.
- **Catches price rises** on your own receipts, the day they happen.
- **Matches food recalls** from the FDA to what you actually bought.
- **Suggests something healthy** you don't buy yet, from trusted nutrition sites, and keeps shopping lists and a monthly budget.

![Home on a laptop](screenshots/home.jpg)

## Try it without signing in

Judges and visitors can open a guest session from the landing page. It starts with a sample shopper's 7 receipts, so every page is full right away, and you can add a receipt of your own to watch it being read for real.

- Each guest gets 10 receipt reads. All guests share a small daily budget of their own, so the app can't be drained.
- Each receipt says which model read it.
- Everything a guest adds is deleted 3 hours after the session starts, or right away with End session.

<p>
  <img src="screenshots/home-phone.jpg" alt="Home on a phone" width="260">
  <img src="screenshots/store-picker.jpg" alt="Picking the store's branch on a phone" width="260">
</p>

## How a receipt is read

1. The photo is checked for size and sharpness before anything is spent.
2. A vision model reads every line, the store, the date and the totals.
3. The lines are added up and checked against the subtotal and total. A receipt that doesn't add up is marked for a quick look.
4. NVIDIA Nemotron 3 Super turns each printed line into a plain product name and an aisle: "GV WHL MLK GAL" becomes "Whole milk, 1 gal".
5. The same product from different stores is grouped together, so prices can be compared.
6. The photo is deleted, unless the shopper chose to keep photos. The items, prices, store and date are kept.

![A receipt read line by line](screenshots/receipt-read.jpg)

## How we use NVIDIA Nemotron

Every model call goes through Nebius Token Factory at runtime.

| Model | What it does in Billie |
| --- | --- |
| Nemotron 3 Super | Names every receipt line and picks its aisle. Also picks healthy foods out of nutrition pages. |
| Nemotron 3.5 Super VL | Backup receipt reader. It takes over when the main reader is slow or down, and reads a receipt a second time when the printed item count doesn't match. |
| Kimi K2.7 | Main receipt reader (why below). |
| Qwen3 Embedding 8B and Qwen 3.8 | Group the same product across stores, and judge close calls. |

In our call log, Nemotron 3 Super named items 99 times with 98 good answers and a median of 1.5 seconds. Nemotron 3.5 Super VL read 47 receipts with 46 good answers and a median of 1.9 seconds.

### Why Kimi K2.7 reads the receipts

We picked the reader with a bake-off, not by name. We first tried 27 models from the Token Factory catalog on real receipts, then ran the best four on three real, crumpled receipts, three times each (129 printed lines in total):

| Model | Printed lines found | Made-up lines | Median time |
| --- | --- | --- | --- |
| Kimi K2.7 | 129 of 129 | 0 | 4.5 s |
| Kimi K3 | 125 of 129 | 4 | 2.7 s |
| Nemotron 3.5 Super VL | 114 of 129 | 6 | 3.9 s |
| Qwen 3.8 | 106 of 129 | 23 | 3.8 s |

A missed or made-up line means a wrong price, so the most accurate reader won. Nemotron 3.5 Super VL found 114 of 129 at under a third of Kimi K2.7's price, so it is the backup.

We did the same for grouping products. On 83 product pairs checked by hand, Qwen 3.8 never merged two different products in three runs. Nemotron 3 Super merged three wrong pairs each run, "Frozen peas" with "Peas" among them. A wrong merge spoils every price comparison after it, so Qwen judges and Nemotron names.

## Where Token Factory sped us up

- **One API for every model.** Trying a new model is a one-line change, so we compared 27 vision models and 24 judge models with the same code, on the same real receipts.
- **Real costs per call.** Every call is logged with its tokens and price. Building and testing the whole app, bake-offs included, has cost $2.47 of Token Factory credit so far, by our call log.
- **Falling back is easy.** When the main reader times out, the backup is the same API with another model name, so a slow model never leaves a receipt unread.

We used Token Factory only. The app is hosted on Vercel and Supabase free tiers, so Nebius AI Cloud was not needed.

## How we use Tavily

- Once a day, a search of the past week on fda.gov finds new food recalls. They are matched to each shopper's receipts on our own server, so nothing about anyone is sent out.
- Once a day, a search on trusted nutrition sites (Harvard, the American Heart Association, NIH and others) finds healthy foods to suggest.
- When a small shop is missing from OpenStreetMap, its address is looked up on the web, so the shopper can pick it instead of typing it.

Billie has made 81 Tavily searches so far.

## How we tested it

- **295 automated tests** for the money math, receipt checks, budgets, limits and parsing.
- **50 database security tests.** Each shopper's receipts are locked to their account in the database itself.
- **AI evals on real, crumpled receipts**, the far-away photo, and PDFs, through the same code path the app uses.
- **Playwright scripts** that click through the app at phone and laptop sizes and check what changed: uploads, the map, guest sessions, the store picker, and scrolling the landing page.
- **An attack pass on the live app.** A second account could not read, change or delete anyone else's receipts, stores, lists, settings or photos, through the pages or the database API. Forms posted from other sites are refused. Receipt lines written as attacks were skipped, never obeyed.

## Run it yourself

You need Node 22 or newer, a Supabase project with Google sign-in turned on, a Nebius Token Factory key and a Tavily key.

```
git clone https://github.com/narasimha-31/BillBuddy.git
cd BillBuddy
npm install
```

Copy the example environment file and fill in:

| Variable | Where it comes from |
| --- | --- |
| `PUBLIC_SUPABASE_URL` | Supabase project settings |
| `PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase API keys (publishable) |
| `SUPABASE_SECRET_KEY` | Supabase API keys (secret) |
| `SUPABASE_DB_URL` | Supabase database connection string |
| `NEBIUS_API_KEY` | Nebius Token Factory |
| `TAVILY_API_KEY` | Tavily |
| `CRON_SECRET` | Any long random text; the daily job sends it |

Then set up the database and start the app:

```
npm run db:push
npm run dev
```

Other commands:

```
npm test          # the automated tests
npm run test:db   # the database security tests (uses your Supabase project)
npm run eval:ai   # the AI evals (spends a few cents of credit)
```

To deploy, import the repository on Vercel and add the same variables. The daily job for recalls and healthy foods runs on its own once a day.

## Built with

SvelteKit, Supabase, Vercel, Nebius Token Factory, Tavily, OpenStreetMap with Leaflet and Photon, and the US Census geocoder.
