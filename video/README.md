# Commons videos

Two submission videos, each made with one command.

## Demo video (about 2½ minutes, screen recording)

```sh
./record-demo.sh
```

What it records, with no hands on the keyboard:

1. interactiveapps.net in Safari
2. Terminal: a real compute job on Solana devnet, posted, drawn to three providers and
   settled at the clearing price (`commons-token/scripts/demo-live.mjs`)
3. That settlement transaction in Solana Explorer
4. The Commons app driving itself (`--demo`): it buys Pixel Forge with CMN, verifies and
   installs it, gets Ledger Lens, opens it in its own window, and shows the wallet, with
   captions. It uses a fresh wallet funded from yours, so every run can buy.
5. Back to the website

Only the demo's own windows are recorded: a new Safari window, a new Terminal window and
the Commons app. `rec.swift` (ScreenCaptureKit) leaves out every other app, the desktop,
the menu bar, the Dock and the pointer, even when something covers the demo windows. The
windows sit on a dark backdrop in a 1920×1080 frame, and recording stops as soon as the
demo ends. Saved to the Desktop as `Commons-demo-<date>.mp4`.

Keep hands off the demo windows while it runs; using other apps doesn't show up.

First run: macOS may ask to let Terminal record the screen and control Safari and
Terminal. Allow it (System Settings → Privacy & Security → Screen & System Audio Recording
/ Automation), quit and reopen Terminal, and run it again. If something goes wrong, the
recorder's log is `.work/rec.log`.

Each run uses about 0.1 devnet SOL and 15 CMN from your wallet.

## Pitch video (2 minutes 9 seconds, animation and narration)

```sh
./make-pitch.sh
```

`pitch/pitch-silent.mp4` is the rendered animation (1920×1080, 30 fps, subtitles included).
The script narrates it with macOS text-to-speech and saves `Commons-pitch-<date>.mp4` to the
Desktop. For a more natural voice, install one (System Settings → Accessibility → Spoken
Content → System voice → Manage Voices) and run `VOICE="Ava (Premium)" ./make-pitch.sh`.

The film's source is `pitch/source/pitch.html`: scenes, timings and narration in one file.
