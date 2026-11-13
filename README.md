# apexssWebsite

apexss.com website: a static site (no build step) deployed to GitHub Pages.

## Pages

- `index.html`: hero, the three studios, an interactive demo (educational game + console), process, call to action
- `services.html`: overview of the three studios
- `software.html`: Software & Cloud
- `ai.html`: AI & Hardware
- `studio.html`: Apex Studio
- `about.html`, `careers.html`, `contact.html`

The service pages are a single pinned screen: scrolling (or clicking) steps through the services while each
one assembles in 3D from an exploded view.

## Code

- `styles.css`: all styling, including bright (default) and dark mode
- `js/ui.js`: preloader, navigation and mega menu, service explorer, demos, forms
- `js/careers.js`: open and filled positions, and where applications are sent
- `js/scene.js`: renderer, lighting, camera stations, scroll choreography
- `js/world.js`: the world around the mainboard: studio lighting, racks, laptop, tablet, phone, cables
- `js/pcb.js`: the board layout and its printed artwork (traces, pads, silkscreen), painted as colour, relief and surface maps
- `js/parts.js`: everything mounted on the board: processor and socket, heatsinks, memory, graphics card, connectors, small parts
- `js/geo.js`: shared geometry helpers (soft-edged boxes, extruded profiles, lathed parts, fan blades)
- `js/finish.js`: surface finishes (brushed metal, moulded plastic) and the height-to-normal conversion
- `js/forge.js`: the turntable stage and one 3D build per service
- `js/art.js`: the interface designs shown on the build screens
- `js/screens.js`: the live laptop/tablet/phone screens and the Apex logo
- `vendor/`: three.js r170 and its post-processing add-ons (MIT), vendored so the site has no CDN dependency

## How the 3D scene is driven

Each `<section>` opts in with:

- `data-shape`: the camera station: `cpu`, `board`, `skyline`, `bus`, `server`, `rack`, `gpu`, `laptop`, `tablet`, `phone`, `studio`, `forge`, `dive`
- `data-pos`: where the subject sits on screen: `left`, `right`, `center`
- `data-dim`: optional scene brightness from 0 to 1, for sections with content on top

In a service explorer, each `<li class="svc">` names its build with `data-build` (a key in `js/forge.js`) and its
colour with `data-tone` (`blue`, `green`, `orange`).

## Careers

Edit `js/careers.js`. Set a job's `status` to `open` to list it with an Apply button, or `filled` to show it as closed.

Applications are emailed to the address in `APPLY_TO`, with the resume attached. A static page cannot send an
email with an attachment by itself, so the form posts to [FormSubmit](https://formsubmit.co), which forwards the
answers and the uploaded file to that address:

- The first application ever submitted makes FormSubmit send a one-time activation link to the address. Click it
  once. Until then, applications are not delivered.
- After activation FormSubmit sends a random-looking alias that can replace the address in `APPLY_TO`, which keeps
  the address out of the page source.
- Applicants pass FormSubmit's "I am not a robot" check (Google reCAPTCHA), then land back on the Careers page with a
  confirmation. The check is on by default. Do not add a `_captcha` field to the form: setting it to `false` is how the
  check gets switched off.
- Uploads are limited to 10 MB.

If `APPLY_TO` is empty, the form falls back to opening the applicant's own email app.

## Logo

The APEX wordmark is drawn from path data traced from the company logo (`LOGO` in each page, `LOGO` in `js/screens.js`).
Replace it with the original vector artwork when available.

## Local preview

The scripts are ES modules, so open the site through a local server rather than from the file system:

```
python -m http.server 8000
```

Then visit http://localhost:8000.
