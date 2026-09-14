# ViewCash Monetag setup

The Watch Ads flow uses Monetag Rewarded Interstitials and credits coins only from a server-confirmed `valued` postback.

## Vercel environment variables

Set these before the next deployment:

- `NEXT_PUBLIC_MONETAG_ZONE_ID` = the Monetag Telegram Mini App zone ID
- `MONETAG_POSTBACK_SECRET` = a long random secret created for ViewCash
- `SUPABASE_SERVICE_ROLE_KEY` = existing ViewCash server secret
- `TELEGRAM_BOT_TOKEN` = existing ViewCash bot token

Never expose `SUPABASE_SERVICE_ROLE_KEY` or `MONETAG_POSTBACK_SECRET` in client code.

## Monetag postback URL

Configure the rewarded postback URL as:

`https://viewcash-olive.vercel.app/api/ads/postback?token=YOUR_MONETAG_POSTBACK_SECRET&event_type={event_type}&ymid={ymid}&zone_id={zone_id}&sub_zone_id={sub_zone_id}&request_var={request_var}&telegram_id={telegram_id}&reward_event_type={reward_event_type}&estimated_price={estimated_price}`

The backend only rewards:

- `event_type=impression`
- `reward_event_type=valued`
- a valid ViewCash ad session
- an active, activated ViewCash user
- a matching Telegram ID when Monetag provides it
- a unique event key

`non_valued`, click events, duplicate events, unknown sessions, and inactive users do not receive coins.

## Current default reward

The Supabase `ad_reward_coins` setting was created with `100` coins. Change it from the admin/settings system later when the desired economics are finalized.

## Deployment policy

Do not deploy this branch yet. Review all Monetag code, add the real zone ID and postback secret, then deploy once and test the complete Telegram flow.
