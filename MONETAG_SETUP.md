# ViewCash Monetag setup

The Watch Ads flow uses Monetag Rewarded Interstitials and credits coins only from a server-confirmed `valued` postback.

## Vercel environment variables

Set these before deployment:

- `NEXT_PUBLIC_MONETAG_ZONE_ID` = `11801942` (the code also has this zone as a safe fallback)
- `SUPABASE_SERVICE_ROLE_KEY` = existing ViewCash server secret
- `TELEGRAM_BOT_TOKEN` = existing ViewCash bot token

`MONETAG_POSTBACK_SECRET` is not required by the current Monetag postback route because the Monetag postback screen does not provide a custom token field. It may remain in Vercel unused.

Never expose `SUPABASE_SERVICE_ROLE_KEY` or any server secret in client code.

## Monetag postback URL

Configure the rewarded postback URL as:

`https://viewcash-olive.vercel.app/api/ads/postback?ymid={ymid}&zone_id={zone_id}&sub_zone_id={sub_zone_id}&request_var={request_var}&telegram_id={telegram_id}&event_type={event_type}&reward_event_type={reward_event_type}&estimated_price={estimated_price}`

The backend only rewards:

- `event_type=impression`
- `reward_event_type=valued`
- a valid ViewCash ad session matching both `ymid` and `request_var`
- the correct Monetag zone
- an active, activated ViewCash user
- a matching Telegram ID when Monetag provides it
- a session that is not older than 15 minutes
- a unique event key

`non_valued`, click events, expired sessions, duplicate events, unknown sessions, and inactive users do not receive coins.

## Reward amount

The setting key is `ad_reward_coins`.

Current value: **100 coins per valid rewarded ad event**.

The amount is controlled from the Supabase `settings` table so it can be changed later without changing the postback logic.

## Deployment policy

Do not deploy until the full Monetag flow has been reviewed. The final code changes should be deployed together once, then tested from Telegram: Watch Ad → Monetag → postback → wallet credit.
