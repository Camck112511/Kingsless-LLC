# Brand assets

Source files supplied by the owner: the **official logo** (transparent PNG; gold XL monogram, black wordmark) and the **brand render** (the same logo embossed on a black card, silver wordmark).

Two looks, one brand:

* **Public website** is corporate: white in light mode and neutral grey in dark mode (it follows the visitor's device setting). The **header bar** is white (light) or grey `#b4b7be` (dark) so the official logo's **black letters** stay readable (about 10:1 contrast).
* **Console (/admin)** keeps the black-and-gold look in both modes. It is switched on by a `data-theme="console"` element in the admin layouts (see `globals.css`).

The official logo's wordmark is black, so it disappears on a dark page. Where the logo sits on a dark surface (the charcoal footer, the console), the files below use the silver lettering from the brand render (and, in the console, pair it with the official gold monogram). Nothing was redrawn: both parts are the owner's own pixels.

| File | Use |
| --- | --- |
| `public/brand/wordmark.webp` (+ `.png`) | **Public site header.** The official logo's black lettering only (no monogram), cut from the supplied file with its original pixels. Needs the white / grey header bar |
| `public/brand/wordmark-silver.webp` | The same lettering in silver (from the brand render) for the charcoal footer |
| `public/brand/logo-official.webp` | The full official logo (monogram + black letters) exactly as supplied. Not used on the site now; for documents and print |
| `public/brand/logo-dark.webp` | Full lockup (monogram + silver wordmark) for dark backgrounds: footer, console sign-in |
| `public/brand/mark.webp` | Gold XL monogram only: console navigation |
| `public/brand/brand-card.jpg` | The embossed black-card render, cropped. Not currently used on a page; kept for the console or print |
| `public/brand/logo-official.png` | Same as the `.webp`, lossless PNG, for documents, invoices and print |
| `src/app/icon.png`, `src/app/apple-icon.png` | Favicon and phone home-screen icon (monogram on near-black) |
| `src/app/opengraph-image.png` | Link preview when the site is shared (1200 × 630) |

Colors (in `src/app/globals.css`): console background `#0b0b0d` with gold `#d9a441`; public light `#ffffff` / charcoal text `#14161c` / gold `#8a5d0c`; public dark `#1b1d21`; gold gradient `#f0c55b` to `#b5791f`.

A vector (SVG) version of the logo would make the header and favicon crisper at every size. If one exists, send it and swap it in.
