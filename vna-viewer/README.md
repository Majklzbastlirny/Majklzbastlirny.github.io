# NanoVNA Viewer

A single-file, zero-dependency web viewer for Touchstone `.s1p` / `.s2p` files from a
NanoVNA. No build step, no CDN, no server-side code — `index.html` is the whole app.

## Using it

Open `index.html` in a browser, then either:

- **Drag and drop** `.s1p` / `.s2p` files anywhere on the page, or
- press **Open files**, or
- press **Samples** to pick from the bundled `Samples/` sweeps *(needs a web server — see below)*.

Load as many files as you like; each becomes a trace you can show, hide, or remove.
Traces are identified by full filename, so `SJ000001.s1p` and `SJ000001.s2p` stay separate
— on a NanoVNA they are usually different sweeps.

### Views

| View | Shows |
|---|---|
| **Return loss** | S11 magnitude in dB |
| **SWR** | Standing wave ratio from S11 |
| **Impedance** | R (solid) and X (dashed) in Ω, referred to the file's own Z₀ |
| **S11 phase** | Reflection phase in degrees |
| **\|S21\|** | Transmission magnitude in dB |
| **S21 phase** | Transmission phase in degrees |
| **Group delay** | −dφ/dω of S21, in ns, from unwrapped phase |
| **Smith chart** | S11 on a standard Smith chart (checkbox in the toolbar) |

### Markers and readout

- **Type a frequency** — `868`, `868 MHz`, `868M`, `0.868 GHz` and `8.68e8` all work.
  A bare number under 100 000 is read as MHz.

  Sweep spans in the capture and calibration dialogs have a **unit dropdown** (Hz / kHz /
  MHz / GHz, defaulting to MHz), so those are plain numbers — `800` and `900` rather than
  `800 MHz`. Switching the unit re-expresses the value rather than reinterpreting the
  digits, and does not count as editing the sweep, so it never triggers a retune on its
  own. Typing an explicit unit into the box still overrides the dropdown.

### Decimal commas and digit grouping

Comma decimals and grouped digits are accepted everywhere a frequency is typed, so a
comma-decimal keyboard needs no translation:

| Typed | Read as | Rule |
|---|---|---|
| `1.234` | 1.234 | dot decimal |
| `1,234` | 1.234 | single comma → decimal |
| `1,5` | 1.5 | single comma → decimal |
| `1 234` | 1234 | spaces are grouping |
| `1,234,567` | 1234567 | several commas → grouping |
| `1.234,5` | 1234.5 | both present → the **last** separator is the decimal one |
| `1,234.5` | 1234.5 | likewise |
| `8.68e8` | 868000000 | exponent notation still works |

`1,234` is the one genuinely ambiguous case — it is a valid decimal *and* a valid thousands
group, and no rule can settle it. It is read as a **decimal point**, and the dialogs print
the resolved span live underneath the fields (`→ 1.234 MHz to 1.5 MHz · 201 points`),
turning amber with a note whenever that ambiguity is in play. So the interpretation is
always visible before you capture or calibrate rather than discovered afterwards.
- **Click the chart** to place the marker; **hover** for a live cursor readout.
- **Snap to** jumps the marker to the minimum return loss, minimum SWR, or peak \|S21\|
  across the visible traces.

The table under the chart shows, per trace, the values at the marker plus a summary row:
best match frequency, its SWR, and the −10 dB bandwidth around it.

### Axes

- **X**: linear or logarithmic. Use log for wide sweeps — a 10 kHz–4.4 GHz sweep is
  unreadable on a linear axis.
- **Y**: auto or manual min/max, plus an optional dashed **limit line** (e.g. `-10` on
  return loss, or `2` on SWR).
- **Drag horizontally** on the chart to zoom into a frequency range; **double-click** to reset.

### Export

**CSV** writes every visible trace point-by-point (frequency, raw S11/S21 real and
imaginary, dB, SWR, R, X). **PNG** saves the current chart(s) at screen resolution.

## What it does with NanoVNA quirks

- **`.s2p` files are forward-only.** The NanoVNA measures S11 and S21 but writes all four
  parameters, filling S12 and S22 with zeros. The viewer detects that and labels them
  *not measured* rather than plotting them as −∞ dB.
- **\|Γ\| can exceed 1** on an uncalibrated or noisy sweep. SWR is then reported as `∞`
  and pegged to the top of the axis instead of blowing up the scale; R may go negative
  and is shown as measured. Such points fall outside the Smith chart's unit circle and
  are drawn there rather than clipped.
- **A covered / unterminated S21 port** produces noise, sometimes above 0 dB. It is
  plotted as recorded — the viewer does not guess which sweeps are meaningful.

Touchstone v1 is supported for 1- and 2-port S-parameters: `Hz/kHz/MHz/GHz`, `RI/MA/DB`,
any `R <z0>`, `!` comments, and records split across lines. Files with 3 or more ports are
rejected, and a file declaring Y/Z/H/G parameters is read as S-parameters with a warning.

## Capturing straight from the VNA

Press **Capture from VNA** to pull a sweep off the device over USB and plot it immediately —
no bootloader mode, no copying files. Connect once, pick the device in the browser's port
prompt, then **Capture sweep**.

The dialog shows the sweep currently on the device, re-read each time you open it. Tick
**Also capture S21** for a 2-port capture. The sweep is paused while the arrays are read
and resumed afterwards, so S11 and S21 come from the same pass.

### Presets and calibration

A NanoVNA calibration is only valid for the frequency plan it was made on, so **changing
the span invalidates it**. The dialog gives you the two options honestly:

- **Preset** — pick one of the device's saved slots. Recalling a slot restores its
  calibration *together with* its frequency plan, so the capture is corrected. This is the
  right way to capture a different span. The slot list is read from the device (and shows
  which slots are empty); choosing one locks the manual fields, because the slot defines them.
- **Current device state** — capture what is on screen. You may edit start / stop / points
  here, which retunes the VNA with `sweep`. That moves the frequencies but leaves the old
  calibration in place, so the result is **not corrected** at the new span. The dialog warns
  you in amber when you do this, and the warning is written into the captured file too.

### Calibrating from the browser

**Calibrate…** in the capture dialog walks through a calibration over serial. You still
swap the standards by hand — the wizard prompts and records each one.

1. **Set the span.** A calibration is only valid for the frequency plan it was made on, so
   the wizard asks for start / stop / points first and retunes the device if you change them.
   Frequencies are plain numbers with a unit dropdown beside them (MHz by default).
2. **Choose whether to include THRU.** OPEN, SHORT and LOAD are always measured; **THRU is
   optional** and only needed if you want corrected S21.
3. **Measure each standard.** Connect it, press Measure, repeat. The sweep is left running
   and a full pass is allowed to complete before each standard is recorded.
4. **Choose how to keep it:**
   - *Keep in working state only* — nothing is written to your slots, and **no `save`
     command is sent at all**. The calibration is lost at the next preset recall or power-off.
   - *Save to a preset slot* — persists it, and **overwrites whatever that slot holds**.

Saving is deliberately awkward. The dialog names what the chosen slot currently contains,
the first press only *arms* the button (it turns red and reads "Yes — overwrite slot N"),
and changing the slot disarms it again. There is no undo on the device.

`cal reset` is not sent until you press Measure on the first standard, so backing out of
the setup screen destroys nothing. If you cancel part-way through, the working calibration
is left incomplete — recall a preset to get a known-good one back.

Every capture records its provenance as comments in the Touchstone file, so you can tell
months later whether a sweep was corrected:

```
!File created by NanoVNA-F V2
!Captured over Web Serial 2026-09-18 15:33:10
!Recalled preset slot 3 (50 MHz - 150 MHz)
!Calibration: load open short thru cal'ed
```

or, after a manual retune:

```
!Calibration: load open short cal'ed
!WARNING: sweep retuned after calibration — data is not corrected at these frequencies
```

The viewer never writes to your slots — it only reads the list and recalls. Note that a
recall also replaces the device's current working state, so an unsaved calibration or point
count is lost (the slot's own point count applies).

Captured traces get a **⭳** button in the trace list that saves them as a real `.s1p` /
`.s2p` file, so a capture can still be archived.

This uses the **Web Serial API**: Chrome or Edge, over `https://` or `localhost`. It is not
available in Firefox or Safari, nor on a `file://` page — in those cases the button explains
itself and `capture-nanovna.ps1` below does the same job from PowerShell.

## How that works (and what is not possible)

**The files saved on the device cannot be read over serial — but live sweeps can, which is
what the capture button uses.**

The NanoVNA-F V2 (firmware 0.6.0) exposes a USB CDC console — an `STMicroelectronics
Virtual COM Port`, VID `0483` / PID `5740`, at 115200 baud, `\r`-terminated commands,
`ch>` prompt. Its full command set is:

```
help  reset  cwfreq  saveconfig  clearconfig  data  frequencies  scan  sweep
touchcal  touchtest  pause  resume  cal  save  recall  trace  marker  edelay
pwm  beep  lcd  capture  version  info  SN  resolution  LCD_ID  vbat
```

There is **no filesystem command** — no `sd_list`, `sd_read`, `ls` or `cat`. `save` and
`recall` take a slot id and store calibration/setup, not `.s1p` files. So the `SJ00000n`
files on internal storage are still only reachable in USB mass-storage (bootloader) mode.

What *is* available is the current sweep:

| Command | Returns |
|---|---|
| `frequencies` | one frequency in Hz per line |
| `data 0` | S11 as `real imag` per line |
| `data 1` | S21 as `real imag` per line |
| `sweep` | current `start stop points` |
| `sweep <start> <stop> <points>` | retunes (all three are honoured); replies with nothing |
| `recall` | **lists the saved slots without loading any** — `0:   800 MHz -   900 MHz`, `5: NULL` |
| `recall <id>` | loads that slot: frequency plan **and** its calibration |
| `cal` | calibration status, e.g. `load open short cal'ed` or `load open short thru cal'ed` |
| `cal reset` / `open` / `short` / `load` / `thru` / `done` | drives a calibration; standards are connected by hand |
| `cal on` / `cal off` | enables / disables correction |
| `info` / `version` / `SN` / `vbat` | device identity and battery |

The `cal` subcommands are genuinely live over serial on this firmware, not inherited stubs.
Measured against the whip antenna: `cal off` changed the returned S11 by **0.353** mean
complex magnitude while pass-to-pass noise was **0.0017** — roughly 200× — and `cal on`
returned it to 0.0017 of baseline. Note `cal` reports which standards are stored, so its
output does *not* change when correction is toggled off; only the data does.

`save` with no argument also just lists the slots. **`save <id>` overwrites a slot** — it
is sent only by the calibration wizard, and only after an explicit armed confirmation.

That is everything needed to build a Touchstone file. The **Capture from VNA** button does
this in the browser; `capture-nanovna.ps1` does the same from PowerShell, which is useful
for scripting or from a browser without Web Serial:

```powershell
.\capture-nanovna.ps1                                    # current sweep -> Samples\capture-<timestamp>.s1p
.\capture-nanovna.ps1 -TwoPort -Out ant868.s2p           # include S21
.\capture-nanovna.ps1 -Start 860e6 -Stop 876e6 -Points 201 -Out band868.s1p
```

If PowerShell blocks the script on first run, either unblock it once with
`Unblock-File .\capture-nanovna.ps1`, or run it as
`powershell -ExecutionPolicy Bypass -File .\capture-nanovna.ps1 -TwoPort`.

The script sends `pause` before reading and `resume` afterwards (including if it fails
part-way), so S11 and S21 come from the same sweep pass rather than two different ones.
The `-Start/-Stop/-Points` form **retunes the VNA itself** before capturing; without those
it reads whatever sweep the device is already showing and changes nothing else. Use `-Port`
if it is not on `COM4`. Only one program can hold the port, so close NanoVNA-Saver or any
terminal first.

The output uses the same format as the device's own files — identical `# Hz S RI R 50`
header, column layout and zero-filled S12/S22 — plus one extra `!` comment recording the
capture time, so it loads in the viewer like any other sweep.

## Deploying to GitHub Pages

```bash
git init
git add .
git commit -m "NanoVNA viewer"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

Then in the repository: **Settings → Pages → Source: Deploy from a branch → `main` / `/ (root)`**.
The site appears at `https://<you>.github.io/<repo>/` within a minute or so.

Everything is served as static files and all paths are relative, so it also works from a
subdirectory, from S3, or from any other static host.

### Two things to watch

**`Samples/` is case-sensitive on GitHub Pages.** The folder here is capital-S `Samples`
and `index.html` fetches `Samples/index.json`. Linux servers will not silently correct a
rename to `samples/` the way Windows does.

**The sample list is a manifest, not a directory listing.** A browser cannot list a remote
folder, so `Samples/index.json` holds the filenames. Regenerate it whenever you add or
remove sample files:

```bash
node make-manifest.js
```

Your own measurements do not need the manifest at all — drag and drop always works.

## Running locally

The **Samples** button uses `fetch()`, which browsers block on `file://` URLs. Opening
`index.html` directly works for everything else, but to use the sample picker, serve the
folder:

```bash
python -m http.server 8765
```

Then open `http://localhost:8765`.

## Files

```
index.html           the entire application
Samples/             example sweeps
Samples/index.json   manifest listing the sample filenames
make-manifest.js     regenerates Samples/index.json
capture-nanovna.ps1  pulls a live sweep off the VNA over USB serial
```
