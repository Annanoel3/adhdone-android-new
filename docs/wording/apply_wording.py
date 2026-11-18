# Wording pass, Nov 18 2026. Rows 1-43 and patterns P1-P7 of the doc
# "ADHDone wording pass", with Anna's change: who reads feedback is
# "Anna, the developer". Kept as the record of every line that changed.
# Run from the app root:
#   python3 docs/wording/apply_wording.py --dry   (check every line is found, change nothing)
#   python3 docs/wording/apply_wording.py         (write)
# It has been run once; a second run finds nothing and stops.
import re, sys, io

DRY = '--dry' in sys.argv
EDITS = []  # (path, old, new, count, is_regex)

def E(path, old, new, n=1):
    EDITS.append((path, old, new, n, False))

def R(path, old, new, n=1):
    EDITS.append((path, old, new, n, True))

C = 'src/components/'
P = 'src/pages/'

# ---------------- Reminders and alarms (rows 1-14) ----------------
E(C + 'shared/AppGuideModal.jsx',
  'An alarm rings full screen, even on silent, until you deal with it.',
  'An alarm takes over the screen and rings for a minute.')
E(C + 'settings/QuickCaptureCard.jsx',
  'On: full screen and loud, even on silent. Off: a regular notification. Same reminder times either way.',
  'On: full screen with sound. Off: a regular notification. The times are the same either way.')
QCP = C + 'shared/QuickCapturePrompt.jsx'
E(QCP,
  '>Rings out loud and takes over the screen, even locked, until you answer it.</p>',
  '>Takes over the screen, even when locked, and rings for a minute.</p>')
E(QCP,
  'Rings out loud and takes over the screen, even locked, until you answer it. Rings even on silent or Do Not Disturb{alarmQuietChoiceSupported()',
  'Takes over the screen, even when locked, and rings for a minute, even on silent or Do Not Disturb{alarmQuietChoiceSupported()')
E(QCP,
  'A reminder can now ring like an alarm clock, full screen and out loud, until you answer it.',
  'A reminder can now ring like an alarm clock: full screen, with sound, for a minute.')
E(QCP,
  'This is how a reminder rings as a full-screen alarm: over your lock screen, at alarm volume, even on silent or Do Not Disturb.',
  "This is a full-screen alarm: over your lock screen, at alarm volume.{alarmQuietChoiceSupported() ? ' Next you choose when it stays quiet.' : ''}")
TDM = C + 'tasks/TaskDetailsModal.jsx'
E(TDM,
  'description: "AI will decide when to nudge you about this task."',
  'description: "Smart Reminders picks when to remind you about this."')
RTS = C + 'tasks/ReminderTypeSelector.jsx'
E(RTS,
  'The app decides when and how often to nudge you. Best for tasks with no set time.',
  "Smart Reminders picks when and how often to remind you. Best when there's no set time.")
E(RTS,
  'A fixed schedule (every 10 minutes, every hour…). Only when you want the same nudge over and over.',
  'The same reminder on a fixed schedule, like every hour. Only for when you want it over and over.')
E(C + 'tasks/SmartDueDatePill.jsx',
  'Smart reminders keep deciding when to nudge you — this is just the day it needs to be done by.',
  'This is the day it needs to be done by. Smart Reminders still picks when to remind you.')
E(C + 'tasks/PriorityPickerDialog.jsx',
  "Pick a priority — the app's smart reminders will handle the rest:",
  'Pick a priority. Smart Reminders handles the rest.')
E(TDM,
  "'Reminders continue until this date, then switch to overdue reminders.'",
  '"You\'re reminded up to this date. After that, reminders treat it as overdue."')
TC = C + 'tasks/TaskCard.jsx'
E(TC,
  'Reminders continue until this date, then switch to overdue reminders.',
  "You're reminded up to this date. After that, reminders treat it as overdue.")
SET = P + 'Settings.jsx'
E(SET,
  'Silence reminders during set hours (in your timezone)',
  'No reminders during the hours you set.')
FMP = C + 'shared/FocusModePrompt.jsx'
E(FMP, 'your other nudges go', 'your other reminders go', 2)
E(C + 'onboarding/WelcomeChat.jsx',
  "Add your work hours and nudges can stay quiet while you're working.",
  'Add your work hours and reminders can stay quiet while you work.')
E(SET,
  'Add them in Places and nudges can stay quiet while you work.',
  'Add them in Places and reminders can stay quiet while you work.')
E(C + 'shared/AppGuideModal.jsx',
  'and nudges can stay quiet while you work.',
  'and reminders can stay quiet while you work.')

# ---------------- Tasks and the task card (rows 15-30) ----------------
E(P + 'AddTask.jsx',
  'Enter each task and press Enter to add - AI will organize it with smart reminders',
  'Type a task and press Enter. ADHDone sorts it and sets up its reminders.')
E(C + 'addtask/TaskBatchEntry.jsx',
  'Tap the mic and let it flow - say them one at a time or all at once',
  'Tap the mic and say your tasks, one at a time or all at once.')
ASC = C + 'tasks/AddSubTaskCard.jsx'
E(ASC,
  '✨ Feeling overwhelmed? Tap AI to break this task into steps.',
  'Too big to start? Tap AI and it breaks this into steps.')
E(ASC,
  '💡 Tip: Separate multiple steps with commas',
  'To add several steps at once, put commas between them.')
E(C + 'tasks/TaskDecompositionModal.jsx',
  'Analyzing your task and creating ADHD-friendly steps...',
  'Breaking it into steps…')
START = "The day you start on it. It shows on your list every day from then until it's due."
E(TC,
  'Marks this task as "in progress." It shows on each day from the start date through the due date.',
  START)
E(TC,
  "Marks when you started working on this task. It will appear in Today's Tasks from this date through the due date.",
  START)
E(TDM,
  "When you'll start working on this before it's due.",
  START)
E(TC,
  'Event shows on each day from the event date through this date.',
  'It shows on every day from its start through this date.')
E(TC,
  'Set this and the card shows a block of time — "10:00 AM – 6:00 PM".',
  'Add an end time and the card shows the whole stretch, like 10:00 AM – 6:00 PM.')
E(TC, '>📅 Set Specific Date Instead</button>', '>Pick an exact date</button>')
E(TC, '>📅 Set Specific Date</button>', '>Pick an exact date</button>')
E(TDM,
  "description: 'Set the event date & time to generate reminders.'",
  "description: 'Set the date and time and its reminders get booked.'")
E(TDM,
  "You're ready to mark this main task as done.",
  'Every step is checked. You can check off the whole task.')
E(C + 'home/TodaysTasks.jsx',
  "Nothing due today yet, why don't we make a task?",
  'Nothing due today. Want to add something?')
E(C + 'parkinglot/IdeaNotesDialog.jsx',
  'No notes yet. Add one to start elaborating!',
  'No notes yet. Add one to say more about this idea.')
E(C + 'parkinglot/NoteCard.jsx',
  'placeholder="Elaborate on your idea... (select text to format it)"',
  'placeholder="Say more about your idea… (select text to format it)"')
for f in ('birthdays/AddBirthdayForm.jsx', 'birthdays/BirthdaysDialog.jsx'):
    E(C + f, 'hint: "A heads-up the day prior"', 'hint: "A heads-up the day before"')
    E(C + f, 'hint: "A nudge to prep a gift or message"', 'hint: "A reminder to prep a gift or message"')
    E(C + f, "Year doesn't matter — we'll remind you every year.", "Year doesn't matter. You're reminded every year.")
BED = C + 'birthdays/BirthdayEditDialog.jsx'
E(BED,
  'Pre-fills the recipient when sending a birthday text.',
  "Fills in who it's to when you send a birthday text.")
E(C + 'birthdays/BirthdayTextDialog.jsx',
  'Fills in the recipient line when you send.',
  "Fills in who it's to when you send.")

# ---------------- Setup, Settings and the other screens (rows 31-43) ----------------
E(QCP, 'Second, pin a quick-capture shortcut', 'Second, pin a shortcut for adding tasks')
E(C + 'onboarding/PageIntroTour.jsx',
  'Add them in the app or add them without even opening the app!',
  'Add tasks in the app, or from outside it without opening it.')
E(FMP, "No thanks, I'll manage everything at once", 'No thanks')
E(FMP, 'Let it go for now', 'End Focus Mode')
FT = P + 'FocusTimer.jsx'
E(FT,
  '<p>The Pomodoro Technique is a time management method that uses a timer to break work into focused intervals.</p>',
  '<p>Work in short rounds with breaks in between.</p>')
E(FT,
  'This technique helps ADHD brains by creating clear work boundaries and regular breaks to prevent burnout!',
  'A clear end point makes starting easier.')
PRG = P + 'Progress.jsx'
E(PRG,
  'Consider breaking down tasks into smaller steps to boost your completion rate.',
  'Smaller steps are easier to finish. Try breaking one task down.')
# Row 37 says "You're on a streak", so it only shows while there is one (2 days or more).
R(PRG,
  r"""( *)<div className="flex items-start gap-3">\n( *)<div className="w-2 h-2 rounded-full bg-purple-600 mt-2 flex-shrink-0" />\n( *)<p className="text-gray-700">\n( *)Keep building that streak! Consistency is more important than perfection\.\n( *)</p>\n( *)</div>\n""",
  lambda m: (
      f"{m.group(1)}{{insights.currentStreak >= 2 && (\n"
      f"{m.group(1)}  <div className=\"flex items-start gap-3\">\n"
      f"{m.group(2)}  <div className=\"w-2 h-2 rounded-full bg-purple-600 mt-2 flex-shrink-0\" />\n"
      f"{m.group(3)}  <p className=\"text-gray-700\">\n"
      f"{m.group(4)}  You're on a streak. Keep it going.\n"
      f"{m.group(5)}  </p>\n"
      f"{m.group(6)}  </div>\n"
      f"{m.group(1)})}}\n"))
E(PRG,
  "Schedule your most important tasks during your <strong>{insights.bestTime.toLowerCase()}</strong> hours when you're most productive.",
  'You get the most done in the <strong>{insights.bestTime.toLowerCase()}</strong>. Put the important things there.')
# Row 39: the timing records come from the Timer AND Focus Mode (LaunchContext
# logSprintSession, FocusModePrompt), so the line names both.
R(C + 'progress/FocusModeStats.jsx',
  r"No completed Focus Mode sessions yet\. Use Focus Mode on a task to start collecting how\s+long things actually take you\.",
  'Nothing timed yet. Time a task with the Timer or Focus Mode and it shows here.')
R(C + 'progress/ManualFocusTimeDialog.jsx',
  r"Log time you spent on a task — even if you didn't use Focus Mode or the session didn't\s+save\.",
  "Add time you spent on a task, even if you didn't run the Timer or Focus Mode.")
CAL = P + 'Calendar.jsx'
E(CAL, 'title="New calendar integration now in use!"', 'title="Calendars now come straight from your phone"')
E(CAL, 'Please log in to use Calendar sync.', 'Log in to bring in your calendars.')
NOTES = P + 'InstallInstructions.jsx'
E(NOTES, 'No events found from the last two months on.', 'No events from the last two months or coming up.')
E(NOTES,
  'description: "The time shows up here as soon as Google Play finishes it."',
  'description: "Your minutes show up here as soon as Google Play finishes the purchase."')
E(NOTES, "Buying more time isn't available right now.", "Buying more minutes isn't available right now.")
E(QCP, "setNote('Usage access is still off. Switch it on for ADHDone, then try again.')",
  "setNote('The \"Usage access\" switch is still off. Switch it on for ADHDone, then try again.')", 2)
E(SET, "title: 'Usage access is still off'", "title: 'The \"Usage access\" switch is still off'", 2)
SEC = C + 'support/SupportEscalationCard.jsx'
E(SEC,
  'Sent to customer support — replies are usually quick, so keep an eye on your email.',
  "Sent to Anna, the developer. If there's a reply, it comes to your email.")
E(SEC, 'Would you like to send this to customer support?', 'Send this to Anna, the developer?')

# ---------------- P1: one name, "Smart Reminders" / "remind" ----------------
E(C + 'shared/AppGuideModal.jsx', 'keeps your other nudges quiet.', 'keeps your other reminders quiet.')
DEMO_OLD = "When it's time, we'll nudge you just like this."
DEMO_NEW = "When it's time, we'll remind you just like this."
E(QCP, DEMO_OLD, DEMO_NEW)
E(C + 'onboarding/WelcomeChat.jsx', DEMO_OLD, DEMO_NEW)
WQ = C + 'places/WorkQuietCard.jsx'
E(WQ, "Nudges stay quiet while you're on shift;", "Reminders stay quiet while you're on shift;")
E(TDM, "— we'll keep nudging you until then.", "— you'll be reminded until then.", 2)
E(TDM, "— we'll nudge you the night before and that day.", "— you'll be reminded the night before and that day.")
E(TDM, "`We'll remind you an hour before and at ", "`You'll be reminded an hour before and at ")
E(C + 'onboarding/pageIntros.js', 'get a nudge on the day and a draft', 'get a reminder on the day and a draft')
E(C + 'onboarding/catchUpScript.js', 'how hard the app nudges you.', 'how often the app reminds you.')
E(SET, 'whenever it sorts a task, nudges you or writes your notes.', 'whenever it sorts a task, reminds you or writes your notes.')
E(SET, 'breaks one down, nudges you, or writes your notes.', 'breaks one down, reminds you, or writes your notes.')
ABOUT = P + 'About.jsx'
E(ABOUT, 'decides how often to nudge you,', 'decides how often to remind you,')
E(ABOUT, 'and the first nudge of the day is one friendly digest', 'and the first reminder of the day is one friendly digest')
AFG = C + 'utils/appFeatureGuide.js'
E(AFG, '(night-before heads-up + day-of nudges)', '(night-before heads-up + day-of reminders)')
E(AFG,
  'Tasks with no time get intelligent hourly "smart nudges" that surface ONE task at a time with a friendly message instead of flooding the tray.',
  'Tasks with no time get Smart Reminders, which bring up ONE task at a time with a friendly message instead of flooding the tray.')
E(AFG,
  'silence all nudges overnight — if disabled, nudges can run until midnight.',
  'silence all reminders overnight — if disabled, reminders can run until midnight.')
E(AFG, 'drops it out of Today and nudges,', 'drops it out of Today and reminders,')
E(AFG, "a switch that keeps nudges quiet while you're at work", "a switch that keeps reminders quiet while you're at work")
# P2 in the Support Space reference: what the alarm really does.
E(AFG,
  'an alarm rings full screen, even on silent, until they deal with it.',
  'an alarm takes over the screen and rings for a minute, then stops on its own; it sounds even on silent or Do Not Disturb unless they chose vibrate-only in Settings.')

# ---------------- P3: the app says "ADHDone", not "I" or "we" ----------------
# Left as they are on purpose: the welcome chat ("What can we call you?" is
# Anna's own wording, Nov 15 2026), the "Talk to the developer" page where
# Anna speaks as herself, the AI chats (Planner, Support Space), buttons in the
# person's own voice, and the legal pages.
HZ = C + 'shared/HomeZipPrompt.jsx'
E(HZ, "Add your work address and start time, and I'll watch the traffic and tell you when",
  'Add your work address and start time, and ADHDone watches the traffic and tells you when')
E(HZ, 'Drop a circle over your general area and I can tell you when to leave for things,',
  'Drop a circle over your general area and ADHDone can tell you when to leave for things,')
E(QCP, "{offerPin ? 'We need to ask for a couple of permissions' : 'We need to ask for one permission'}",
  "{offerPin ? 'ADHDone needs a couple of permissions' : 'ADHDone needs one permission'}")
E(QCP, "after the first real one rings, we'll ask if you want to keep it.",
  'after the first real one rings, ADHDone asks if you want to keep it.')
E(QCP, 'Going by what you told us, we moved your quiet hours to {hhmmLabel(was.start)} to',
  'Going by what you said, your quiet hours moved to {hhmmLabel(was.start)} to')
E(QCP, "' We filled in times that might suit you better, so change them if they’re off.'",
  "' The times filled in might suit you better, so change them if they’re off.'")
E(QCP, 'temporary bug on our end, not anything you did,', 'temporary bug in ADHDone, not anything you did,')
E(WQ, "so I know when you're off.", "so ADHDone knows when you're off.")
AAO = C + 'tasks/AddAddressOffer.jsx'
E(AAO, 'I time the drive from home{hasWork', 'ADHDone times the drive from home{hasWork')
E(AAO, "Add the address and I'll time when to leave", 'Add the address and ADHDone times when to leave', 2)
E(C + 'tasks/PrepOffer.jsx', "Anything to prep for this? I'll put it in every reminder",
  'Anything to prep for this? It goes in every reminder')
E(C + 'progress/HabitPatterns.jsx', 'Time it and we learn how long it really takes you.',
  'Time it and ADHDone learns how long it really takes you.')
E(BED, "Year doesn't matter — we'll remind you every year.", "Year doesn't matter. You're reminded every year.")
E(BED, "Update the details and we'll keep the yearly reminders going.", 'Update the details and the yearly reminders keep going.')
E(BED, "No message drafted yet — we'll write one for you.", 'No message drafted yet. ADHDone writes one for you.')
E(C + 'birthdays/BirthdayTextDialog.jsx', 'We drafted a birthday text for you.', 'ADHDone drafted a birthday text for you.')
E(C + 'birthdays/BirthdayRelationshipDialog.jsx', 'This helps us write a message that actually sounds right.',
  'This helps ADHDone write a message that actually sounds right.')
PTI = C + 'addtask/PhotoTaskInput.jsx'
E(PTI, "Pick a photo and I'll pull out the date, time, and address for you",
  'Pick a photo and ADHDone pulls out the date, time, and address for you')
E(PTI, "\"I couldn't find an event or task in that photo. Try one that shows the date and time.\"",
  '"No event or task found in that photo. Try one that shows the date and time."')
TCP = C + 'utils/taskCreationPipeline.js'
E(TCP, '"We\'ll wish you a happy birthday on the day, every year."', '"ADHDone wishes you a happy birthday on the day, every year."')
E(TCP, '"We\'ll remind you 1 week before, the day before, and the day of — every year."',
  '"You\'re reminded 1 week before, the day before, and the day of, every year."')
E(SET, '>What we call you</Label>', '>What ADHDone calls you</Label>')
E(P + 'ProfileSettings.jsx', 'placeholder="How should we call you?"', 'placeholder="What should ADHDone call you?"')
E(P + 'ForgotPassword.jsx', 'subtitle="We\'ll send you a link to reset it"', 'subtitle="You\'ll get a link to reset it"')
E(P + 'Register.jsx', 'subtitle={`We sent a code to ${email}`}', 'subtitle={`A code was sent to ${email}`}')
E(P + 'AuthCallback.jsx', 'Just a moment while we set up your session', 'Just a moment while your session is set up')
E(P + 'ReportBug.jsx',
  "We'll automatically include your user info and browser details to help understand the context.",
  'Your user info and browser details are included automatically, to help understand the context.')
E(SEC, '<h2 className="text-xl font-bold text-foreground">I think this was a feature request</h2>',
  '<h2 className="text-xl font-bold text-foreground">This looks like a feature request</h2>')
E(SEC, '\'Sent from the "I think this was a feature request" popup.', '\'Sent from the "This looks like a feature request" popup.')
E(SEC, '<h2 className="text-xl font-bold text-foreground">What can we do better?</h2>',
  '<h2 className="text-xl font-bold text-foreground">What could ADHDone do better?</h2>')
E(SEC, '\'Sent from the "What can we do better?" popup (the one-time feedback ask).\'',
  '\'Sent from the "What could ADHDone do better?" popup (the one-time feedback ask).\'')
E(SEC, '// ── "What can we do better?" ', '// ── "What could ADHDone do better?" (was "What can we do better?" until Nov 18 2026) ')

# ---------------- P4: one sentence ----------------
CHANGE = 'You can change this any time in Settings.'
E(QCP, 'You can change it anytime in Settings.', CHANGE)
E(QCP, 'You can change this anytime in Settings, and every task has its own switch too.',
  'You can change this any time in Settings, and every task has its own switch too.', 2)
E(QCP, 'Either way, you can change this anytime in Settings.', 'Either way, you can change this any time in Settings.')
E(QCP, 'You can change these any time in Settings.', CHANGE)
E(QCP, 'You can change it any time in Settings.', CHANGE, 2)
E(C + 'onboarding/welcomeScript.js', 'You can change it in Settings anytime.', CHANGE)
E(C + 'onboarding/catchUpScript.js', 'You can change it in Settings anytime.', CHANGE, 3)

# ---------------- P5: who reads feedback is "Anna, the developer" ----------------
E(SEC, 'your name and email go to the developer by email.', 'your name and email go to her by email.')
E(SEC, ": 'Send to support'}", ": 'Send to Anna'}")
E(SEC, "This goes straight to the developer. If there's a reply, it'll come to your email.",
  "This goes straight to Anna, the developer. If there's a reply, it comes to your email.")
E(SEC, "Tell us what's missing, confusing, or annoying.", "Tell Anna, the developer, what's missing, confusing, or annoying.")
E(SEC, "The developer will see this. If there's a reply, it'll come to your email.",
  "Anna, the developer, will see this. If there's a reply, it comes to your email.")
E(SEC, 'the developer? You can change the wording first.', 'Anna, the developer? You can change the wording first.')
E(SEC, '<h2 className="text-xl font-bold text-foreground">Want to send this to the developer?</h2>',
  '<h2 className="text-xl font-bold text-foreground">Want to send this to Anna, the developer?</h2>')
E(SEC, '\'Sent from the "send this to the developer?" popup,', '\'Sent from the "send this to Anna, the developer?" popup,')
E(SEC, 'to the developer too? You can change the wording first.', 'to Anna too? You can change the wording first.')
E(C + 'support/ReportResponseButton.jsx',
  'This sends the developer this reply and your one message right before it, so it can be fixed.',
  'This sends Anna, the developer, this reply and your one message right before it, so it can be fixed.')
MA = P + 'MyAccount.jsx'
E(MA, 'How we protect your data', 'How your data is protected')
E(MA, 'Our terms of service', 'The terms of service')
E(MA, 'We Value Your Feedback', 'Your Feedback Matters')
E(MA,
  "Whether you're staying or going, we'd love to hear from you. Your feedback helps us build a better app for everyone with ADHD.",
  "Whether you're staying or going, Anna, the developer, would love to hear from you. Your feedback makes ADHDone better for everyone with ADHD.")
E(MA, 'Your feedback means the world to us. We read every single message.',
  'Your feedback means a lot. Anna, the developer, reads every single message.')
E(MA, "How can we improve? {feedbackType === 'cancellation' && '(We genuinely want to make this better)'}",
  "How can ADHDone improve? {feedbackType === 'cancellation' && '(Anna really does want to make this better)'}")
# Support Space says it the same way when it offers to pass something on.
E(P + 'SupportSpace.jsx',
  'tell them this is worth passing to the developer, then end your message',
  'tell them this is worth passing to Anna, the developer (name her exactly that way: "Anna, the developer"), then end your message')

# ---------------- P6: recording minutes are "minutes" ----------------
E(NOTES, '"Your time will show up here in a moment."', '"Your minutes will show up here in a moment."')
E(NOTES, '{capOpen ? "You\'ve used this month\'s free recording time" : "Get more recording time"}',
  '{capOpen ? "You\'ve used this month\'s free recording minutes" : "Get more recording minutes"}')
E(NOTES, 'You can buy extra time.', 'You can buy extra minutes.')
E(NOTES, ' A paid version with more recording time is coming.', ' A paid version with more recording minutes is coming.')
E(NOTES, 'Extra time you buy is used after those, and it never expires.', 'Extra minutes you buy are used after those, and they never expire.')
E(NOTES, 'This recording went past your recording time,', 'This recording went past your recording minutes,')
E(NOTES, '", or as soon as you get more time."', '", or as soon as you get more minutes."')
E(NOTES, '>Get more time</Button>', '>Get more minutes</Button>')

# ---------------- P7: calendars are "brought in" ----------------
E(C + 'shared/AppGuideModal.jsx', 'Sync any calendar on your phone to add its tasks and events here.',
  'Bring in any calendar on your phone to add its tasks and events here.')
E(CAL, "'Calendar access was turned off. Allow it again to sync.'", "'Calendar access was turned off. Allow it again to bring your calendars in.'")
E(CAL, '`Sync failed: ${err?.message || err}`', "`Couldn't bring your calendars in: ${err?.message || err}`")
E(CAL, "{busy ? 'Syncing…' : 'Sync now'}", "{busy ? 'Bringing in…' : 'Bring in now'}")
E(CAL, '`${chosenNames.length} of ${calendars.length} syncing`', '`${chosenNames.length} of ${calendars.length} brought in`')
E(CAL, "'A sync is already running.'", "'Already bringing them in.'")
E(CAL, '`Imported ${result.created ?? 0}, updated', '`Brought in ${result.created ?? 0}, updated')
E(CAL, 'Last synced {new Date(lastSynced).toLocaleString()}', 'Last brought in {new Date(lastSynced).toLocaleString()}')

# ---------------- run ----------------
files = {}
problems = []
for path, old, new, n, is_re in EDITS:
    if path not in files:
        try:
            files[path] = io.open(path, encoding='utf-8').read()
        except Exception as e:
            problems.append(f'CANNOT READ {path}: {e}')
            files[path] = None
    txt = files[path]
    if txt is None:
        continue
    if is_re:
        found = len(re.findall(old, txt))
        if found != n:
            problems.append(f'{path}: regex found {found}, wanted {n}: {old[:70]!r}')
            continue
        files[path] = re.sub(old, new, txt)
    else:
        found = txt.count(old)
        if found != n:
            problems.append(f'{path}: found {found}, wanted {n}: {old[:90]!r}')
            continue
        files[path] = txt.replace(old, new)

print(f'{len(EDITS)} edits over {len(files)} files; problems: {len(problems)}')
for p in problems:
    print('  ' + p)
if problems:
    sys.exit(1)
if DRY:
    print('dry run: nothing written')
else:
    for path, txt in files.items():
        io.open(path, 'w', encoding='utf-8', newline='').write(txt)
    print('written')
