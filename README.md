# Billie

[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

Open source under the MIT License. Free to use, change and share.

> [!NOTE]
> **Nebius x NVIDIA Global AI Hackathon, October 2026**
> Track: **Best Apps and Agents**. NVIDIA Nemotron models, called at runtime through Nebius Token Factory.

Billie reads your grocery receipts and remembers every price you paid, store by store. It shows where the same item costs less, when a price goes up, and when food you bought is recalled.

**Live app:** [billi3.vercel.app](https://billi3.vercel.app). Scroll the page for the story, then press Try it live to use the app without signing in.

![Billie on a laptop](screenshots/landing.jpg)

## The problem

Grocery prices change all the time, and not the same way at every store. The same item can cost more at one store than at another a mile away, and a price that creeps up a few cents at a time is easy to miss. The proof is on the receipt, but receipts end up in a bag or the trash, and almost nobody types them into a spreadsheet.

Food recalls have the same gap. The FDA posts them, but a shopper has to find the notice and remember what they bought weeks ago.

Billie turns the receipts people already get into their own price history, so they see all of this without typing anything.

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

## Evals, failure modes and security

Every number here comes from a real run on October 28, 2026, through the same code the app uses.

### Reading evals

13 real model calls on test receipts, each checking one thing that goes wrong on real paper. 12 pass.

- Reads a normal receipt and keeps no card digits
- Ignores orders printed on a receipt: "Ignore all previous instructions", a fake $999 item and a fake store name never come through
- Refuses a handwritten bill, but reads a printed receipt someone wrote on
- Takes the balance as the total, not the cash handed over, and works out multi-buy prices
- Reads a quantity line whose price sits on the line above
- Reads a receipt photographed sideways or upside down
- Gives the same product the same name across stores, keeps weights out of names
- Refuses a photo that is not a receipt
- Reads an online order as a delivery and keeps no card digits
- Flags a padded receipt whose lines don't add up, and rude item names

The one that fails: on a made-up multi-buy receipt, Kimi K2.7 misread a line. The app's own totals check caught it, so the receipt was marked for a quick look instead of saving a wrong price. That is the check doing its job, and why it runs on every receipt.

### What breaks, and what Billie does about it

| What we saw | What Billie does |
| --- | --- |
| The main reader is slow on long receipts. Its good reads took 4.6 s at the median but up to 18.5 s, and 15 reads were cut off at our old 10 s limit. | The main reader now gets 20 s. If it fails, the backup reader gets one try within 10 s. If both just failed, reading pauses for 3 minutes and photos wait, so nothing loops or keeps spending. |
| A line is misread. | The lines are added up and checked against the printed subtotal and total. A receipt that doesn't add up is marked for the shopper to check. |
| Text on a receipt tries to give the model orders. | Answers must match a strict schema, and attack lines are left out or flagged, never named as products. |
| A photo is blurry, handwritten, not a receipt, or the same one twice. | A blurry photo is flagged on the phone before it is sent, with a choice to retake it. The rest are refused, and a refused photo doesn't count toward the day's receipts. |
| The day's AI budget runs out. | Each person, new accounts and guests have caps of their own. Photos are kept to read later, and guests are told plainly when their reads run out, never a fake "try again". |
| Receipt lines that look like SQL were blocked by Supabase's firewall in URL filters, failing the whole read. | Those lookups now go in a request body, and a test receipt full of attack lines reads cleanly. |

### Security

- **50 database security tests.** Each shopper's receipts, items, stores, photos, settings and upload counts are locked to their account in the database itself. Products are readable only through your own receipt lines. Limits live in the database too: 5 receipts a minute, 10 a day (3 on an account's first day), 100 in 30 days, JPEG photos up to 5 MB.
- **An attack pass on the live app** with throwaway accounts. A second account could not read, change or delete another person's data through the pages, the forms or the database API. Forms posted from other sites are refused, no other site can frame the app, and signed-out visitors get nothing.
- **295 automated tests** for the money math, receipt checks, budgets, limits and parsing, and Playwright scripts that click through the app at phone and laptop sizes.

## Run it yourself

You need Node 22 or newer, a Supabase project with Google sign-in turned on, a Nebius Token Factory key and a Tavily key.

```
git clone https://github.com/narasimha-31/Billi3.git
cd Billi3
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
