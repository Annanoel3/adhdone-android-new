# ADHDone easter eggs

Every hidden thing in the app, what triggers it, and where the code lives.
None of these change what the app actually does — they're rewards and surprises only.

## Hold / tap / gesture

| Egg | How to trigger | What happens | Code |
|---|---|---|---|
| Attention fact | Press and HOLD the "ADHDone" title in the header for 3 seconds (tapping does nothing) | A dialog with one fact about attention; hold again for another | `src/components/eastereggs/LongPressBrandTitle.jsx`, `attentionFacts.js` |
| Chaos mode | Tap the version line at the bottom of Settings 7 times | Deliberately loud static theme for this session only; 7 more taps turns it off, so does closing the app | `src/components/settings/VersionTap.jsx`, `src/components/eastereggs/chaosMode.js`, `ChaosModeStyles.jsx` |
| Over-pull refresh | On Home or Tasks, pull down well past the refresh point (~115px) | Badge: "That's plenty. It's refreshed. / Go sit down." — plus the normal refresh | `src/components/shared/PullToRefresh.jsx` |
| Weekly hidden star | A tiny emoji appears in ONE of 4 spots on a page; which spot rotates every week | Tapping it fires the celebration / "too many ideas" GIF popup | `src/components/shared/WeeklyEgg.jsx`, `src/components/tasks/WeeklyStar.jsx` |

## Task completion

| Egg | How to trigger | What happens | Code |
|---|---|---|---|
| Archaeology | Complete a task you created yourself 30+ days ago (not events, birthdays, imported items, subtasks) | Badge: "N days. And then you just did it." | `src/components/eastereggs/completionEggs.js` |
| Goblin hours | Complete anything between 1:00 and 4:00 AM local (once per night) | Badge: "The goblin hours. Logged." | `src/components/eastereggs/completionEggs.js` |
| Chore cat | Complete a chore-ish task — laundry, dishes, vacuum, clean, trash, fold, tidy, etc. | Badge with the tuxedo cat riding the robot vacuum | `src/components/eastereggs/choreEggs.js` |
| Five in one day | Finish 5 tasks in a single local day (any tasks) | Badge with the vacuum guy: "Five done today. Five." | `src/components/eastereggs/choreEggs.js` |
| Every 5th completion | Every 5th real completion, counted cumulatively across days (device-persisted) | Full-screen celebration GIF popup | `src/components/utils/completionMilestone.js`, `src/components/shared/EasterEggVideo.jsx` |

## Page-specific

| Egg | How to trigger | What happens | Code |
|---|---|---|---|
| "It's a system!" crew | Have 10+ ideas in the Parking Lot | Two people pop up at the bottom-left with an "It's a system!" bubble, then duck back down; loops | `src/components/parkinglot/RaccoonPeek.jsx` |
| Black cat sticker | Open the Diary sticker picker on the 13th of any month | A black cat sticker appears in the library, that day only | `src/components/diary/stickerLibrary.js` |
| Too many ideas GIF | Certain Parking Lot actions / the weekly star | Rotating "brain overload" GIF popup, cycles the whole list before repeating | `src/components/shared/EasterEggVideo.jsx` |

## Ground rules for adding more

- Reward genuine ADHD behavior (late-night doing, long-carried tasks, giant idea piles). Never punish or judge input.
- No flashing, jitter, or motion-heavy effects (a jitter variant once caused a seizure-like effect and was removed).
- Badges use the one shared card: `showEggBadge({ emoji, title, body, gif })` → rendered by `<EggBadge />` in the layout.
- Never let an egg interfere with the real action (completion, refresh, save) it rides on.
- Emojis render in full color; stay warm and funny, never productivity-shaming.