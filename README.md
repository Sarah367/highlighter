# Highlighter

**Fan contests, without the inbox chaos.**

- **Live demo:** https://highlighter-f3f71.web.app
- **Demo video:** https://www.youtube.com/watch?v=MKTptRrgCoU

Built for the PayPal AI Hackathon by Sarah Agnihotri.

Why did I choose to do fan contests? Because I have seen plenty of youtubers run fan contests - from seeing big creators run viral roast challenges, to seeing regular, ordinary podcasters run compilation contests. I have seen creators run them regularly, and one thing that always sticks out to me is that they ask their fans to “submit their entries to the email listed in the description below.” Email inboxes were designed to hold direct digital correspondence - emphasis on “direct” because it usually assumes communication between two parties.
An email inbox flooded with thousands of entries is unbelievably exhausting to look through, especially considering the amount of wasted time that comes from junk/duplicate/illegitimate entries.

Adding onto that, a lot of creators today are concerned with fans taking their words out of context, especially for those who have a young/impressionable audience. Youtube creators, in particular, are prone to have their words turned into something they may have never said. While it’s impossible to avoid out-of-context clips that are thrown into the media’s “void”, it is possible to help creators flag out-of-context submissions to their hosted contests!

## So what does Highlighter aim to do?

When a user first opens the website, they are met with the home page designated specifically for new users. The application can be explained in 5 steps:

1. Creators create a contest, in which they fill out a form that allows them to choose from a preset (compilation, roast, music video) or from scratch. They must also fill in the title and brief of the contest. Minimum and maximum length of the entries can be entered, along with the maximum amount of entries permitted per fan, source material (whether clips must come from the creator’s episodes or not), and an optional fake quote check.
    1. The form is filled out and creators must fund the prize pool upfront with PayPal. This is a deliberate design decision, in order to prevent creators with malicious intentions from delaying or flat-out refusing to pay their fans, and thus stealing their fan’s creativity.
    2. Once the contest is funded with PayPal, it’s now publicly available.
2. Fans enter contests. They can also choose to search through a creator’s episodes, which are transcribed with Deepgram.
    1. Fans can enter without an account, with just a name and PayPal email. That being said, if a fan had an account, their details are filled in automatically for every new contest they enter. They are also provided with a “My Entries” page, which lists all of their entries, including wins and payment status.
3. AI pre-screens fan entries and stamps flagged entries with a reason as to why the entry was flagged and - if traced back to the original episode(s) of the creator - gives the exact timestamps of where it believes the fan’s clip was taken from.
4. A Naive Bayes model also learns from the creator’s own decisions (creator must have 5 or more decisions in order for the model to have data), and guesses how the creator would decide on the rest of the entries. For example, an entry may be tagged as “Likely shortlist (78%)”. This provides creators with the confidence that they are making the right decision.
5. Once the contest is closed, the creator picks winners, and PayPal pays them all at once through a batch payout. If there are fewer prizes than what was set, the creator is refunded the amount.

## Architecture?

- For the client side, I chose to use React (Vite) and react Router, deployed on Firebase Hosting. Every page has its own address, including episode timestamps (?t=41, which indicates 41 seconds into the episode).
- For the server, I chose Node.js and Express, deployed on Render. All contest, entry, validation, screening, and payment logic lives here!
- In terms of storing data, I chose Firestore for contests, entries, episodes, and profiles. I chose Firebase Storage for video and audio files. Since Firestore has a 1 MB document limit, an entry’s full transcript is stored as a JSON file in Storage, with a summary in Firestore that points directly to its file in Storage.

## How does it use PayPal?

- The creator funds the whole prize pool up front with PayPal’s Orders API. The server creates and captures the order, and if all validation checks are passed, the contest is opened.
- Once a contest is closed, PayPal’s Payouts API is used to pay every winner in one batch payout, to the PayPal email on their entry, and tracks each payment status (Paid, Unclaimed, Failed, Pending, etc.).
- Unused prize money is refunded to the creator from the original payment, automatically, when winners are paid.

## How is AI used?

- Deepgram (Nova-3) is used to transcribe every episode and every entry with word-level timings. Deepgram only provides the transcript; Google Gemini is responsible for judging the meaning of this transcript. We then trace and try to match the entry back to the creator’s episodes with plain text matching, creating matching “pieces” as we go. We know that a video is a complete copy of a creator’s original video (with no edits or cuts) because it will simply be one long continuous piece.

  We can calculate - with the help of Deepgram’s transcript - where the beginning and end of a sentence is (using punctuation such as knowing that a period indicates the end of a sentence). We want the whole sentence of every piece, calculating where it came from, what the surrounding words were (full sentence), and whether it runs straight into the next piece, which indicates the absence of a cut in the video.

  We do a lot of calculation before we send our prompt to Gemini.

  A really interesting model that I learned recently is the Naive Bayes classifier, which I used for my “Likely Reject (x%)” or “Likely Shortlist (x%)” feature. This is a small classifier written from scratch that learns each creator’s shortlist and reject decisions and predicts how they’d decide on new entries.

    - An entry is seen by the classifier as having these 6 prominent flags/features:
        - Context flag - the video takes a creator’s words out of context.
        - High-context flag - the video takes a creator’s words out of context in an extreme sense
        - Source flag - If a creator only allows fans to use clips from their original episodes, then a fan whose entry does not use a creator’s episodes is flagged.
        - Duplicate flag - The entry was submitted before (using an MD5 hash, which is essentially the “fingerprint” of a file. Two duplicate files will thus have the same fingerprint).
        - Brief flag - The entry does not fit the brief.
        - Traced flag - The entry mostly matches the creator’s episodes (above 80%).
    - We assume that features are independent of each other. In reality, it is rare for features to be completely independent of each other, as things are usually connected/influence each other. But with very little actual data in this case, it is fine to assume things are independent.
    - If we have five or more entries, we count how many of each feature we have for both shortlisted and rejected entries. For example, there are 20 shortlisted entries total and 5 of those entries are duplicates. Thus, 5/20 is converted to 25% of entries being duplicates. Since we later need to multiply each feature’s percentage together, we cannot simply claim 0 of any feature - even if there were 0 duplicate entries - since 0 multiplied by anything is 0. We use Laplace smoothing, which adds 1 to the feature count and 2 to the overall count. We tally up the counts of each feature for shortlist and reject. For example, a shortlist could have 1 context-high flag, 6 context flags, 0 source flags, 0 duplicate flags, 2 brief flags, and 1 traced flag.
    - When we have 5 or more decisions, we are ready to use our model. Then, we predict how likely the creator is to shortlist/reject an entry based on the counts we calculated up above.
    - Then, we build two scores: the shortlist and rejected score. The shortlist score multiples how often the creator shortlists at all by each feature’s percentage amongst shortlisted entries, and multiplies it to the shortlist score (or the percentage without it, if the entry doesn’t have that feature).

For example, the probability of a creator shortlisting is 60 shortlists out of 100 total entries. Each feature’s percentage amongst shortlisted entries is:
{context: 5%, context-high: 4%, source: 10%, duplicate: 20%, brief: 80%, traced: 12%}.

Calculation:

```
(60/100) * (0.05) = 0.03
0.03 * (0.04) = 0.0012
0.0012 * (0.10) = 0.00012
0.00012 * (0.20) = 0.000024
0.000024 * (0.80) = 0.0000192
0.0000192 * (0.12) = 0.000002304
```

Shortlist score ≈ 0.0000023

The same is done for the rejected score. Dividing the shortlist score by the total of both (shortlist score + rejected score) gives us the final percentage. Since multiplying many small numbers can round down to zero, however, we use logarithms instead, which is mathematically the same.

```
0.0000023 / (0.0000023 + 0.014) = 0.000164, or about 0.016%.
```

So the creator is only 0.016% likely to shortlist this entry, and 99.98% likely to reject it, and the model shows “Likely reject (99.98%).

To show why it leans one way, the model compares each feature’s two percentages by dividing them. For example, if duplicates appear in 13% of rejected entries but only 5% of shortlisted ones, they’re 2.6 times as common among rejects, a strong reason to reject. Only features at least 1.5 times as common on one side get named as reasons (up to two, and never two about the same thing, like the context and high-risk context flags). Weaker features still count toward the percentage, but with only a few decisions, they might just be coincidence.

A test script runs 10 checks on the classifier, including Laplace smoothing, weak coincidences not being named as reasons, and entries with no screening data. All 10 pass.

## The screening pipeline

Every entry goes through four steps, shown live on the review screen:

- **Transcribing:** Deepgram transcribes the entry with word-level timings.
- **Tracing sources:** each stretch of the entry is matched back to the exact moment in the creator's episodes it came from, using the longest matching runs of words.
- **Checking context:** Gemini reviews each traced piece against the full marked-up transcript around it, including whether pieces were spliced together to change the meaning. This is what catches "I hate my fans."
- **Final checks:** exact duplicates (file fingerprints), near-copies (ordered word similarity of 90% or more), brief fit, and length.

## Paying winners safely

Money can't be taken back once it's sent, so paying winners is built to be safe to retry:

- A Firestore transaction claims the contest first (status "paying"), so two clicks at the same moment can't both pay.
- A budget check: the winners' prizes plus the refund must exactly equal the funded prize pool.
- The refund runs first, with a `PayPal-Request-Id`, so a retry returns the original refund instead of refunding twice.
- The payout runs last, with a unique `sender_batch_id` per contest, which PayPal refuses to process twice. If anything fails, no winner has been paid yet, so the creator can simply click Pay again.

## Accounts and security

- Firebase Authentication with roles: accounts are required for creators and optional for fans.
- The server verifies a Firebase ID token on every creator request, then checks the creator owns the contest, episode, or entry. Someone else's contest gets the same "No contest with that ID" as one that doesn't exist, so IDs can't be discovered by guessing.
- Firebase security rules cover what the browser touches directly: anyone can read episodes, only a signed-in creator can create one (as its owner), uploads go into each creator's own folder, and contests and entries are only reachable through the server.
- Creators can't enter their own contests.

## Try it!

Open https://highlighter-f3f71.web.app. Everything runs in PayPal's sandbox, so no real money moves.

- **Demo creator account:** `demo123@gmail.com` / `Cookie123!` (a contest is already running, with screened entries)
- **PayPal sandbox buyer (to fund a contest):** `sb-yzfr853854886@personal.example.com` / `8"$Cf7E%`
- **To enter as a fan:** open any contest from Browse contests. No account needed.

> **Note:** the server runs on Render's free tier, which sleeps after about 15 minutes without visitors. The first request afterward can take up to a minute while it wakes up.

## Run it locally

You'll need: Node.js 20+, a Firebase project (Firestore, Storage, and Authentication with Email/Password turned on), a PayPal Developer sandbox app, a Deepgram API key, and a Gemini API key.

**1. Clone and install**

```bash
git clone https://github.com/Sarah367/highlighter.git
cd highlighter
cd server && npm install
cd ../client && npm install
```

**2. Add your keys** (see `.env.example`)

- `server/.env`: `FIREBASE_STORAGE_BUCKET`, `FIRESTORE_DATABASE_ID`, `DEEPGRAM_API_KEY`, `GEMINI_API_KEY`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`
- `server/serviceAccountKey.json`: your Firebase service account key (Project settings → Service accounts → Generate new private key). Never commit it.
- `client/.env.local`: your Firebase web config (`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`) and `VITE_PAYPAL_CLIENT_ID`

**3. Run both**

```bash
# terminal 1
cd server
npm run dev         # http://localhost:3001

# terminal 2
cd client
npm run dev         # http://localhost:5173
```

**4.** Set up Firebase's rules for Firestore and Storage in the Firebase console, as described in [Accounts and security](#accounts-and-security).

### Tests and scripts

```bash
cd server
node --env-file=.env scripts/test-screening.mjs                  # the screening regression test
node --env-file=.env scripts/assign-owner.mjs you@example.com    # one time: give older contests and episodes an owner

cd ../client
node scripts/test-taste.mjs                                      # the Naive Bayes classifier's tests
```

**Deploying:** the server deploys to Render from `main` (root directory `server`, start command `npm start`, with the same keys as environment variables, plus `FIREBASE_SERVICE_ACCOUNT` holding the key file's contents, and `CLIENT_ORIGIN` set to the app's address). The app deploys with `npm run build` in `client`, then `firebase deploy --only hosting`, with `VITE_API_URL` in `client/.env.production`.

## Key decisions

- **AI flags, the creator decides.** Screening never rejects an entry or picks a winner on its own.
- **Prizes are funded up front.** Fans risk their creative work, so creators risk their money, with refunds protecting both: unused places are refunded, and places are filled in order without skipping.
- **Only flagged and rejected entries are disqualified.** An entry the creator rejects for taste, with no flag, stays in good standing, since taste isn't a rule violation.
- **A contest's "closed" status is worked out from its deadline,** not stored, so it can never fall out of sync.
- **Accounts are optional for fans,** so entering a contest stays easy.

## Known limitations and next steps

- **Retrying one winner's failed payment:** if PayPal accepts a payout but one winner's payment fails (for example, if their entry used the platform's own PayPal account), the creator sees it marked Failed, but can't yet resend just that payment from the app. Next: a Retry button for failed payments, plus a warning when an entry's PayPal email is the platform's own account.
- **The entry limit is per PayPal email for signed-out fans,** so a determined fan could enter twice with two emails. Signed-in fans are limited per account too, and duplicate detection and the creator's review help catch the rest.
- **Your taste learns per contest,** from a handful of decisions. With more data, it could learn across all of a creator's contests, or use a model like logistic regression, which handles connected features (like the two context flags) better.
- **Search by creator:** creator profiles, so fans can find contests by the creators they follow.
- **Sandbox only:** payments run in PayPal's sandbox.

## License

MIT
